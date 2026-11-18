import type { Animal, Food } from '../animals/types';
import type { Copy } from '../animals/types';

export interface FeedJudgment {
  ok: boolean;
  say: Copy;
}

/** A mismatch is a hint, never a miss that costs a star. */
export function judgeFood(animal: Animal, food: Food): FeedJudgment {
  if (animal.foods.includes(food)) return { ok: true, say: animal.foodYes };
  return { ok: false, say: animal.foodHint };
}
