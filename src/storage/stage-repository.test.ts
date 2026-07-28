/**
 * @file ステージ永続化リポジトリ(stage-repository.ts)のテストです。
 * localStorage への保存・読込・削除と、壊れたデータ・不正なidの
 * Fail-Fast なエラー処理を検証します。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { StorageError } from "./repository";
import {
  STAGE_STORAGE_KEY,
  deleteStage,
  loadStages,
  saveStage,
} from "./stage-repository";
import { makeStage } from "../testing/fixtures";

beforeEach(() => {
  localStorage.clear();
});

describe("saveStage / loadStages", () => {
  it("保存したステージを読み出せる", () => {
    const stage = makeStage({ id: "id-灼熱の闘技場", name: "灼熱の闘技場" });
    saveStage(stage);
    expect(loadStages()).toEqual([stage]);
  });

  it("複数のステージは保存した順に並ぶ", () => {
    saveStage(makeStage({ id: "id-1", name: "灼熱の闘技場" }));
    saveStage(makeStage({ id: "id-2", name: "極寒の氷原" }));
    expect(loadStages().map((s) => s.name)).toEqual(["灼熱の闘技場", "極寒の氷原"]);
  });

  it("保存データがない場合は空配列を返す", () => {
    expect(loadStages()).toEqual([]);
  });

  it("saveStageはバージョン付きの形式で保存する", () => {
    saveStage(makeStage({ id: "id-1" }));
    const raw = localStorage.getItem(STAGE_STORAGE_KEY);
    expect(JSON.parse(raw ?? "")).toMatchObject({ version: 1 });
  });
});

describe("deleteStage", () => {
  it("指定したIDのステージだけを削除する", () => {
    saveStage(makeStage({ id: "id-1", name: "灼熱の闘技場" }));
    saveStage(makeStage({ id: "id-2", name: "極寒の氷原" }));
    deleteStage("id-1");
    expect(loadStages().map((s) => s.id)).toEqual(["id-2"]);
  });
});

describe("異常系(Fail-Fast)", () => {
  it("壊れたJSONが保存されている場合はStorageErrorを投げる", () => {
    localStorage.setItem(STAGE_STORAGE_KEY, "{壊れたデータ");
    expect(() => loadStages()).toThrow(StorageError);
  });

  it("未対応のバージョンはStorageErrorを投げる", () => {
    localStorage.setItem(
      STAGE_STORAGE_KEY,
      JSON.stringify({ version: 99, stages: [] }),
    );
    expect(() => loadStages()).toThrow(StorageError);
  });

  it("配列でもバージョン付き形式でもないJSONの場合はStorageErrorを投げる", () => {
    localStorage.setItem(STAGE_STORAGE_KEY, '{"name":"灼熱の闘技場"}');
    expect(() => loadStages()).toThrow(StorageError);
  });

  it("特性idがSTAGE_TRAIT_IDSに含まれない場合はStorageErrorを投げる", () => {
    // エンジンの switch/テーブル参照キーになるため、緩い検証だと将来のリネームで
    // 未定義参照事故になる。保存データの段階で厳密に検証する
    const stage = makeStage({ id: "id-1" });
    const corrupted = {
      ...stage,
      trait: { ...stage.trait, id: "unknown-trait" },
    };
    localStorage.setItem(
      STAGE_STORAGE_KEY,
      JSON.stringify({ version: 1, stages: [corrupted] }),
    );
    expect(() => loadStages()).toThrow(StorageError);
  });

  it("イベントidがSTAGE_EVENT_IDSに含まれない場合はStorageErrorを投げる", () => {
    const stage = makeStage({ id: "id-1" });
    const corrupted = {
      ...stage,
      event: { ...stage.event, id: "unknown-event" },
    };
    localStorage.setItem(
      STAGE_STORAGE_KEY,
      JSON.stringify({ version: 1, stages: [corrupted] }),
    );
    expect(() => loadStages()).toThrow(StorageError);
  });

  it("容量超過などで保存に失敗した場合はStorageErrorを投げる", () => {
    const quotaExceededStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      },
    } as unknown as Storage;
    expect(() => saveStage(makeStage(), quotaExceededStorage)).toThrow(
      StorageError,
    );
  });
});
