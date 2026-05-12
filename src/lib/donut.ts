import { Berry, FlavorKey, getBerryById } from "./berry";
import { FLAVOR_KEYS } from "./find-berry-combinations";

export interface Donut {
  name: string;
  flavorScore: number;
  flavorScoreMultiplier: number;
  stars: number;
  recipe: Berry[];
}

export interface DonutLevel {
  stars: number;
  minimumflavorScore: number;
  flavorScoreMultiplier: number;
}

export type FlavorSummary = Record<FlavorKey, number> & {
  totalFlavorScore: number;
  dominantFlavor: FlavorKey | "rainbow";
};

export interface DonutDetails {
  donutLevel: DonutLevel;
  flavorSummary: FlavorSummary;
  calories: number;
  levelBonus: number;
}

export const DONUT_LEVELS: readonly DonutLevel[] = [
  {
    stars: 5,
    minimumflavorScore: 960,
    flavorScoreMultiplier: 1.5,
  },
  {
    stars: 4,
    minimumflavorScore: 700,
    flavorScoreMultiplier: 1.4,
  },
  {
    stars: 3,
    minimumflavorScore: 350,
    flavorScoreMultiplier: 1.3,
  },
  {
    stars: 2,
    minimumflavorScore: 240,
    flavorScoreMultiplier: 1.2,
  },
  {
    stars: 1,
    minimumflavorScore: 120,
    flavorScoreMultiplier: 1.1,
  },
  {
    stars: 0,
    minimumflavorScore: 0,
    flavorScoreMultiplier: 1.0,
  },
] as const;

function getFlavorSummary(recipe: Berry[]): FlavorSummary {
  const flavorSummary: FlavorSummary = {
    totalFlavorScore: 0,
    dominantFlavor: "rainbow",
    fresh: 0,
    sour: 0,
    bitter: 0,
    sweet: 0,
    spicy: 0,
  };
  for (const berry of recipe) {
    for (const flavor of FLAVOR_KEYS) {
      flavorSummary[flavor] += berry[flavor] ?? 0;
      flavorSummary.totalFlavorScore += berry[flavor] ?? 0;
    }
  }

  const flavors: { flavor: FlavorKey; score: number }[] = FLAVOR_KEYS.map(
    (flavor) => ({
      flavor,
      score: flavorSummary[flavor] ?? 0,
    }),
  );
  flavors.sort((a, b) => b.score - a.score);
  console.log("flavors", flavors);
  if (
    // If there's only one flavor, it's the dominant flavor.
    (flavors[0]?.score &&
      flavors[0].score > 0 &&
      Number(flavors[1]?.score) === 0) ||
    // There are at least two flavors, and the first one is greater than the second.
    (flavors[0]?.score &&
      flavors[1]?.score &&
      flavors[0].score > flavors[1].score)
  ) {
    flavorSummary.dominantFlavor = flavors[0]?.flavor;
  } else {
    flavorSummary.dominantFlavor = "rainbow";
  }

  return flavorSummary;
}

export function getDonutDetails(recipe: Berry[]): DonutDetails {
  const flavorSummary = getFlavorSummary(recipe);
  const donutLevel = DONUT_LEVELS.find(
    (level) => flavorSummary.totalFlavorScore >= level.minimumflavorScore,
  )!;

  const baseCalories = recipe.reduce((acc, berry) => acc + berry.calories, 0);
  const baseLevelBonus = recipe.reduce((acc, berry) => acc + berry.levels, 0);

  const calories = Math.floor(baseCalories * donutLevel.flavorScoreMultiplier);
  const levelBonus = Math.floor(
    baseLevelBonus * donutLevel.flavorScoreMultiplier,
  );

  return {
    donutLevel,
    flavorSummary,
    calories,
    levelBonus,
  };
}

export function describeRecipe(recipe: Berry[]): {
  details: DonutDetails;
  berryLine: string;
  flavorLine: string;
} {
  const details = getDonutDetails(recipe);
  const berryCounts = recipe.reduce(
    (acc, berry) => {
      acc[berry.name] = (acc[berry.name] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const berryLine = Object.entries(berryCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => `${count}× ${name}`)
    .join(", ");

  const flavorLine = FLAVOR_KEYS.map((k) => {
    return `${k}: ${details.flavorSummary[k] ?? 0}`;
  }).join(", ");

  return { details, berryLine, flavorLine };
}

export function compressRecipe(recipe: Berry[]): string {
  return recipe.map((berry) => berry.id).join(",");
}

export function decompressRecipe(compressed: string): Berry[] {
  const berryIds = compressed.split(",");
  const berries: Berry[] = [];
  for (const id of berryIds) {
    const berry = getBerryById(parseInt(id));
    if (berry) {
      berries.push(berry);
    } else {
      throw new Error(`Unknown berry id: ${id}`);
    }
  }
  return berries;
}
