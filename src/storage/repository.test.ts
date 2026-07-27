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

describe("旧形式データの自動移行", () => {
  /**
   * MP・必殺技タイプ・パッシブ導入前(v0.1.0)に保存されたキャラクターです。
   * mp / specialMove.type / specialMove.mpCost / specialMove.ailment / passive
   * を持ちません。
   */
  const 旧形式キャラ = {
    id: "id-旧もふ吉",
    name: "旧もふ吉",
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
    imageDataUrl: "data:image/jpeg;base64,dGVzdA==",
    createdAt: "2026-07-01T00:00:00.000Z",
  };

  it("旧形式キャラクターには新フィールドのデフォルト値が補完される", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([旧形式キャラ]));
    const [migrated] = loadCharacters();
    // 既存のフィールドはそのまま保持される
    expect(migrated?.name).toBe("旧もふ吉");
    expect(migrated?.specialMove.name).toBe("爪とぎクラッシュ");
    expect(migrated?.specialMove.power).toBe(60);
    // 新フィールドがデフォルト値で補完される
    expect(migrated?.mp).toBe(50);
    expect(migrated?.specialMove.type).toBe("attack");
    expect(migrated?.specialMove.mpCost).toBe(30);
    expect(migrated?.specialMove.ailment).toBeNull();
    expect(migrated?.passive).toBeNull();
  });

  it("新形式キャラクターは変更されずそのまま読み出せる", () => {
    const character = makeCharacter({
      id: "id-新がぶ太",
      name: "新がぶ太",
      mp: 80,
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify([character]));
    expect(loadCharacters()).toEqual([character]);
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
