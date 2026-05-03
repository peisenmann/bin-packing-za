import { ALL_BERRIES, type Berry } from "./lib/berry";
import {
	describeCombination,
	findBerryCombinations,
	FLAVOR_KEYS,
} from "./lib/find-berry-combinations";
import {
	type InventoryCap,
	filterCombosByInventory,
	parseBerryInventoryCap,
} from "./lib/inventory-filter";
import {
	persistFlavorTargets,
	persistInventory,
	restoreFlavorTargets,
	restoreInventory,
} from "./lib/persisted-ui";
import type { KnownResultsPayload } from "./lib/known-results-types";
import {
	type SpecialDonutPreset,
	SPECIAL_DONUT_PRESETS,
} from "./lib/special-donut-presets";
import type { WorkerTarget } from "./searchWorker";

type WorkerResult =
	| { ok: true; combos: ReturnType<typeof findBerryCombinations> }
	| { ok: false; message: string };

const form = document.querySelector<HTMLFormElement>("#target-form")!;
const errorEl = document.querySelector<HTMLParagraphElement>("#form-error")!;
const resultsPanel = document.querySelector<HTMLElement>("#results-panel")!;
const summaryEl =
	document.querySelector<HTMLParagraphElement>("#results-summary")!;
const loadingEl = document.querySelector<HTMLDivElement>("#results-loading")!;
const bodyEl = document.querySelector<HTMLDivElement>("#results-body")!;
const submitBtn = document.querySelector<HTMLButtonElement>("#submit-btn")!;

const RESULTS_IDLE_BODY =
	'Press "Find combinations" to see valid matching combinations.';

const RESULTS_NONE_BODY =
	"No valid matching combinations for these flavor targets. Try relaxing the targets.";

const RESULTS_NONE_INVENTORY_BODY =
	"No matching combinations for your current inventory caps. Try raising limits or clearing berry fields (blank = unlimited).";
const presetsContainer = document.querySelector<HTMLDivElement>(
	"#special-donut-presets",
)!;
const inventoryGrid = document.querySelector<HTMLDivElement>(
	"#berry-inventory-grid",
)!;

/** Full result set from search/cache before inventory filter; drives live refilter. */
let lastFullCombos: Berry[][] | null = null;

const FLAVOR_FIELD_NAMES = [
	"sweet",
	"spicy",
	"sour",
	"bitter",
	"fresh",
] as const;

restoreFlavorTargets(form, FLAVOR_FIELD_NAMES);

function fillFormTargets(p: SpecialDonutPreset): void {
	for (const name of FLAVOR_FIELD_NAMES) {
		const el = form.elements.namedItem(name);
		if (el instanceof HTMLInputElement) {
			el.value = String(p[name]);
		}
	}
	syncPresetHighlight();
	persistFlavorTargets(form, FLAVOR_FIELD_NAMES);
}

/** Current numeric targets, or null if any field is missing or non-finite. */
function readTargetsFromForm(): WorkerTarget | null {
	const out: WorkerTarget = {
		sweet: 0,
		spicy: 0,
		sour: 0,
		bitter: 0,
		fresh: 0,
	};
	for (const name of FLAVOR_FIELD_NAMES) {
		const el = form.elements.namedItem(name);
		if (!(el instanceof HTMLInputElement)) {
			return null;
		}
		const trimmed = el.value.trim();
		if (trimmed === "") {
			return null;
		}
		const n = Number(trimmed);
		if (!Number.isFinite(n)) {
			return null;
		}
		out[name] = n;
	}
	return out;
}

const presetButtonById = new Map<string, HTMLButtonElement>();

function syncPresetHighlight(): void {
	const t = readTargetsFromForm();
	const matched = t ? findMatchingSpecialPreset(t) : undefined;
	const matchedId = matched?.id;
	for (const [id, btn] of presetButtonById) {
		const on = id === matchedId;
		btn.classList.toggle("preset-chip--matched", on);
		btn.setAttribute("aria-pressed", on ? "true" : "false");
	}
}

for (const preset of SPECIAL_DONUT_PRESETS) {
	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = "preset-chip";
	btn.dataset.presetId = preset.id;
	btn.title = `Fill flavor targets: ${preset.label}`;
	btn.setAttribute("aria-pressed", "false");

	const icon = document.createElement("img");
	icon.className = "preset-chip-icon";
	icon.src = preset.iconSrc;
	icon.alt = "";
	icon.decoding = "async";
	icon.setAttribute("aria-hidden", "true");

	const label = document.createElement("span");
	label.className = "preset-chip-label";
	label.textContent = preset.label;

	btn.append(icon, label);
	btn.addEventListener("click", () => {
		fillFormTargets(preset);
	});
	presetButtonById.set(preset.id, btn);
	presetsContainer.appendChild(btn);
}

const berriesAlphabetical = [...ALL_BERRIES].sort((a, b) =>
	a.name.localeCompare(b.name),
);

for (const berry of berriesAlphabetical) {
	const row = document.createElement("label");
	row.className = "inventory-row";

	const nameEl = document.createElement("span");
	nameEl.className = "inventory-berry-name";
	nameEl.textContent = berry.name;
	nameEl.title = berry.name;

	const input = document.createElement("input");
	input.type = "text";
	input.inputMode = "numeric";
	input.autocomplete = "off";
	input.placeholder = "∞";
	input.className = "inventory-cap";
	input.dataset.berryName = berry.name;
	input.setAttribute("aria-label", `Max ${berry.name} (blank = unlimited)`);

	row.append(nameEl, input);
	inventoryGrid.appendChild(row);
}

restoreInventory(inventoryGrid);

form.addEventListener("input", () => {
	syncPresetHighlight();
	persistFlavorTargets(form, FLAVOR_FIELD_NAMES);
});

syncPresetHighlight();

function readInventoryCaps(): Map<string, InventoryCap> {
	const map = new Map<string, InventoryCap>();
	for (const input of inventoryGrid.querySelectorAll<HTMLInputElement>(
		"input[data-berry-name]",
	)) {
		const name = input.dataset.berryName;
		if (!name) {
			continue;
		}
		map.set(name, parseBerryInventoryCap(input.value));
	}
	return map;
}

function presentFilteredResults(
	fullCombos: Berry[][],
	onDone?: () => void,
): void {
	lastFullCombos = fullCombos;
	const filtered = filterCombosByInventory(fullCombos, readInventoryCaps());
	renderResults(filtered, onDone, {
		totalBeforeInventory: fullCombos.length,
	});
}

function rerenderInventoryFilterOnly(): void {
	if (!lastFullCombos) {
		return;
	}
	const filtered = filterCombosByInventory(lastFullCombos, readInventoryCaps());
	renderResults(filtered, undefined, {
		totalBeforeInventory: lastFullCombos.length,
	});
}

inventoryGrid.addEventListener("input", () => {
	persistInventory(inventoryGrid);
	rerenderInventoryFilterOnly();
});

function targetsMatchPreset(
	t: WorkerTarget,
	p: SpecialDonutPreset,
): boolean {
	return (
		t.sweet === p.sweet &&
		t.spicy === p.spicy &&
		t.sour === p.sour &&
		t.bitter === p.bitter &&
		t.fresh === p.fresh
	);
}

function findMatchingSpecialPreset(
	t: WorkerTarget,
): SpecialDonutPreset | undefined {
	return SPECIAL_DONUT_PRESETS.find((p) => targetsMatchPreset(t, p));
}

async function fetchKnownResults(url: string): Promise<Berry[][] | null> {
	try {
		const res = await fetch(url);
		if (!res.ok) {
			return null;
		}
		const data = (await res.json()) as KnownResultsPayload;
		if (!Array.isArray(data.combos)) {
			return null;
		}
		if (
			typeof data.comboCount === "number" &&
			data.comboCount !== data.combos.length
		) {
			return null;
		}
		return data.combos;
	} catch {
		return null;
	}
}

function setCalculating(active: boolean): void {
	loadingEl.hidden = !active;
	resultsPanel.setAttribute("aria-busy", active ? "true" : "false");
}

function parseTarget(formData: FormData): Record<string, number> {
	return {
		sweet: Number(formData.get("sweet")),
		spicy: Number(formData.get("spicy")),
		sour: Number(formData.get("sour")),
		bitter: Number(formData.get("bitter")),
		fresh: Number(formData.get("fresh")),
	};
}

function hasAnyPositive(t: Record<string, number>): boolean {
	return Object.values(t).some((v) => v > 0);
}

function flavorBreakdownHtml(combo: Berry[]): string {
	return FLAVOR_KEYS.map((k) => {
		const sum = combo.reduce((s, b) => s + (b[k] ?? 0), 0);
		const label = escapeHtml(k);
		const num = escapeHtml(sum.toLocaleString());
		return `<span class="flavor-pill flavor-pill--${k}">${label}: ${num}</span>`;
	}).join("");
}

function renderResultsBodyMessage(message: string): void {
	bodyEl.replaceChildren();
	const p = document.createElement("p");
	p.className = "results-empty";
	p.textContent = message;
	bodyEl.appendChild(p);
}

/** Before any search has finished — welcoming placeholder in the results panel. */
function showIdleResults(): void {
	summaryEl.textContent = "";
	renderResultsBodyMessage(RESULTS_IDLE_BODY);
}

function renderResults(
	combos: ReturnType<typeof findBerryCombinations>,
	onDone?: () => void,
	options?: { totalBeforeInventory?: number },
): void {
	const totalBefore = options?.totalBeforeInventory;
	const invFiltered =
		totalBefore !== undefined && totalBefore > combos.length;

	summaryEl.textContent =
		combos.length === 0
			? totalBefore !== undefined && totalBefore > 0
				? `No combinations match your inventory (${totalBefore.toLocaleString()} before filter). Try raising caps or clearing fields.`
				: "No valid matching combinations for these targets. Try relaxing the flavor targets."
			: invFiltered
				? `${combos.length.toLocaleString()} combination${combos.length === 1 ? "" : "s"}, lowest calorie first (${totalBefore!.toLocaleString()} before inventory filter).`
				: `${combos.length.toLocaleString()} combination${combos.length === 1 ? "" : "s"}, lowest calorie first.`;

	bodyEl.replaceChildren();

	if (combos.length === 0) {
		renderResultsBodyMessage(
			totalBefore !== undefined && totalBefore > 0
				? RESULTS_NONE_INVENTORY_BODY
				: RESULTS_NONE_BODY,
		);
		onDone?.();
		return;
	}

	const list = document.createElement("ol");
	list.className = "combo-list";
	bodyEl.appendChild(list);

	const chunk = 400;
	let i = 0;

	function appendBatch(): void {
		const end = Math.min(i + chunk, combos.length);
		const frag = document.createDocumentFragment();
		for (; i < end; i++) {
			const combo = combos[i]!;
			const { calories, berryLine } = describeCombination(combo);
			const li = document.createElement("li");
			li.className = "combo-row";
			li.innerHTML = `
        <span class="combo-rank">#${i + 1}</span>
        <span class="combo-berries">${escapeHtml(berryLine)}</span>
        <span class="combo-cal">${calories.toLocaleString()} cal</span>
        <span class="combo-flavors">${flavorBreakdownHtml(combo)}</span>
      `;
			frag.appendChild(li);
		}
		list.appendChild(frag);
		if (i < combos.length) {
			requestAnimationFrame(appendBatch);
		} else {
			onDone?.();
		}
	}

	requestAnimationFrame(appendBatch);
}

function escapeHtml(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

form.addEventListener("submit", (e) => {
	e.preventDefault();
	errorEl.hidden = true;
	errorEl.textContent = "";

	const raw = parseTarget(new FormData(form));
	if (!hasAnyPositive(raw)) {
		errorEl.textContent =
			"At least one flavor target must be greater than zero.";
		errorEl.hidden = false;
		return;
	}

	submitBtn.disabled = true;
	lastFullCombos = null;
	summaryEl.textContent = "";
	bodyEl.replaceChildren();
	setCalculating(true);

	const workerTarget: WorkerTarget = {
		sweet: Number(raw.sweet),
		spicy: Number(raw.spicy),
		sour: Number(raw.sour),
		bitter: Number(raw.bitter),
		fresh: Number(raw.fresh),
	};

	function finishLoading(): void {
		setCalculating(false);
		submitBtn.disabled = false;
	}

	function runWorkerSearch(): void {
		const worker = new Worker(new URL("./searchWorker.ts", import.meta.url), {
			type: "module",
		});

		worker.onmessage = (ev: MessageEvent<WorkerResult>) => {
			worker.terminate();
			const data = ev.data;
			try {
				if (data.ok) {
					presentFilteredResults(data.combos, finishLoading);
				} else {
					errorEl.textContent = data.message;
					errorEl.hidden = false;
					showIdleResults();
					finishLoading();
				}
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Something went wrong.";
				errorEl.textContent = message;
				errorEl.hidden = false;
				showIdleResults();
				finishLoading();
			}
		};

		worker.onerror = (ev) => {
			worker.terminate();
			errorEl.textContent = ev.message || "Worker failed to run.";
			errorEl.hidden = false;
			showIdleResults();
			finishLoading();
		};

		worker.postMessage(workerTarget);
	}

	function paintThenSearch(): void {
		const matched = findMatchingSpecialPreset(workerTarget);
		if (matched) {
			void fetchKnownResults(matched.knownResultsUrl).then((combos) => {
				if (combos) {
					try {
						presentFilteredResults(combos, finishLoading);
						return;
					} catch {
						/* fall back */
					}
				}
				runWorkerSearch();
			});
			return;
		}
		runWorkerSearch();
	}

	requestAnimationFrame(() => {
		requestAnimationFrame(paintThenSearch);
	});
});

showIdleResults();
