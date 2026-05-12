import { ALL_BERRIES, type Berry, type FlavorKey } from "./berry";
import type { InventoryCap } from "./inventory-filter";

export type MaximizerPriority = FlavorKey | "calories" | "levels";

export const MAXIMIZER_PRIORITIES: {
  key: MaximizerPriority;
  label: string;
}[] = [
  { key: "calories", label: "Calories" },
  { key: "levels", label: "Levels" },
  { key: "sweet", label: "Sweet" },
  { key: "spicy", label: "Spicy" },
  { key: "sour", label: "Sour" },
  { key: "bitter", label: "Bitter" },
  { key: "fresh", label: "Fresh" },
];

function getBerryValue(berry: Berry, key: MaximizerPriority): number {
  if (key === "calories") return berry.calories;
  if (key === "levels") return berry.levels;
  return berry[key] ?? 0;
}

const DONUT_SIZE = 8;
const MAX_RESULTS = 100;

/**
 * Greedy donut builder: sorts available berry types by primary (then secondary)
 * priority and repeatedly fills 8-berry donuts from the top of the list.
 *
 * Capped berries are consumed across donuts (total cap, not per-donut).
 * Unlimited berries stay available unless a single donut uses all 8 of them,
 * in which case that berry type is depleted for subsequent donuts.
 */
export function maximizerSearch(
  primary: MaximizerPriority,
  secondary: MaximizerPriority | null,
  inventoryCaps: Map<string, InventoryCap>,
): Berry[][] {
  interface BerrySlot {
    berry: Berry;
    remaining: number;
    isUnlimited: boolean;
    depleted: boolean;
  }

  const pool: BerrySlot[] = [];
  for (const berry of ALL_BERRIES) {
    const cap = inventoryCaps.get(berry.name);
    if (cap === 0) continue;
    pool.push({
      berry,
      remaining: cap === null || cap === undefined ? Infinity : cap,
      isUnlimited: cap === null || cap === undefined,
      depleted: false,
    });
  }

  pool.sort((a, b) => {
    const ap = getBerryValue(a.berry, primary);
    const bp = getBerryValue(b.berry, primary);
    if (bp !== ap) return bp - ap;
    if (secondary) {
      const as2 = getBerryValue(a.berry, secondary);
      const bs = getBerryValue(b.berry, secondary);
      if (bs !== as2) return bs - as2;
    }
    return 0;
  });

  const results: Berry[][] = [];

  while (results.length < MAX_RESULTS) {
    const donut: Berry[] = [];
    const usedThisDonut = new Map<string, number>();

    for (const slot of pool) {
      if (donut.length >= DONUT_SIZE) break;
      if (slot.depleted || slot.remaining <= 0) continue;

      const needed = DONUT_SIZE - donut.length;
      const take = Math.min(
        needed,
        slot.isUnlimited ? needed : slot.remaining,
      );

      for (let i = 0; i < take; i++) {
        donut.push(slot.berry);
      }
      usedThisDonut.set(slot.berry.name, take);
    }

    if (donut.length < DONUT_SIZE) break;

    for (const [name, count] of usedThisDonut) {
      const slot = pool.find((s) => s.berry.name === name)!;
      if (slot.isUnlimited) {
        if (count === DONUT_SIZE) {
          slot.depleted = true;
        }
      } else {
        slot.remaining -= count;
      }
    }

    results.push(donut);
  }

  return results;
}

export function priorityLabel(key: MaximizerPriority): string {
  return MAXIMIZER_PRIORITIES.find((p) => p.key === key)?.label ?? key;
}
