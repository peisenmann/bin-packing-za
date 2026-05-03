const PREFIX = "bin-packing-za";

export const STORAGE_KEYS = {
	flavorTargets: `${PREFIX}:flavor-targets`,
	inventoryCaps: `${PREFIX}:inventory-caps`,
} as const;

export function persistFlavorTargets(
	form: HTMLFormElement,
	fieldNames: readonly string[],
): void {
	try {
		const o: Record<string, string> = {};
		for (const name of fieldNames) {
			const el = form.elements.namedItem(name);
			if (el instanceof HTMLInputElement) {
				o[name] = el.value;
			}
		}
		localStorage.setItem(STORAGE_KEYS.flavorTargets, JSON.stringify(o));
	} catch {
		/* private mode, quota, or disabled storage */
	}
}

export function restoreFlavorTargets(
	form: HTMLFormElement,
	fieldNames: readonly string[],
): void {
	try {
		const raw = localStorage.getItem(STORAGE_KEYS.flavorTargets);
		if (!raw) {
			return;
		}
		const o = JSON.parse(raw) as Record<string, unknown>;
		for (const name of fieldNames) {
			const v = o[name];
			if (typeof v !== "string") {
				continue;
			}
			const el = form.elements.namedItem(name);
			if (el instanceof HTMLInputElement) {
				el.value = v;
			}
		}
	} catch {
		/* corrupt or unreadable */
	}
}

export function persistInventory(grid: HTMLElement): void {
	try {
		const o: Record<string, string> = {};
		for (const input of grid.querySelectorAll<HTMLInputElement>(
			"input[data-berry-name]",
		)) {
			const name = input.dataset.berryName;
			if (name) {
				o[name] = input.value;
			}
		}
		localStorage.setItem(STORAGE_KEYS.inventoryCaps, JSON.stringify(o));
	} catch {
		/* ignore */
	}
}

export function restoreInventory(grid: HTMLElement): void {
	try {
		const raw = localStorage.getItem(STORAGE_KEYS.inventoryCaps);
		if (!raw) {
			return;
		}
		const o = JSON.parse(raw) as Record<string, unknown>;
		for (const input of grid.querySelectorAll<HTMLInputElement>(
			"input[data-berry-name]",
		)) {
			const name = input.dataset.berryName;
			if (!name) {
				continue;
			}
			const v = o[name];
			if (typeof v === "string") {
				input.value = v;
			}
		}
	} catch {
		/* ignore */
	}
}
