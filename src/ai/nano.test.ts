/**
 * @file Gemini Nano ラッパー(nano.ts)のテストです。
 * Prompt API(LanguageModel グローバル)をモックし、可用性チェック・
 * キャラクター生成(パッシブ候補の抽選込み)・実況生成の呼び出しを検証します。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GeminiNanoUnavailableError,
  checkNanoAvailability,
  createCharacterGenerationSession,
  generateBattleStory,
  generateCharacterStats,
  generateSpecialMoveSpeech,
  narrateOnce,
} from "./nano";
import { sequenceRng } from "../testing/fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 正常なモデル出力(JSON文字列)を返します。 */
function validStatsJson(): string {
  return JSON.stringify({
    hp: 100,
    mp: 60,
    attack: 40,
    defense: 20,
    speed: 50,
    luck: 30,
    title: "深淵の眠り猫",
    description: "よく寝る猫の戦士です",
    specialMove: {
      name: "爪とぎクラッシュ",
      type: "attack",
      power: 60,
      mpCost: 30,
      ailment: "none",
      description: "鋭い爪で連続攻撃を繰り出す",
    },
    passive: {
      // 乱数0の抽選候補(crit-master / ailment-guard / endure)の先頭を選んだ想定
      id: "crit-master",
      name: "猫の反射神経",
      description: "会心の爪が急所をとらえる",
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

    // 乱数0を注入すると候補は [crit-master, ailment-guard, endure] になる
    const stats = await generateCharacterStats(
      session,
      "もふ吉",
      image,
      sequenceRng([0, 0, 0]),
    );

    expect(stats.title).toBe("深淵の眠り猫");
    expect(stats.passive.id).toBe("crit-master");
    const [messages, options] = prompt.mock.calls[0] as [
      LanguageModelMessage[],
      LanguageModelPromptOptions,
    ];
    expect(options.responseConstraint).toBeDefined();
    const content = messages[0]?.content as LanguageModelMessageContent[];
    expect(content.some((c) => c.type === "image")).toBe(true);
    expect(JSON.stringify(messages)).toContain("もふ吉");
  });

  it("抽選したパッシブ候補がプロンプトとresponseConstraintの両方に反映される", async () => {
    const prompt = vi.fn().mockResolvedValue(validStatsJson());
    const session = { prompt } as unknown as LanguageModelSession;
    const image = new Blob(["dummy"], { type: "image/jpeg" });

    await generateCharacterStats(session, "もふ吉", image, sequenceRng([0, 0, 0]));

    const [messages, options] = prompt.mock.calls[0] as [
      LanguageModelMessage[],
      LanguageModelPromptOptions,
    ];
    // プロンプトには抽選候補の3種だけが提示され、候補外のidは含まれない
    const promptText = JSON.stringify(messages);
    expect(promptText).toContain("crit-master");
    expect(promptText).toContain("ailment-guard");
    expect(promptText).toContain("endure");
    expect(promptText).not.toContain("mp-boost");
    // JSON Schema の enum も抽選候補に制約される
    const constraint = options.responseConstraint as {
      properties: { passive: { properties: { id: { enum: string[] } } } };
    };
    expect(constraint.properties.passive.properties.id.enum).toEqual([
      "crit-master",
      "ailment-guard",
      "endure",
    ]);
  });

  it("候補にないパッシブidをモデルが返した場合はエラーになる(Fail-Fast)", async () => {
    // 乱数0.99の抽選候補は [first-strike, evasion, berserk]。
    // モデル出力(crit-master)は候補外のため拒否される
    const prompt = vi.fn().mockResolvedValue(validStatsJson());
    const session = { prompt } as unknown as LanguageModelSession;
    const image = new Blob(["dummy"], { type: "image/jpeg" });

    await expect(
      generateCharacterStats(session, "もふ吉", image, sequenceRng([0.99, 0.99, 0.99])),
    ).rejects.toThrow(/id/);
  });
});

describe("generateBattleStory", () => {
  it("セッションを作成して前口上を生成し、セッションを破棄する", async () => {
    const destroy = vi.fn();
    const prompt = vi
      .fn()
      .mockResolvedValue("  満月の夜、二人の戦士が相まみえる。  \n");
    const create = vi.fn().mockResolvedValue({ prompt, destroy });
    vi.stubGlobal("LanguageModel", { availability: vi.fn(), create });

    const story = await generateBattleStory("前口上を書いて");

    expect(story).toBe("満月の夜、二人の戦士が相まみえる。");
    expect(prompt).toHaveBeenCalledWith("前口上を書いて");
    expect(destroy).toHaveBeenCalled();
  });

  it("生成に失敗してもセッションは破棄される", async () => {
    const destroy = vi.fn();
    const prompt = vi.fn().mockRejectedValue(new Error("生成失敗"));
    const create = vi.fn().mockResolvedValue({ prompt, destroy });
    vi.stubGlobal("LanguageModel", { availability: vi.fn(), create });

    await expect(generateBattleStory("前口上を書いて")).rejects.toThrow(
      "生成失敗",
    );
    expect(destroy).toHaveBeenCalled();
  });

  it("LanguageModelが存在しない場合はGeminiNanoUnavailableErrorを投げる", async () => {
    vi.stubGlobal("LanguageModel", undefined);
    await expect(generateBattleStory("前口上を書いて")).rejects.toThrow(
      GeminiNanoUnavailableError,
    );
  });
});

describe("generateSpecialMoveSpeech", () => {
  it("セッションを作成してセリフを生成し、セッションを破棄する", async () => {
    const destroy = vi.fn();
    const prompt = vi.fn().mockResolvedValue("  月夜の爪を見るがいい!  \n");
    const create = vi.fn().mockResolvedValue({ prompt, destroy });
    vi.stubGlobal("LanguageModel", { availability: vi.fn(), create });

    const speech = await generateSpecialMoveSpeech("決めゼリフを書いて");

    expect(speech).toBe("月夜の爪を見るがいい!");
    expect(prompt).toHaveBeenCalledWith("決めゼリフを書いて");
    expect(destroy).toHaveBeenCalled();
  });

  it("生成に失敗してもセッションは破棄される", async () => {
    const destroy = vi.fn();
    const prompt = vi.fn().mockRejectedValue(new Error("生成失敗"));
    const create = vi.fn().mockResolvedValue({ prompt, destroy });
    vi.stubGlobal("LanguageModel", { availability: vi.fn(), create });

    await expect(generateSpecialMoveSpeech("決めゼリフを書いて")).rejects.toThrow(
      "生成失敗",
    );
    expect(destroy).toHaveBeenCalled();
  });

  it("LanguageModelが存在しない場合はGeminiNanoUnavailableErrorを投げる", async () => {
    vi.stubGlobal("LanguageModel", undefined);
    await expect(generateSpecialMoveSpeech("決めゼリフを書いて")).rejects.toThrow(
      GeminiNanoUnavailableError,
    );
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
