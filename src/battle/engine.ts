/**
 * @file バトルエンジンです。ゲームの状態管理・進行ロジックはすべて
 * この JavaScript(TypeScript)側で決定論的に計算します(AIはバトル結果に関与しません)。
 *
 * Nチーム対応のコアエンジン(simulateMultiTeamBattle)を基本とし、
 * チーム戦(simulateTeamBattle)は2チーム、1対1(simulateBattle)はチームサイズ1、
 * バトルロイヤル(simulateRoyale)は「各1体のNチーム」の特殊ケースとして
 * 同じエンジンで処理します。
 *
 * 主な仕様:
 * - ラウンド制: 全キャラクターがバトル開始時に決めた行動順で1ラウンドに1回ずつ行動します
 * - 行動順: first-strike 持ち優先 → 素早さ降順。倒れたキャラクターの枠はスキップします
 * - 攻撃対象: 通常攻撃・攻撃必殺技は生存する他チームのメンバー全員から無作為に選びます
 *   (バトルロイヤルでは「生存する自分以外の全員」になります)
 * - 決着: 生存チームが1つになった時点でそのチームの勝ちです
 * - 必殺技はMPを消費し、MPは自分の行動後に一定量回復します
 * - 必殺技はタイプ(attack/heal/ailment/buff)ごとに効果と使用条件が異なります
 * - ステータス異常は毒・麻痺・やけど・凍結の4種で、同時に1つだけ罹患します
 * - パッシブスキル(crit-master/ailment-guard/endure/counter/mp-boost/
 *   life-steal/regenerate/berserk/evasion/first-strike)は
 *   エンジン内の判定に組み込まれています(passive が null のキャラは効果なし)
 *
 * 乱数の消費順(テストと厳密に一致させること):
 * - バトル開始時: 行動順の決定。優先度(first-strike)も素早さも同じキャラクター
 *   同士のグループ内だけ[順序決定]を消費します(2体のグループは1回。
 *   0.5未満で元の並び=引数順が維持されます。1v1の従来仕様と互換です)
 * - 各アクション(倒れたキャラクターの枠は乱数もターン番号も消費しません):
 *   1. 凍結中: [解凍判定] / 麻痺中: [麻痺判定](行動不能ならここで終了)
 *   2. 必殺技が使用可能な場合: [必殺技判定] → 発動時、attack / ailment タイプは
 *      [対象選択](生存する対象候補が2体以上のときのみ1回)→ [威力補正]を1回消費
 *      (heal は[威力補正]のみ、buff はどちらも消費しない)
 *   3. 通常攻撃の場合: [対象選択](生存する相手が2体以上のときのみ1回)→
 *      [ミス判定] → [クリティカル判定] → [威力補正]
 *      (対象が evasion 持ちの場合もミス判定の確率が変わるだけで消費順は不変)
 *   4. 通常攻撃が命中し、対象が counter 持ちで生存している場合: [反撃判定]
 *   5. life-steal / regenerate の回復、行動後の毒・やけどダメージとMP回復: 乱数消費なし
 */
import type {
  AilmentType,
  BattleEvent,
  BattleEventPayload,
  BattleResult,
  Character,
  CombatantSnapshot,
  PassiveSkillId,
  RoyaleBattleResult,
  TeamBattleResult,
} from "../types";

/** [0, 1) の乱数を返す関数です。テストでは決め打ちの列を注入します。 */
export type Rng = () => number;

/** バトル中の1キャラクターの状態です。 */
export interface CombatantState {
  character: Character;
  /** 所属チーム番号(コアエンジンに渡したチーム配列のインデックス) */
  teamIndex: number;
  /** 現在HP */
  hp: number;
  /** 現在MP */
  mp: number;
  /** 罹患中のステータス異常(なければ null) */
  ailment: AilmentType | null;
  /** 強化技による攻撃力の上昇量 */
  attackBuff: number;
  /** 強化技による防御力の上昇量 */
  defenseBuff: number;
  /** 強化技を使用済みかどうか(1バトルに1回のみ) */
  buffUsed: boolean;
  /** パッシブ endure を発動済みかどうか(1バトルに1回のみ) */
  endureUsed: boolean;
}

/** ミス発生率 */
const MISS_CHANCE = 0.05;
/** 必殺技の発動判定率(使用可能なターンごと) */
const SPECIAL_TRIGGER_CHANCE = 0.4;
/** クリティカル率 = 運 / CRIT_LUCK_DIVISOR(運100で25%) */
const CRIT_LUCK_DIVISOR = 400;
/** クリティカル時のダメージ倍率 */
const CRIT_MULTIPLIER = 1.5;
/** 通常攻撃の威力補正: 0.85〜1.15 */
const NORMAL_VARIANCE_BASE = 0.85;
const NORMAL_VARIANCE_RANGE = 0.3;
/** 通常攻撃で防御力が減算される係数 */
const NORMAL_DEFENSE_FACTOR = 0.4;
/** 必殺技の威力補正: 0.9〜1.1 */
const SPECIAL_VARIANCE_BASE = 0.9;
const SPECIAL_VARIANCE_RANGE = 0.2;
/** 攻撃タイプの必殺技に上乗せされる攻撃力の係数 */
const SPECIAL_ATTACK_BONUS = 0.5;
/** 攻撃タイプの必殺技で防御力が減算される係数(防御貫通気味) */
const SPECIAL_DEFENSE_FACTOR = 0.2;
/**
 * 決着がつかない場合の最大ラウンド数です。1ラウンドは全キャラクターの行動1巡で、
 * 1v1では従来の最大100アクションに一致します(2v2では最大200アクション)。
 */
const MAX_ROUNDS = 50;
/** 自分の行動後に回復するMP量 */
const MP_REGEN_PER_TURN = 10;
/** 回復技が使用可能になるHP残存率のしきい値 */
const HEAL_HP_THRESHOLD = 0.6;
/**
 * 回復タイプの必殺技の回復量係数(威力に掛ける)。
 * HP範囲(100〜300)に対して威力(30〜80)の素の値では回復が薄すぎるため、
 * 威力の2倍を回復量の基準にします。
 */
const HEAL_POWER_FACTOR = 2;
/** 異常タイプの必殺技のダメージ係数(威力に掛ける) */
const AILMENT_MOVE_POWER_FACTOR = 0.3;
/** 毒のスリップダメージ(最大HPに掛ける) */
const POISON_DAMAGE_RATIO = 1 / 8;
/** やけどのスリップダメージ(最大HPに掛ける) */
const BURN_DAMAGE_RATIO = 1 / 16;
/** やけど中の攻撃力の倍率 */
const BURN_ATTACK_FACTOR = 0.5;
/** 麻痺で行動不能になる確率 */
const PARALYSIS_SKIP_CHANCE = 0.25;
/** 凍結が解除される確率(自分の行動時に判定) */
const FREEZE_THAW_CHANCE = 0.3;
/** 強化技の攻撃力上昇係数(威力に掛ける) */
const BUFF_ATTACK_FACTOR = 0.4;
/** 強化技の防御力上昇係数(威力に掛ける) */
const BUFF_DEFENSE_FACTOR = 0.3;
/** パッシブ counter の反撃発動率 */
const COUNTER_CHANCE = 0.3;
/** パッシブ counter の反撃ダメージ係数(攻撃力に掛ける) */
const COUNTER_DAMAGE_FACTOR = 0.3;
/** パッシブ crit-master のクリティカル率倍率 */
const CRIT_MASTER_MULTIPLIER = 2;
/** パッシブ mp-boost のMP回復量倍率 */
const MP_BOOST_MULTIPLIER = 2;
/** パッシブ life-steal の回復係数(通常攻撃の与ダメージに掛ける) */
const LIFE_STEAL_RATIO = 0.3;
/** パッシブ regenerate の行動後回復量(最大HPに掛ける) */
const REGENERATE_RATIO = 1 / 16;
/** パッシブ berserk が発動するHP残存率のしきい値 */
const BERSERK_HP_THRESHOLD = 0.3;
/** パッシブ berserk 発動中の攻撃力倍率 */
const BERSERK_ATTACK_MULTIPLIER = 1.5;
/** パッシブ evasion 持ちが通常攻撃を受けるときのミス発生率 */
const EVASION_MISS_CHANCE = 0.2;

/** ダメージ計算値を丸め、最低1を保証します。 */
function toDamage(raw: number): number {
  return Math.max(1, Math.round(raw));
}

/** 指定のパッシブスキルを持っているかを返します。 */
function hasPassive(state: CombatantState, id: PassiveSkillId): boolean {
  return state.character.passive?.id === id;
}

/** 強化・逆境(berserk)・やけどを反映した実効攻撃力を返します。 */
function effectiveAttack(state: CombatantState): number {
  let attack = state.character.attack + state.attackBuff;
  // berserk: HPが30%以下に減っているとき攻撃力が上がります
  if (
    hasPassive(state, "berserk") &&
    state.hp <= state.character.hp * BERSERK_HP_THRESHOLD
  ) {
    attack *= BERSERK_ATTACK_MULTIPLIER;
  }
  return state.ailment === "burn" ? attack * BURN_ATTACK_FACTOR : attack;
}

/** 強化を反映した実効防御力を返します。 */
function effectiveDefense(state: CombatantState): number {
  return state.character.defense + state.defenseBuff;
}

/**
 * 現在の状況で必殺技が使用可能かを返します(乱数は消費しません)。
 * MPが足りることに加え、タイプごとの条件を満たす必要があります:
 * - attack: 生存する相手がいれば使用可能
 * - heal: 自分のHPが60%以下
 * - ailment: 対象候補(異常でなく ailment-guard でもない生存する相手)がいる
 * - buff: このバトルでまだ強化技を使っていない
 */
function isSpecialUsable(
  actor: CombatantState,
  livingOpponents: readonly CombatantState[],
  ailmentTargets: readonly CombatantState[],
): boolean {
  const move = actor.character.specialMove;
  if (actor.mp < move.mpCost) {
    return false;
  }
  switch (move.type) {
    case "attack":
      return livingOpponents.length > 0;
    case "heal":
      return actor.hp <= actor.character.hp * HEAL_HP_THRESHOLD;
    case "ailment":
      return ailmentTargets.length > 0;
    case "buff":
      return !actor.buffUsed;
  }
}

/** 配列の要素を取り出します。範囲外はデータ不正なので Fail-Fast で停止します。 */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`バトルエンジンが不正なインデックスを参照しました: ${index}`);
  }
  return item;
}

/** 行動順の優先度です(first-strike 持ちが先)。 */
function priorityOf(state: CombatantState): number {
  return hasPassive(state, "first-strike") ? 1 : 0;
}

/**
 * バトル開始時に全キャラクターの行動順を決定します。
 *
 * first-strike 持ち優先 → 素早さ降順の安定ソートを行い、優先度も素早さも
 * 完全に同じキャラクター同士のグループ内だけを前進 Fisher-Yates で
 * シャッフルします(グループが1体なら乱数を消費しません)。
 * 2体のグループでは乱数を1回だけ消費し、0.5未満で元の並び(引数順)が
 * 維持されるため、1v1の従来仕様「同速の場合のみ先攻決定を1回」と互換です。
 */
function decideActionOrder(
  combatants: readonly CombatantState[],
  rng: Rng,
): CombatantState[] {
  const ordered = [...combatants].sort((x, y) => {
    const priorityDiff = priorityOf(y) - priorityOf(x);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return y.character.speed - x.character.speed;
  });
  let groupStart = 0;
  while (groupStart < ordered.length) {
    // 優先度と素早さが完全に同じキャラクターのグループ範囲を求めます
    let groupEnd = groupStart + 1;
    while (
      groupEnd < ordered.length &&
      priorityOf(at(ordered, groupStart)) === priorityOf(at(ordered, groupEnd)) &&
      at(ordered, groupStart).character.speed ===
        at(ordered, groupEnd).character.speed
    ) {
      groupEnd += 1;
    }
    for (let i = groupStart; i < groupEnd - 1; i++) {
      const j = i + Math.floor(rng() * (groupEnd - i));
      const picked = at(ordered, j);
      ordered[j] = at(ordered, i);
      ordered[i] = picked;
    }
    groupStart = groupEnd;
  }
  return ordered;
}

/** コアエンジン(Nチーム対応)の結果です。勝利チームはチーム配列のインデックスで表します。 */
interface MultiTeamBattleResult {
  events: BattleEvent[];
  /** 勝利したチームの番号。引き分けの場合は null */
  winnerTeamIndex: number | null;
}

/**
 * Nチーム戦のバトル全体をシミュレートするコアエンジンです。
 * チーム戦(simulateTeamBattle)は2チームとして、バトルロイヤル(simulateRoyale)は
 * 「各1体のNチーム」としてここへ委譲します。
 *
 * - 全キャラクターがバトル開始時に決めた行動順で1ラウンドに1回ずつ行動します
 *   (倒れたキャラクターの枠はスキップします)
 * - 攻撃対象は「生存する他チームのメンバー全員」(参加順)から選びます
 * - 生存チームが1つになった時点でそのチームの勝ちです
 *   (毒・やけど・反撃による戦闘不能を含む)
 * - MAX_ROUNDS 以内に決着しない場合はチームの平均HP残存率が最も高いチームが勝者、
 *   同率トップが複数なら引き分け(winnerTeamIndex が null)です
 *
 * 互換性の注意: 2チームで実行したとき、乱数の消費順・イベント列は
 * 一般化前の simulateTeamBattle と完全に一致します(乱数を消費する処理の
 * 追加・並び替えを禁止します)。
 */
function simulateMultiTeamBattle(
  teams: readonly (readonly Character[])[],
  rng: Rng,
): MultiTeamBattleResult {
  for (const team of teams) {
    if (team.length === 0) {
      throw new Error("各チームには1体以上のキャラクターが必要です");
    }
  }
  // スナップショット(after)はキャラクターIDをキーにするため、
  // 同一IDでは一方の状態が黙って上書きされてしまいます(Fail-Fast)
  const seenIds = new Set<string>();
  for (const character of teams.flat()) {
    if (seenIds.has(character.id)) {
      throw new Error(
        `キャラクターIDが同一のキャラクターが複数参加しています: ${character.id}`,
      );
    }
    seenIds.add(character.id);
  }

  const combatants: CombatantState[] = teams.flatMap((team, teamIndex) =>
    team.map((character) => createState(character, teamIndex)),
  );
  const order = decideActionOrder(combatants, rng);
  const events: BattleEvent[] = [];

  /** 行動者から見た「生存する他チームのメンバー」を返します(参加順を保ちます)。 */
  function livingOpponentsOf(actor: CombatantState): CombatantState[] {
    return combatants.filter(
      (c) => c.teamIndex !== actor.teamIndex && c.hp > 0,
    );
  }

  /** 生存メンバーが1体以上残っているチームの数を返します(乱数は消費しません)。 */
  function countLivingTeams(): number {
    const aliveTeams = new Set<number>();
    for (const c of combatants) {
      if (c.hp > 0) {
        aliveTeams.add(c.teamIndex);
      }
    }
    return aliveTeams.size;
  }

  /** 唯一生き残ったチームの番号を返します(決着直後の勝者決定専用。不整合は Fail-Fast)。 */
  function soleLivingTeamIndex(): number {
    const living = combatants.filter((c) => c.hp > 0);
    const head = living[0];
    if (head === undefined) {
      throw new Error("決着時に生存しているチームがありません");
    }
    if (living.some((c) => c.teamIndex !== head.teamIndex)) {
      throw new Error("決着時に複数のチームが生存しています");
    }
    return head.teamIndex;
  }

  /** イベント適用後の全キャラクターの状態スナップショットを作ります。 */
  function snapshot(): Record<string, CombatantSnapshot> {
    const record: Record<string, CombatantSnapshot> = {};
    for (const c of combatants) {
      record[c.character.id] = { hp: c.hp, mp: c.mp, ailment: c.ailment };
    }
    return record;
  }

  /** 共通フィールドを補ってイベントを追加します。 */
  function emit(
    turn: number,
    actor: CombatantState,
    target: CombatantState,
    payload: BattleEventPayload,
  ): void {
    events.push({
      ...payload,
      turn,
      actorId: actor.character.id,
      targetId: target.character.id,
      after: snapshot(),
    });
  }

  /**
   * ダメージを適用します。戦闘不能になる場合、パッシブ endure が未使用なら
   * HP1で耐えます(endured: true)。
   */
  function applyDamage(
    target: CombatantState,
    amount: number,
  ): { knockedOut: boolean; endured: boolean } {
    const next = target.hp - amount;
    if (next <= 0 && hasPassive(target, "endure") && !target.endureUsed) {
      target.hp = 1;
      target.endureUsed = true;
      return { knockedOut: false, endured: true };
    }
    target.hp = Math.max(0, next);
    return { knockedOut: target.hp === 0, endured: false };
  }

  /**
   * 対象候補から1体を選びます。候補が1体なら乱数を消費せずそのまま返し、
   * 2体以上なら[対象選択]の乱数を1回消費して無作為に選びます。
   */
  function pickTarget(candidates: readonly CombatantState[]): CombatantState {
    if (candidates.length === 0) {
      throw new Error("対象候補がいない状態で対象選択が行われました");
    }
    if (candidates.length === 1) {
      return at(candidates, 0);
    }
    return at(candidates, Math.floor(rng() * candidates.length));
  }

  let turn = 0;
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    for (const actor of order) {
      // 倒れたキャラクターの枠はスキップします(乱数・ターン番号を消費しません)
      if (actor.hp === 0) {
        continue;
      }
      turn += 1;
      if (performAction(turn, actor) === "finished") {
        return { events, winnerTeamIndex: soleLivingTeamIndex() };
      }
    }
  }

  // ラウンド上限到達: チームの平均HP残存率が最も高いチームの勝ちです
  // (同率トップが複数の場合は引き分け)
  const ratios = teams.map((_, teamIndex) => teamHpRatio(combatants, teamIndex));
  const best = Math.max(...ratios);
  const bestTeamIndices = ratios.flatMap((ratio, teamIndex) =>
    ratio === best ? [teamIndex] : [],
  );
  return {
    events,
    winnerTeamIndex: bestTeamIndices.length === 1 ? at(bestTeamIndices, 0) : null,
  };

  /**
   * 1アクション(行動可否判定 → 行動 → 行動後効果 → MP回復)を実行します。
   * @returns どちらかのチームが全滅した場合 "finished"
   */
  function performAction(
    turn: number,
    actor: CombatantState,
  ): "continue" | "finished" {
    const livingOpponents = livingOpponentsOf(actor);

    // --- 1. 行動可否判定(凍結・麻痺) ---
    if (actor.ailment === "freeze") {
      if (rng() < FREEZE_THAW_CHANCE) {
        actor.ailment = null;
        emit(turn, actor, actor, { type: "ailment-cure", ailment: "freeze" });
      } else {
        emit(turn, actor, actor, { type: "ailment-skip", ailment: "freeze" });
        return endOfAction(turn, actor);
      }
    } else if (actor.ailment === "paralysis") {
      if (rng() < PARALYSIS_SKIP_CHANCE) {
        emit(turn, actor, actor, { type: "ailment-skip", ailment: "paralysis" });
        return endOfAction(turn, actor);
      }
    }

    // --- 2. 必殺技 ---
    const ailmentTargets = livingOpponents.filter(
      (o) => o.ailment === null && !hasPassive(o, "ailment-guard"),
    );
    if (
      isSpecialUsable(actor, livingOpponents, ailmentTargets) &&
      rng() < SPECIAL_TRIGGER_CHANCE
    ) {
      if (
        performSpecial(turn, actor, livingOpponents, ailmentTargets) ===
        "finished"
      ) {
        return "finished";
      }
      return endOfAction(turn, actor);
    }

    // --- 3. 通常攻撃 ---
    const target = pickTarget(livingOpponents);
    // 対象が evasion 持ちの場合はミス率が上がります(乱数の消費順は不変)
    const missChance = hasPassive(target, "evasion")
      ? EVASION_MISS_CHANCE
      : MISS_CHANCE;
    if (rng() < missChance) {
      emit(turn, actor, target, { type: "miss" });
      return endOfAction(turn, actor);
    }
    const critRate =
      (actor.character.luck / CRIT_LUCK_DIVISOR) *
      (hasPassive(actor, "crit-master") ? CRIT_MASTER_MULTIPLIER : 1);
    const critical = rng() < critRate;
    const variance = NORMAL_VARIANCE_BASE + rng() * NORMAL_VARIANCE_RANGE;
    let raw =
      effectiveAttack(actor) * variance -
      effectiveDefense(target) * NORMAL_DEFENSE_FACTOR;
    if (critical) {
      raw *= CRIT_MULTIPLIER;
    }
    const damage = toDamage(raw);
    const hit = applyDamage(target, damage);
    emit(turn, actor, target, { type: "attack", critical, damage });
    if (hit.endured) {
      emit(turn, target, target, { type: "endure" });
    }
    // life-steal: 通常攻撃で与えたダメージの一部を回復します(乱数消費なし)。
    // とどめの一撃でも回復してからバトル終了の判定に進みます
    if (hasPassive(actor, "life-steal")) {
      const healed = Math.min(
        actor.character.hp - actor.hp,
        Math.round(damage * LIFE_STEAL_RATIO),
      );
      if (healed > 0) {
        actor.hp += healed;
        emit(turn, actor, actor, { type: "life-steal", healed });
      }
    }
    if (hit.knockedOut) {
      if (countLivingTeams() <= 1) {
        return "finished";
      }
      return endOfAction(turn, actor);
    }

    // --- 4. 反撃(パッシブ counter、通常攻撃の命中に対してのみ) ---
    if (hasPassive(target, "counter") && rng() < COUNTER_CHANCE) {
      const counterDamage = toDamage(
        effectiveAttack(target) * COUNTER_DAMAGE_FACTOR,
      );
      const counterHit = applyDamage(actor, counterDamage);
      emit(turn, target, actor, { type: "counter", damage: counterDamage });
      if (counterHit.endured) {
        emit(turn, actor, actor, { type: "endure" });
      }
      if (counterHit.knockedOut) {
        // 反撃で倒れたキャラクターは行動後効果(スリップダメージ等)を行いません
        return countLivingTeams() <= 1 ? "finished" : "continue";
      }
    }

    return endOfAction(turn, actor);
  }

  /**
   * 必殺技を実行します(使用可否と発動判定は呼び出し側で済んでいる前提)。
   * @returns 相手チームが全滅した場合 "finished"
   */
  function performSpecial(
    turn: number,
    actor: CombatantState,
    livingOpponents: readonly CombatantState[],
    ailmentTargets: readonly CombatantState[],
  ): "continue" | "finished" {
    const move = actor.character.specialMove;
    actor.mp -= move.mpCost;

    switch (move.type) {
      case "attack": {
        const target = pickTarget(livingOpponents);
        const variance = SPECIAL_VARIANCE_BASE + rng() * SPECIAL_VARIANCE_RANGE;
        const damage = toDamage(
          move.power * variance +
            effectiveAttack(actor) * SPECIAL_ATTACK_BONUS -
            effectiveDefense(target) * SPECIAL_DEFENSE_FACTOR,
        );
        const hit = applyDamage(target, damage);
        emit(turn, actor, target, {
          type: "special-attack",
          moveName: move.name,
          damage,
        });
        if (hit.endured) {
          emit(turn, target, target, { type: "endure" });
        }
        return hit.knockedOut && countLivingTeams() <= 1
          ? "finished"
          : "continue";
      }
      case "heal": {
        const variance = SPECIAL_VARIANCE_BASE + rng() * SPECIAL_VARIANCE_RANGE;
        const healed = Math.min(
          actor.character.hp - actor.hp,
          Math.max(1, Math.round(move.power * HEAL_POWER_FACTOR * variance)),
        );
        actor.hp += healed;
        emit(turn, actor, actor, {
          type: "special-heal",
          moveName: move.name,
          healed,
        });
        return "continue";
      }
      case "ailment": {
        // 使用条件(isSpecialUsable)で対象候補がいることは確認済みです。
        // ailment が null の異常技はデータ不正なので Fail-Fast で停止します
        if (move.ailment === null) {
          throw new Error(
            `異常タイプの必殺技「${move.name}」に ailment が設定されていません`,
          );
        }
        const target = pickTarget(ailmentTargets);
        const variance = SPECIAL_VARIANCE_BASE + rng() * SPECIAL_VARIANCE_RANGE;
        const damage = toDamage(
          move.power * AILMENT_MOVE_POWER_FACTOR * variance,
        );
        const hit = applyDamage(target, damage);
        if (!hit.knockedOut) {
          target.ailment = move.ailment;
        }
        emit(turn, actor, target, {
          type: "special-ailment",
          moveName: move.name,
          ailment: move.ailment,
          damage,
        });
        if (hit.endured) {
          emit(turn, target, target, { type: "endure" });
        }
        return hit.knockedOut && countLivingTeams() <= 1
          ? "finished"
          : "continue";
      }
      case "buff": {
        const attackGain = Math.round(move.power * BUFF_ATTACK_FACTOR);
        const defenseGain = Math.round(move.power * BUFF_DEFENSE_FACTOR);
        actor.attackBuff += attackGain;
        actor.defenseBuff += defenseGain;
        actor.buffUsed = true;
        emit(turn, actor, actor, {
          type: "special-buff",
          moveName: move.name,
          attackGain,
          defenseGain,
        });
        return "continue";
      }
    }
  }

  /**
   * 行動後の処理(毒・やけどのスリップダメージ → MP回復)を実行します。
   * @returns 行動者がスリップダメージで倒れてチームが全滅した場合 "finished"
   */
  function endOfAction(
    turn: number,
    actor: CombatantState,
  ): "continue" | "finished" {
    if (actor.ailment === "poison" || actor.ailment === "burn") {
      const ratio =
        actor.ailment === "poison" ? POISON_DAMAGE_RATIO : BURN_DAMAGE_RATIO;
      const damage = toDamage(actor.character.hp * ratio);
      const hit = applyDamage(actor, damage);
      emit(turn, actor, actor, {
        type: "ailment-damage",
        ailment: actor.ailment,
        damage,
      });
      if (hit.endured) {
        emit(turn, actor, actor, { type: "endure" });
      }
      if (hit.knockedOut) {
        return countLivingTeams() <= 1 ? "finished" : "continue";
      }
    }
    // regenerate: 行動後にHPが少し回復します(乱数消費なし)。
    // 毒・やけどのダメージを受けたあとに回復する順序です
    if (hasPassive(actor, "regenerate")) {
      const healed = Math.min(
        actor.character.hp - actor.hp,
        Math.round(actor.character.hp * REGENERATE_RATIO),
      );
      if (healed > 0) {
        actor.hp += healed;
        emit(turn, actor, actor, { type: "regenerate", healed });
      }
    }
    const regen =
      MP_REGEN_PER_TURN * (hasPassive(actor, "mp-boost") ? MP_BOOST_MULTIPLIER : 1);
    actor.mp = Math.min(actor.character.mp, actor.mp + regen);
    return "continue";
  }
}

/**
 * チーム戦(1v1・2v2共通)のバトル全体をシミュレートし、
 * 全イベント列と勝利サイドを返します。
 * 内部ではNチーム対応のコアエンジンを2チームで実行します
 * (乱数の消費順・イベント列は一般化前の実装と完全に互換です)。
 */
export function simulateTeamBattle(
  firstTeam: readonly Character[],
  secondTeam: readonly Character[],
  rng: Rng,
): TeamBattleResult {
  const result = simulateMultiTeamBattle([firstTeam, secondTeam], rng);
  const winner =
    result.winnerTeamIndex === null
      ? null
      : result.winnerTeamIndex === 0
        ? "first"
        : "second";
  return { events: result.events, winner };
}

/**
 * バトルロイヤル(完全FFA)のバトル全体をシミュレートし、
 * 全イベント列と勝者ID(引き分けの場合は null)を返します。
 * 内部ではNチーム対応のコアエンジンを「各1体のNチーム」として実行するため、
 * 対象候補は「生存する自分以外の全員」(引数 fighters の並び順)になります。
 */
export function simulateRoyale(
  fighters: readonly Character[],
  rng: Rng,
): RoyaleBattleResult {
  if (fighters.length < 2) {
    throw new Error("バトルロイヤルには2体以上のキャラクターが必要です");
  }
  const result = simulateMultiTeamBattle(
    fighters.map((fighter) => [fighter]),
    rng,
  );
  return {
    events: result.events,
    winnerId:
      result.winnerTeamIndex === null
        ? null
        : at(fighters, result.winnerTeamIndex).id,
  };
}

/**
 * 1対1のバトル全体をシミュレートし、全イベント列と勝敗を返します。
 * 内部ではチーム戦エンジン(simulateTeamBattle)をチームサイズ1で実行します。
 * 対象候補が常に1体のため[対象選択]の乱数を消費せず、[順序決定]も
 * 同速時の1回だけなので、乱数の消費順は従来の1対1実装と完全に互換です。
 */
export function simulateBattle(
  first: Character,
  second: Character,
  rng: Rng,
): BattleResult {
  const result = simulateTeamBattle([first], [second], rng);
  if (result.winner === null) {
    return { events: result.events, winnerId: null, loserId: null };
  }
  const [winner, loser] =
    result.winner === "first" ? [first, second] : [second, first];
  return { events: result.events, winnerId: winner.id, loserId: loser.id };
}

/** バトル開始時の戦闘状態を作ります。 */
function createState(character: Character, teamIndex: number): CombatantState {
  return {
    character,
    teamIndex,
    hp: character.hp,
    mp: character.mp,
    ailment: null,
    attackBuff: 0,
    defenseBuff: 0,
    buffUsed: false,
    endureUsed: false,
  };
}

/** チームの平均HP残存率を返します(倒れたキャラクターは0として平均します)。 */
function teamHpRatio(
  combatants: readonly CombatantState[],
  teamIndex: number,
): number {
  const members = combatants.filter((c) => c.teamIndex === teamIndex);
  const total = members.reduce(
    (sum, member) => sum + member.hp / member.character.hp,
    0,
  );
  return total / members.length;
}
