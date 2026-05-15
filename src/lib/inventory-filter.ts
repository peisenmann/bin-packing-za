import { ALL_BERRIES, getFlavorScore, type Berry } from "./berry";

export const MAX_NEAR_MISS_BERIES = 3;

/** `null` = unlimited; `0` = berry forbidden; positive integer = max uses in one combo. */
export type InventoryCap = number | null;

/**
 * Blank → unlimited (`null`). Strips `-` from the string, parses a float, then floors the
 * absolute value. Non-finite → unlimited.
 */
export function parseBerryInventoryCap(raw: string): InventoryCap {
  const t = raw.trim();
  if (t === "") {
    return null;
  }
  const withoutMinus = t.replace(/-/g, "");
  const n = Number.parseFloat(withoutMinus);
  if (!Number.isFinite(n)) {
    return null;
  }
  return Math.floor(Math.abs(n));
}

function countBerriesInCombo(combo: Berry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of combo) {
    m.set(b.name, (m.get(b.name) ?? 0) + 1);
  }
  return m;
}

function comboSatisfiesInventory(
  combo: Berry[],
  capsByBerryName: Map<string, InventoryCap>,
): {
  satisfies: boolean;
  missingBerries: MissingBerry[];
  totalMissingBerries: number;
} {
  const missingBerries: MissingBerry[] = [];
  let totalMissingBerries = 0;
  const counts = countBerriesInCombo(combo);
  for (const [name, cap] of capsByBerryName) {
    if (cap === null) {
      continue;
    }
    const used = counts.get(name) ?? 0;
    if (used > cap) {
      missingBerries.push({ name, count: used - cap });
      totalMissingBerries += used - cap;
    }
  }
  return {
    satisfies: totalMissingBerries === 0,
    missingBerries,
    totalMissingBerries,
  };
}

export function filterCombosByInventory(
  combos: Berry[][],
  capsByBerryName: Map<string, InventoryCap>,
): Berry[][] {
  return combos.filter(
    (combo) => comboSatisfiesInventory(combo, capsByBerryName).satisfies,
  );
}

export type MissingBerry = {
  name: string;
  count: number;
};

/**
 * A near miss is a combo that is missing a small number of berries. It is used to display a list of
 * combos that are close to satisfying the inventory caps.
 *
 * The key is a comma-separated list of the missing berries and their counts.
 * The combos are a list of every combo that could be made if only the missing berries were available.
 * The missingBerries are the berries that are missing and how many of each are needed.
 * The totalMissingBerries is the total number of berries that are missing.
 * The totalCalories is the total calories of the missing berries.
 * The totalLevels is the total levels of the missing berries.
 * The totalFlavorScore is the total flavor score of the missing berries.
 */
export type NearMiss = {
  key: string;
  combos: Berry[][];
  missingBerries: MissingBerry[];
  totalMissingBerries: number;
  totalCalories: number;
  totalLevels: number;
  totalFlavorScore: number;
};

export type ComboResult = {
  combos: Berry[][];
  nearMisses: Map<string, NearMiss>;
};

export function filterCombosByInventoryWithNearMisses(
  combos: Berry[][],
  capsByBerryName: Map<string, InventoryCap>,
): ComboResult {
  return combos.reduce(
    (result, combo) => {
      const { satisfies, missingBerries, totalMissingBerries } =
        comboSatisfiesInventory(combo, capsByBerryName);
      if (satisfies) {
        result.combos.push(combo);
      } else if (totalMissingBerries <= MAX_NEAR_MISS_BERIES) {
        // For each missing berry, total up the calories, levels, and flavor score.
        let totalCalories = 0;
        let totalLevels = 0;
        let totalFlavorScore = 0;
        for (const b of missingBerries) {
          const berry = ALL_BERRIES.find((ab) => ab.name === b.name);
          if (berry) {
            totalCalories += berry.calories * b.count;
            totalLevels += berry.levels * b.count;
            totalFlavorScore += getFlavorScore(berry) * b.count;
          }
        }

        const key = missingBerries
          .map((b) => `${b.name}:${b.count}`)
          .sort()
          .join(", ");
        if (!result.nearMisses.has(key)) {
          const nearMiss: NearMiss = {
            key,
            combos: [combo],
            missingBerries,
            totalMissingBerries,
            totalCalories,
            totalLevels,
            totalFlavorScore,
          };
          result.nearMisses.set(key, nearMiss);
        } else {
          result.nearMisses.get(key)?.combos.push(combo);
        }
      }
      return result;
    },
    { combos: [], nearMisses: new Map() } as ComboResult,
  );
}
