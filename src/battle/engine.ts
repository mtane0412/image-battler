/**
 * @file バトルエンジンです。ゲームの状態管理・進行ロジックはすべて
 * この JavaScript(TypeScript)側で決定論的に計算します(AIはバトル結果に関与しません)。
 *
 * 主な仕様:
 * - 必殺技はMPを消費し、MPは自分の行動後に一定量回復します
 * - 必殺技はタイプ(attack/heal/ailment/buff)ごとに効果と使用条件が異なります
 * - ステータス異常は毒・麻痺・やけど・凍結の4種で、同時に1つだけ罹患します
 * - パッシブスキル(crit-master/ailment-guard/endure/counter/mp-boost)は
 *   エンジン内の判定に組み込まれています(passive が null のキャラは効果なし)
 *
 * 乱数の消費順(テストと厳密に一致させること):
 * - バトル開始時: 同速の場合のみ[先攻決定]を1回
 * - 各アクション:
 *   1. 凍結中: [解凍判定] / 麻痺中: [麻痺判定](行動不能ならここで終了)
 *   2. 必殺技が使用可能な場合: [必殺技判定] → 発動時、
 *      attack / heal / ailment タイプは[威力補正]を1回消費(buff は消費しない)
 *   3. 通常攻撃の場合: [ミス判定] → [クリティカル判定] → [威力補正]
 *   4. 通常攻撃が命中し、相手が counter 持ちで生存している場合: [反撃判定]
 *   5. 行動後の毒・やけどダメージとMP回復: 乱数消費なし
 */
import type {
  AilmentType,
  BattleEvent,
  BattleEventPayload,
  BattleResult,
  Character,
  CombatantSnapshot,
  PassiveSkillId,
} from "../types";

/** [0, 1) の乱数を返す関数です。テストでは決め打ちの列を注入します。 */
export type Rng = () => number;

/** バトル中の一方のキャラクターの状態です。 */
export interface CombatantState {
  character: Character;
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
/** 決着がつかない場合の最大アクション数 */
const MAX_ACTIONS = 100;
/** 自分の行動後に回復するMP量 */
const MP_REGEN_PER_TURN = 10;
/** 回復技が使用可能になるHP残存率のしきい値 */
const HEAL_HP_THRESHOLD = 0.6;
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

/** ダメージ計算値を丸め、最低1を保証します。 */
function toDamage(raw: number): number {
  return Math.max(1, Math.round(raw));
}

/** 指定のパッシブスキルを持っているかを返します。 */
function hasPassive(state: CombatantState, id: PassiveSkillId): boolean {
  return state.character.passive?.id === id;
}

/** 強化・やけどを反映した実効攻撃力を返します。 */
function effectiveAttack(state: CombatantState): number {
  const buffed = state.character.attack + state.attackBuff;
  return state.ailment === "burn" ? buffed * BURN_ATTACK_FACTOR : buffed;
}

/** 強化を反映した実効防御力を返します。 */
function effectiveDefense(state: CombatantState): number {
  return state.character.defense + state.defenseBuff;
}

/**
 * 現在の状況で必殺技が使用可能かを返します(乱数は消費しません)。
 * MPが足りることに加え、タイプごとの条件を満たす必要があります:
 * - attack: 常に使用可能
 * - heal: 自分のHPが60%以下
 * - ailment: 相手が状態異常でなく、ailment-guard も持っていない
 * - buff: このバトルでまだ強化技を使っていない
 */
function isSpecialUsable(
  actor: CombatantState,
  opponent: CombatantState,
): boolean {
  const move = actor.character.specialMove;
  if (actor.mp < move.mpCost) {
    return false;
  }
  switch (move.type) {
    case "attack":
      return true;
    case "heal":
      return actor.hp <= actor.character.hp * HEAL_HP_THRESHOLD;
    case "ailment":
      return opponent.ailment === null && !hasPassive(opponent, "ailment-guard");
    case "buff":
      return !actor.buffUsed;
  }
}

/**
 * バトル全体をシミュレートし、全イベント列と勝敗を返します。
 *
 * - 先攻は素早さが高い方。同速の場合は乱数(0.5未満で第1引数が先攻)。
 * - 相手のHPを0にした側が勝者です(毒・やけど・反撃による戦闘不能を含む)。
 * - MAX_ACTIONS 以内に決着しない場合はHP残存率の高い方が勝者、
 *   同率なら引き分け(winnerId / loserId ともに null)です。
 */
export function simulateBattle(
  first: Character,
  second: Character,
  rng: Rng,
): BattleResult {
  // スナップショット(after)はキャラクターIDをキーにするため、
  // 同一IDでは一方の状態が黙って上書きされてしまいます(Fail-Fast)
  if (first.id === second.id) {
    throw new Error(`両者のキャラクターIDが同一です: ${first.id}`);
  }
  const stateA = createState(first);
  const stateB = createState(second);

  let attacker: CombatantState;
  let defender: CombatantState;
  if (first.speed !== second.speed) {
    [attacker, defender] =
      first.speed > second.speed ? [stateA, stateB] : [stateB, stateA];
  } else {
    [attacker, defender] = rng() < 0.5 ? [stateA, stateB] : [stateB, stateA];
  }

  const events: BattleEvent[] = [];

  /** イベント適用後の両者の状態スナップショットを作ります。 */
  function snapshot(): Record<string, CombatantSnapshot> {
    return {
      [stateA.character.id]: {
        hp: stateA.hp,
        mp: stateA.mp,
        ailment: stateA.ailment,
      },
      [stateB.character.id]: {
        hp: stateB.hp,
        mp: stateB.mp,
        ailment: stateB.ailment,
      },
    };
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

  for (let turn = 1; turn <= MAX_ACTIONS; turn++) {
    const acted = performAction(turn, attacker, defender);
    if (acted === "finished") {
      return finishByKnockout(events, stateA, stateB);
    }
    [attacker, defender] = [defender, attacker];
  }

  // ターン上限到達: HP残存率で判定します
  const ratioA = stateA.hp / stateA.character.hp;
  const ratioB = stateB.hp / stateB.character.hp;
  if (ratioA === ratioB) {
    return { events, winnerId: null, loserId: null };
  }
  const [winner, loser] = ratioA > ratioB ? [stateA, stateB] : [stateB, stateA];
  return {
    events,
    winnerId: winner.character.id,
    loserId: loser.character.id,
  };

  /**
   * 1アクション(行動可否判定 → 行動 → 行動後効果 → MP回復)を実行します。
   * @returns どちらかが戦闘不能になった場合 "finished"
   */
  function performAction(
    turn: number,
    actor: CombatantState,
    opponent: CombatantState,
  ): "continue" | "finished" {
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
    if (isSpecialUsable(actor, opponent) && rng() < SPECIAL_TRIGGER_CHANCE) {
      if (performSpecial(turn, actor, opponent) === "finished") {
        return "finished";
      }
      return endOfAction(turn, actor);
    }

    // --- 3. 通常攻撃 ---
    if (rng() < MISS_CHANCE) {
      emit(turn, actor, opponent, { type: "miss" });
      return endOfAction(turn, actor);
    }
    const critRate =
      (actor.character.luck / CRIT_LUCK_DIVISOR) *
      (hasPassive(actor, "crit-master") ? CRIT_MASTER_MULTIPLIER : 1);
    const critical = rng() < critRate;
    const variance = NORMAL_VARIANCE_BASE + rng() * NORMAL_VARIANCE_RANGE;
    let raw =
      effectiveAttack(actor) * variance -
      effectiveDefense(opponent) * NORMAL_DEFENSE_FACTOR;
    if (critical) {
      raw *= CRIT_MULTIPLIER;
    }
    const damage = toDamage(raw);
    const hit = applyDamage(opponent, damage);
    emit(turn, actor, opponent, { type: "attack", critical, damage });
    if (hit.endured) {
      emit(turn, opponent, opponent, { type: "endure" });
    }
    if (hit.knockedOut) {
      return "finished";
    }

    // --- 4. 反撃(パッシブ counter、通常攻撃の命中に対してのみ) ---
    if (hasPassive(opponent, "counter") && rng() < COUNTER_CHANCE) {
      const counterDamage = toDamage(
        effectiveAttack(opponent) * COUNTER_DAMAGE_FACTOR,
      );
      const counterHit = applyDamage(actor, counterDamage);
      emit(turn, opponent, actor, { type: "counter", damage: counterDamage });
      if (counterHit.endured) {
        emit(turn, actor, actor, { type: "endure" });
      }
      if (counterHit.knockedOut) {
        return "finished";
      }
    }

    return endOfAction(turn, actor);
  }

  /**
   * 必殺技を実行します(使用可否と発動判定は呼び出し側で済んでいる前提)。
   * @returns 相手が戦闘不能になった場合 "finished"
   */
  function performSpecial(
    turn: number,
    actor: CombatantState,
    opponent: CombatantState,
  ): "continue" | "finished" {
    const move = actor.character.specialMove;
    actor.mp -= move.mpCost;

    switch (move.type) {
      case "attack": {
        const variance = SPECIAL_VARIANCE_BASE + rng() * SPECIAL_VARIANCE_RANGE;
        const damage = toDamage(
          move.power * variance +
            effectiveAttack(actor) * SPECIAL_ATTACK_BONUS -
            effectiveDefense(opponent) * SPECIAL_DEFENSE_FACTOR,
        );
        const hit = applyDamage(opponent, damage);
        emit(turn, actor, opponent, {
          type: "special-attack",
          moveName: move.name,
          damage,
        });
        if (hit.endured) {
          emit(turn, opponent, opponent, { type: "endure" });
        }
        return hit.knockedOut ? "finished" : "continue";
      }
      case "heal": {
        const variance = SPECIAL_VARIANCE_BASE + rng() * SPECIAL_VARIANCE_RANGE;
        const healed = Math.min(
          actor.character.hp - actor.hp,
          Math.max(1, Math.round(move.power * variance)),
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
        // 使用条件(isSpecialUsable)で相手が異常でないことは確認済みです。
        // ailment が null の異常技はデータ不正なので Fail-Fast で停止します
        if (move.ailment === null) {
          throw new Error(
            `異常タイプの必殺技「${move.name}」に ailment が設定されていません`,
          );
        }
        const variance = SPECIAL_VARIANCE_BASE + rng() * SPECIAL_VARIANCE_RANGE;
        const damage = toDamage(
          move.power * AILMENT_MOVE_POWER_FACTOR * variance,
        );
        const hit = applyDamage(opponent, damage);
        if (!hit.knockedOut) {
          opponent.ailment = move.ailment;
        }
        emit(turn, actor, opponent, {
          type: "special-ailment",
          moveName: move.name,
          ailment: move.ailment,
          damage,
        });
        if (hit.endured) {
          emit(turn, opponent, opponent, { type: "endure" });
        }
        return hit.knockedOut ? "finished" : "continue";
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
   * @returns 行動者がスリップダメージで戦闘不能になった場合 "finished"
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
        return "finished";
      }
    }
    const regen =
      MP_REGEN_PER_TURN * (hasPassive(actor, "mp-boost") ? MP_BOOST_MULTIPLIER : 1);
    actor.mp = Math.min(actor.character.mp, actor.mp + regen);
    return "continue";
  }
}

/** バトル開始時の戦闘状態を作ります。 */
function createState(character: Character): CombatantState {
  return {
    character,
    hp: character.hp,
    mp: character.mp,
    ailment: null,
    attackBuff: 0,
    defenseBuff: 0,
    buffUsed: false,
    endureUsed: false,
  };
}

/** どちらかが戦闘不能になったときの結果を作ります(HP0の側が敗者)。 */
function finishByKnockout(
  events: BattleEvent[],
  stateA: CombatantState,
  stateB: CombatantState,
): BattleResult {
  const [winner, loser] =
    stateA.hp === 0 ? [stateB, stateA] : [stateA, stateB];
  return {
    events,
    winnerId: winner.character.id,
    loserId: loser.character.id,
  };
}
