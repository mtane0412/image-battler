/**
 * @file バトルエンジンです。ゲームの状態管理・進行ロジックはすべて
 * この JavaScript(TypeScript)側で決定論的に計算します(AIはバトル結果に関与しません)。
 *
 * 乱数の消費順(テストと厳密に一致させること):
 * - 必殺技が使用可能な場合: [必殺技判定] → (発動時)[威力補正]
 * - 通常攻撃の場合: [ミス判定] → [クリティカル判定] → [威力補正]
 * - 同速時の先攻決定: バトル開始時に1回だけ消費
 */
import type {
  BattleActionType,
  BattleEvent,
  BattleResult,
  Character,
} from "../types";

/** [0, 1) の乱数を返す関数です。テストでは決め打ちの列を注入します。 */
export type Rng = () => number;

/** バトル中の一方のキャラクターの状態です。 */
export interface CombatantState {
  character: Character;
  /** 現在HP */
  hp: number;
  /** 必殺技を使用済みかどうか(1バトルに1回のみ) */
  specialUsed: boolean;
}

/** 1アクションの解決結果です。 */
export interface ActionOutcome {
  type: BattleActionType;
  critical: boolean;
  damage: number;
}

/** ミス発生率 */
const MISS_CHANCE = 0.05;
/** 必殺技の発動判定率(条件を満たすターンごと) */
const SPECIAL_TRIGGER_CHANCE = 0.4;
/** 必殺技が解禁されるHP残存率のしきい値 */
const SPECIAL_HP_THRESHOLD = 0.5;
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
/** 必殺技に上乗せされる攻撃力の係数 */
const SPECIAL_ATTACK_BONUS = 0.5;
/** 必殺技で防御力が減算される係数(防御貫通気味) */
const SPECIAL_DEFENSE_FACTOR = 0.2;
/** 決着がつかない場合の最大アクション数 */
const MAX_ACTIONS = 100;

/**
 * 攻撃側の1アクションを解決します。状態は変更しません(純粋関数)。
 *
 * - 必殺技: HPが50%以下かつ未使用のとき40%で発動。ミスせずクリティカルもしない。
 * - 通常攻撃: 5%でミス。運/400の確率でクリティカル(1.5倍)。
 * - ダメージは最低1を保証します(ミス時を除く)。
 */
export function resolveAction(
  attacker: CombatantState,
  defender: CombatantState,
  rng: Rng,
): ActionOutcome {
  const { attack, luck, specialMove } = attacker.character;
  const { defense } = defender.character;

  const specialReady =
    !attacker.specialUsed &&
    attacker.hp <= attacker.character.hp * SPECIAL_HP_THRESHOLD;

  if (specialReady && rng() < SPECIAL_TRIGGER_CHANCE) {
    const variance = SPECIAL_VARIANCE_BASE + rng() * SPECIAL_VARIANCE_RANGE;
    const raw =
      specialMove.power * variance +
      attack * SPECIAL_ATTACK_BONUS -
      defense * SPECIAL_DEFENSE_FACTOR;
    return { type: "special", critical: false, damage: toDamage(raw) };
  }

  if (rng() < MISS_CHANCE) {
    return { type: "miss", critical: false, damage: 0 };
  }

  const critical = rng() < luck / CRIT_LUCK_DIVISOR;
  const variance = NORMAL_VARIANCE_BASE + rng() * NORMAL_VARIANCE_RANGE;
  let raw = attack * variance - defense * NORMAL_DEFENSE_FACTOR;
  if (critical) {
    raw *= CRIT_MULTIPLIER;
  }
  return { type: "attack", critical, damage: toDamage(raw) };
}

/** ダメージ計算値を丸め、最低1を保証します。 */
function toDamage(raw: number): number {
  return Math.max(1, Math.round(raw));
}

/**
 * バトル全体をシミュレートし、全イベント列と勝敗を返します。
 *
 * - 先攻は素早さが高い方。同速の場合は乱数(0.5未満で第1引数が先攻)。
 * - 相手のHPを0にした側が勝者です。
 * - MAX_ACTIONS 以内に決着しない場合はHP残存率の高い方が勝者、
 *   同率なら引き分け(winnerId / loserId ともに null)です。
 */
export function simulateBattle(
  first: Character,
  second: Character,
  rng: Rng,
): BattleResult {
  const stateA: CombatantState = { character: first, hp: first.hp, specialUsed: false };
  const stateB: CombatantState = { character: second, hp: second.hp, specialUsed: false };

  let attacker: CombatantState;
  let defender: CombatantState;
  if (first.speed !== second.speed) {
    [attacker, defender] =
      first.speed > second.speed ? [stateA, stateB] : [stateB, stateA];
  } else {
    [attacker, defender] = rng() < 0.5 ? [stateA, stateB] : [stateB, stateA];
  }

  const events: BattleEvent[] = [];
  for (let turn = 1; turn <= MAX_ACTIONS; turn++) {
    const outcome = resolveAction(attacker, defender, rng);
    if (outcome.type === "special") {
      attacker.specialUsed = true;
    }
    defender.hp = Math.max(0, defender.hp - outcome.damage);
    events.push({
      turn,
      attackerId: attacker.character.id,
      defenderId: defender.character.id,
      type: outcome.type,
      critical: outcome.critical,
      damage: outcome.damage,
      defenderHpAfter: defender.hp,
    });

    if (defender.hp === 0) {
      return {
        events,
        winnerId: attacker.character.id,
        loserId: defender.character.id,
      };
    }
    [attacker, defender] = [defender, attacker];
  }

  // ターン上限到達: HP残存率で判定します
  const ratioA = stateA.hp / stateA.character.hp;
  const ratioB = stateB.hp / stateB.character.hp;
  if (ratioA === ratioB) {
    return { events, winnerId: null, loserId: null };
  }
  const [winner, loser] =
    ratioA > ratioB ? [stateA, stateB] : [stateB, stateA];
  return {
    events,
    winnerId: winner.character.id,
    loserId: loser.character.id,
  };
}
