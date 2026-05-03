import {
	ALL_BERRIES,
	type Berry,
	type FlavorKey,
	type FlavorProfile,
} from "./berry";

// Utility type: require at least one key present
type AtLeastOne<T, Keys extends keyof T = keyof T> = Keys extends keyof T
	? Required<Pick<T, Keys>> & Partial<Omit<T, Keys>>
	: never;

// Runtime guard for "> 0"
function hasPositiveValue(obj: FlavorProfile): boolean {
	return Object.values(obj).some((v) => (v ?? 0) > 0);
}

export function findBerryCombinations(
	target: AtLeastOne<FlavorProfile>,
): Berry[][] {
	if (!hasPositiveValue(target)) {
		throw new Error("At least one flavor must be > 0");
	}

	/** Serebii / in-game table order: Sweet · Spicy · Sour · Bitter · Fresh */
	const keys: FlavorKey[] = ["sweet", "spicy", "sour", "bitter", "fresh"];

	function getValue(obj: FlavorProfile, key: FlavorKey): number {
		return obj[key] ?? 0;
	}

	function totalsKey(totals: Record<FlavorKey, number>): string {
		return keys.map((k) => totals[k]).join(",");
	}

	function satisfiesMinimums(totals: Record<FlavorKey, number>): boolean {
		return keys.every((k) => getValue(totals, k) >= getValue(target, k));
	}

	const maxBerryFlavor: Record<FlavorKey, number> = {
		sweet: 0,
		spicy: 0,
		sour: 0,
		bitter: 0,
		fresh: 0,
	};
	for (const b of ALL_BERRIES) {
		for (const k of keys) {
			maxBerryFlavor[k] = Math.max(maxBerryFlavor[k], b[k] ?? 0);
		}
	}

	/** False if even filling every remaining slot with the strongest berry cannot reach all mins. */
	function minsStillReachable(
		totals: Record<FlavorKey, number>,
		depth: number,
	): boolean {
		const slotsLeft = 8 - depth;
		if (slotsLeft < 0) {
			return false;
		}
		for (const k of keys) {
			const need = getValue(target, k) - getValue(totals, k);
			if (need <= 0) {
				continue;
			}
			if (slotsLeft * maxBerryFlavor[k] < need) {
				return false;
			}
		}
		return true;
	}

	const results: { combo: Berry[]; calories: number }[] = [];

	/**
	 * Cache states that cannot eventually satisfy all minimums. Overshooting a
	 * minimum is allowed, so we only prune impossible undershoots.
	 *
	 * V8 enforces a maximum Set size (~2^24; lower on some Node versions). Hard
	 * searches can exceed that and throw RangeError — clearing the memo is safe
	 * (only loses pruning, not correctness).
	 */
	const deadEnds = new Set<string>();
	const maxDeadEndMemo = 6_000_000;

	function rememberDeadEnd(key: string): void {
		if (deadEnds.size >= maxDeadEndMemo) {
			deadEnds.clear();
		}
		deadEnds.add(key);
	}

	function backtrack(
		depth: number,
		startIndex: number,
		currentTotals: Record<FlavorKey, number>,
		currentCombo: Berry[],
		currentCalories: number,
	): boolean {
		const memoKey = `${depth}:${startIndex}:${totalsKey(currentTotals)}`;
		if (deadEnds.has(memoKey)) {
			return false;
		}

		if (!minsStillReachable(currentTotals, depth)) {
			rememberDeadEnd(memoKey);
			return false;
		}

		let anyCompletion = satisfiesMinimums(currentTotals);

		if (anyCompletion) {
			results.push({ combo: [...currentCombo], calories: currentCalories });
		}

		if (depth >= 8) {
			if (!anyCompletion) {
				rememberDeadEnd(memoKey);
			}
			return anyCompletion;
		}

		for (let i = startIndex; i < ALL_BERRIES.length; i++) {
			const berry = ALL_BERRIES[i];
			if (!berry) {
				continue;
			}
			const nextTotals: Record<FlavorKey, number> = { ...currentTotals };
			for (const k of keys) {
				nextTotals[k] += berry[k] ?? 0;
			}

			currentCombo.push(berry);
			const childOk = backtrack(
				depth + 1,
				i,
				nextTotals,
				currentCombo,
				currentCalories + berry.calories,
			);
			currentCombo.pop();
			if (childOk) {
				anyCompletion = true;
			}
		}

		if (!anyCompletion) {
			rememberDeadEnd(memoKey);
		}
		return anyCompletion;
	}

	const initialTotals: Record<FlavorKey, number> = {
		sweet: 0,
		spicy: 0,
		sour: 0,
		bitter: 0,
		fresh: 0,
	};

	backtrack(0, 0, initialTotals, [], 0);

	// Sort by calories ascending
	results.sort((a, b) => a.calories - b.calories);

	return results.map((r) => r.combo);
}

export const FLAVOR_KEYS: FlavorKey[] = [
	"sweet",
	"spicy",
	"sour",
	"bitter",
	"fresh",
];

export function describeCombination(combo: Berry[]): {
	calories: number;
	berryLine: string;
	flavorLine: string;
} {
	const calorieCount = combo.reduce((sum, b) => sum + b.calories, 0);
	const berryCounts = combo.reduce(
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
		const sum = combo.reduce((s, b) => s + (b[k] ?? 0), 0);
		return `${k}: ${sum}`;
	}).join(", ");

	return { calories: calorieCount, berryLine, flavorLine };
}
