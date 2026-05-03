import type { Berry } from "./berry";

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
): boolean {
	const counts = countBerriesInCombo(combo);
	for (const [name, cap] of capsByBerryName) {
		if (cap === null) {
			continue;
		}
		const used = counts.get(name) ?? 0;
		if (used > cap) {
			return false;
		}
	}
	return true;
}

export function filterCombosByInventory(
	combos: Berry[][],
	capsByBerryName: Map<string, InventoryCap>,
): Berry[][] {
	return combos.filter((combo) =>
		comboSatisfiesInventory(combo, capsByBerryName),
	);
}
