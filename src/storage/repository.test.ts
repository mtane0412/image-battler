/**
 * @file キャラクター永続化リポジトリ(repository.ts)のテストです。
 * localStorage への保存・読込・削除と、壊れたデータや容量超過時の
 * Fail-Fast なエラー処理を検証します。
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  STORAGE_KEY,
  StorageError,
  deleteCharacter,
  loadCharacters,
  saveCharacter,
} from "./repository";
import { makeCharacter } from "../testing/fixtures";

beforeEach(() => {
  localStorage.clear();
});

describe("saveCharacter / loadCharacters", () => {
  it("保存したキャラクターを読み出せる", () => {
    const character = makeCharacter({ id: "id-もふ吉", name: "もふ吉" });
    saveCharacter(character);
    expect(loadCharacters()).toEqual([character]);
  });

  it("複数のキャラクターは保存した順に並ぶ", () => {
    saveCharacter(makeCharacter({ id: "id-1", name: "もふ吉" }));
    saveCharacter(makeCharacter({ id: "id-2", name: "がぶ太" }));
    expect(loadCharacters().map((c) => c.name)).toEqual(["もふ吉", "がぶ太"]);
  });

  it("保存データがない場合は空配列を返す", () => {
    expect(loadCharacters()).toEqual([]);
  });
});

describe("deleteCharacter", () => {
  it("指定したIDのキャラクターだけを削除する", () => {
    saveCharacter(makeCharacter({ id: "id-1", name: "もふ吉" }));
    saveCharacter(makeCharacter({ id: "id-2", name: "がぶ太" }));
    deleteCharacter("id-1");
    expect(loadCharacters().map((c) => c.id)).toEqual(["id-2"]);
  });
});

describe("異常系(Fail-Fast)", () => {
  it("壊れたJSONが保存されている場合はStorageErrorを投げる", () => {
    localStorage.setItem(STORAGE_KEY, "{壊れたデータ");
    expect(() => loadCharacters()).toThrow(StorageError);
  });

  it("配列以外のJSONが保存されている場合はStorageErrorを投げる", () => {
    localStorage.setItem(STORAGE_KEY, '{"name":"もふ吉"}');
    expect(() => loadCharacters()).toThrow(StorageError);
  });

  it("容量超過などで保存に失敗した場合はStorageErrorを投げる", () => {
    const quotaExceededStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      },
    } as unknown as Storage;
    expect(() =>
      saveCharacter(makeCharacter(), quotaExceededStorage),
    ).toThrow(StorageError);
  });
});
