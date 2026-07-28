/**
 * @file バトルロイヤル固有の表示ロジック(royale-view.ts)のテストです。
 * カットインの方向・勝敗の正規化・判定負け時の断末魔担当の決定を検証します。
 */
import { describe, expect, it } from "vitest";
import {
  cutinSideFor,
  pickTimeoutDefeatSpeaker,
  royaleLungeOffsetPx,
  royaleOutcome,
} from "./royale-view";
import { makeCharacter } from "../testing/fixtures";

describe("cutinSideFor", () => {
  it("エントリー順の偶数(0始まり)は左から、奇数は右からスライドインする", () => {
    expect(cutinSideFor(0)).toBe("cutin-left");
    expect(cutinSideFor(1)).toBe("cutin-right");
    expect(cutinSideFor(2)).toBe("cutin-left");
    expect(cutinSideFor(3)).toBe("cutin-right");
    expect(cutinSideFor(4)).toBe("cutin-left");
  });
});

describe("royaleOutcome", () => {
  const もふ吉 = makeCharacter({ id: "c1", name: "もふ吉" });
  const がぶ太 = makeCharacter({ id: "c2", name: "がぶ太" });
  const ぴよ助 = makeCharacter({ id: "c3", name: "ぴよ助" });

  it("勝者1人と、それ以外の全員(エントリー順)に正規化する", () => {
    const outcome = royaleOutcome([もふ吉, がぶ太, ぴよ助], "c2");
    expect(outcome).not.toBeNull();
    expect(outcome?.winners).toEqual([がぶ太]);
    expect(outcome?.losers).toEqual([もふ吉, ぴよ助]);
  });

  it("引き分け(winnerId が null)の場合は null を返す", () => {
    expect(royaleOutcome([もふ吉, がぶ太, ぴよ助], null)).toBeNull();
  });

  it("勝者IDが参加者にいない場合はデータ不正なのでエラーになる(Fail-Fast)", () => {
    expect(() => royaleOutcome([もふ吉, がぶ太], "存在しないID")).toThrow(
      /勝者ID/,
    );
  });
});

describe("pickTimeoutDefeatSpeaker", () => {
  const がぶ太 = makeCharacter({ id: "c2", name: "がぶ太" });
  const ぴよ助 = makeCharacter({ id: "c3", name: "ぴよ助" });

  it("敗者の誰も倒れていない(判定負けの)場合は先頭の敗者を返す", () => {
    const speaker = pickTimeoutDefeatSpeaker([がぶ太, ぴよ助], new Set());
    expect(speaker).toBe(がぶ太);
  });

  it("倒れた敗者がいる場合は null を返す(倒れた瞬間に断末魔を語り済みのため)", () => {
    const speaker = pickTimeoutDefeatSpeaker(
      [がぶ太, ぴよ助],
      new Set(["c3"]),
    );
    expect(speaker).toBeNull();
  });

  it("敗者がいない場合は null を返す", () => {
    expect(pickTimeoutDefeatSpeaker([], new Set())).toBeNull();
  });
});

describe("royaleLungeOffsetPx", () => {
  it("対象が右側にいる場合は正の値(右へ突進)を返す", () => {
    const もふ吉Rect = { left: 0, width: 100 };
    const がぶ太Rect = { left: 300, width: 100 };
    expect(royaleLungeOffsetPx(もふ吉Rect, がぶ太Rect)).toBeGreaterThan(0);
  });

  it("対象が左側にいる場合は負の値(左へ突進)を返す", () => {
    const もふ吉Rect = { left: 300, width: 100 };
    const がぶ太Rect = { left: 0, width: 100 };
    expect(royaleLungeOffsetPx(もふ吉Rect, がぶ太Rect)).toBeLessThan(0);
  });

  it("対象が真上/真下など中心のX座標が一致する場合は右へ突進する", () => {
    const もふ吉Rect = { left: 100, width: 100 };
    const がぶ太Rect = { left: 100, width: 100 };
    expect(royaleLungeOffsetPx(もふ吉Rect, がぶ太Rect)).toBeGreaterThan(0);
  });

  it("突進距離は1v1/2v2の固定演出(styles.cssのlunge-right/lunge-left)と同じ絶対値になる", () => {
    const もふ吉Rect = { left: 0, width: 100 };
    const がぶ太Rect = { left: 300, width: 100 };
    const 右突進 = royaleLungeOffsetPx(もふ吉Rect, がぶ太Rect);
    const 左突進 = royaleLungeOffsetPx(がぶ太Rect, もふ吉Rect);
    expect(右突進).toBe(30);
    expect(左突進).toBe(-30);
  });
});
