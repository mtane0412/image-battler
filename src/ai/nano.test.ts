/**
 * @file Gemini Nano ラッパー(nano.ts)のテストです。
 * Prompt API(LanguageModel グローバル)をモックし、可用性チェック・
 * キャラクター生成・実況生成の呼び出しを検証します。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GeminiNanoUnavailableError,
  checkNanoAvailability,
  createCharacterGenerationSession,
  generateCharacterStats,
  narrateOnce,
} from "./nano";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 正常なモデル出力(JSON文字列)を返します。 */
function validStatsJson(): string {
  return JSON.stringify({
    hp: 100,
    attack: 40,
    defense: 20,
    speed: 50,
    luck: 30,
    title: "深淵の眠り猫",
    description: "よく寝る猫の戦士です",
    specialMove: {
      name: "爪とぎクラッシュ",
      power: 60,
      description: "鋭い爪で連続攻撃を繰り出す",
    },
  });
}

describe("checkNanoAvailability", () => {
  it("LanguageModelが存在しないブラウザではunavailableを返す", async () => {
    vi.stubGlobal("LanguageModel", undefined);
    await expect(checkNanoAvailability()).resolves.toBe("unavailable");
  });

  it("LanguageModelが存在する場合はavailability()の結果を返す", async () => {
    vi.stubGlobal("LanguageModel", {
      availability: vi.fn().mockResolvedValue("available"),
      create: vi.fn(),
    });
    await expect(checkNanoAvailability()).resolves.toBe("available");
  });
});

describe("createCharacterGenerationSession", () => {
  it("unavailableの場合はGeminiNanoUnavailableErrorを投げる", async () => {
    vi.stubGlobal("LanguageModel", {
      availability: vi.fn().mockResolvedValue("unavailable"),
      create: vi.fn(),
    });
    await expect(createCharacterGenerationSession()).rejects.toThrow(
      GeminiNanoUnavailableError,
    );
  });

  it("LanguageModelが存在しない場合はGeminiNanoUnavailableErrorを投げる", async () => {
    vi.stubGlobal("LanguageModel", undefined);
    await expect(createCharacterGenerationSession()).rejects.toThrow(
      GeminiNanoUnavailableError,
    );
  });
});

describe("generateCharacterStats", () => {
  it("responseConstraint付きでpromptを呼び、結果をパースして返す", async () => {
    const prompt = vi.fn().mockResolvedValue(validStatsJson());
    const session = { prompt } as unknown as LanguageModelSession;
    const image = new Blob(["dummy"], { type: "image/jpeg" });

    const stats = await generateCharacterStats(session, "もふ吉", image);

    expect(stats.title).toBe("深淵の眠り猫");
    const [messages, options] = prompt.mock.calls[0] as [
      LanguageModelMessage[],
      LanguageModelPromptOptions,
    ];
    expect(options.responseConstraint).toBeDefined();
    const content = messages[0]?.content as LanguageModelMessageContent[];
    expect(content.some((c) => c.type === "image")).toBe(true);
    expect(JSON.stringify(messages)).toContain("もふ吉");
  });
});

describe("narrateOnce", () => {
  it("ベースセッションをcloneして実況を生成し、cloneを破棄する", async () => {
    const destroy = vi.fn();
    const clonePrompt = vi.fn().mockResolvedValue("  なんという一撃だ!  \n");
    const base = {
      clone: vi.fn().mockResolvedValue({ prompt: clonePrompt, destroy }),
    } as unknown as LanguageModelSession;

    const text = await narrateOnce(base, "実況して");

    expect(text).toBe("なんという一撃だ!");
    expect(destroy).toHaveBeenCalled();
  });
});
