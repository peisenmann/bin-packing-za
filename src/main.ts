import { ALL_BERRIES, type Berry, type FlavorKey } from "./lib/berry";
import {
  findBerryCombinations,
  FLAVOR_KEYS,
  getFlavorName,
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
import { archedSectionTitleHtml } from "./lib/arched-section-title";
import { compressRecipe, decompressRecipe, describeRecipe } from "./lib/donut";
import {
  maximizerSearch,
  priorityLabel,
  type MaximizerPriority,
} from "./lib/maximizer";

const ROTOM_DONUT_MAKER_DETAILS_BASE =
  "https://rotomlabs.net/legends-z-a/donut-maker?b=";

const DONUT_IMAGE_URL_BY_LEVEL_FLAVOR = new Map<string, string>();
for (const [path, url] of Object.entries(
  import.meta.glob<string>("./assets/img/donuts/level-*.png", {
    eager: true,
    query: "?url",
    import: "default",
  }),
)) {
  const file = path.split("/").pop() ?? "";
  const m = /^level-(\d+)-(\w+)\.png$/.exec(file);
  if (m) {
    DONUT_IMAGE_URL_BY_LEVEL_FLAVOR.set(`${m[1]}-${m[2]}`, url);
  }
}

function donutImageUrl(
  stars: number,
  dominantFlavor: FlavorKey | "rainbow",
): string | undefined {
  const flavor = dominantFlavor === "rainbow" ? "rainbow" : dominantFlavor;
  return DONUT_IMAGE_URL_BY_LEVEL_FLAVOR.get(`${stars}-${flavor}`);
}

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
const resultsTargetsEl =
  document.querySelector<HTMLDivElement>("#results-targets")!;

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

document.querySelector(".inventory-section")!.insertAdjacentHTML(
  "afterbegin",
  archedSectionTitleHtml({
    title: "Your Inventory",
    idPrefix: "heading-inventory",
    headingId: "inventory-section-heading",
  }),
);

const recipeFinderSection = document.querySelector<HTMLElement>(
  '[aria-labelledby="targets-heading"]',
)!;
recipeFinderSection.insertAdjacentHTML(
  "afterbegin",
  archedSectionTitleHtml({
    title: "Recipe Finder",
    idPrefix: "heading-recipe-finder",
    headingId: "targets-heading",
  }),
);

const rfTabBar =
  recipeFinderSection.querySelector<HTMLElement>(".rf-tabs")!;
rfTabBar.addEventListener("click", (e) => {
  const clicked = (e.target as HTMLElement).closest<HTMLButtonElement>(".rf-tab");
  if (!clicked || clicked.classList.contains("rf-tab--active")) return;

  for (const tab of rfTabBar.querySelectorAll<HTMLButtonElement>(".rf-tab")) {
    const isActive = tab === clicked;
    tab.classList.toggle("rf-tab--active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
    const panelId = tab.getAttribute("aria-controls");
    if (panelId) {
      const panel = document.getElementById(panelId);
      if (panel) panel.hidden = !isActive;
    }
  }
});

document.querySelector("#results-panel")!.insertAdjacentHTML(
  "afterbegin",
  archedSectionTitleHtml({
    title: "Recipes",
    idPrefix: "results-recipes",
    headingId: "results-section-heading",
  }),
);

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

function targetsMatchPreset(t: WorkerTarget, p: SpecialDonutPreset): boolean {
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
    return data.combos.map((combo) => decompressRecipe(combo));
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
    const num = escapeHtml(sum.toLocaleString());
    const zeroClass = sum === 0 ? " flavor-pill--zero" : "";
    const flavorName = getFlavorName(k);
    return `<span title="${flavorName}" class="flavor-pill flavor-pill--${k}${zeroClass}">${num}</span>`;
  }).join("");
}

function appendStarRow(parent: HTMLElement, stars: number): void {
  const lit = Math.min(5, Math.max(0, stars));
  const row = document.createElement("div");
  row.className = "combo-star-row";
  row.setAttribute("role", "img");
  row.setAttribute("aria-label", `${lit} out of 5 stars`);
  for (let i = 0; i < 5; i++) {
    const star = document.createElement("span");
    star.className =
      i < lit ? "combo-star combo-star--lit" : "combo-star combo-star--dim";
    star.textContent = "★";
    star.setAttribute("aria-hidden", "true");
    row.appendChild(star);
  }
  parent.appendChild(row);
}

function createFAIcon(icon: string): HTMLElement {
  const span = document.createElement("i");
  span.className = `fa fa-${icon}`;
  span.setAttribute("aria-hidden", "true");
  return span;
}
function renderResultsBodyMessage(message: string): void {
  bodyEl.replaceChildren();
  const p = document.createElement("p");
  p.className = "results-empty";
  p.textContent = message;
  bodyEl.appendChild(p);
}

function showResultsTargets(targets: WorkerTarget): void {
  resultsTargetsEl.innerHTML = FLAVOR_KEYS.map((k) => {
    const val = targets[k as keyof WorkerTarget] ?? 0;
    const zeroClass = val === 0 ? " flavor-pill--zero" : "";
    const name = getFlavorName(k);
    return `<span title="${name}" class="flavor-pill flavor-pill--${k}${zeroClass}">${escapeHtml(val.toLocaleString())}</span>`;
  }).join("");
}

function clearResultsTargets(): void {
  resultsTargetsEl.innerHTML = "";
}

/** Before any search has finished — welcoming placeholder in the results panel. */
function showIdleResults(): void {
  summaryEl.textContent = "";
  clearResultsTargets();
  renderResultsBodyMessage(RESULTS_IDLE_BODY);
}

function renderResults(
  combos: ReturnType<typeof findBerryCombinations>,
  onDone?: () => void,
  options?: { totalBeforeInventory?: number; summaryText?: string },
): void {
  const totalBefore = options?.totalBeforeInventory;
  const invFiltered = totalBefore !== undefined && totalBefore > combos.length;

  summaryEl.textContent =
    options?.summaryText ??
    (combos.length === 0
      ? totalBefore !== undefined && totalBefore > 0
        ? `No combinations match your inventory (${totalBefore.toLocaleString()} before filter). Try raising caps or clearing fields.`
        : "No valid matching combinations for these targets. Try relaxing the flavor targets."
      : invFiltered
        ? `${combos.length.toLocaleString()} combination${combos.length === 1 ? "" : "s"}, lowest calorie first (${totalBefore!.toLocaleString()} before inventory filter).`
        : `${combos.length.toLocaleString()} combination${combos.length === 1 ? "" : "s"}, lowest calorie first.`);

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
      const { details, berryLine } = describeRecipe(combo);
      const li = document.createElement("li");
      li.className = "combo-row";

      const rank = document.createElement("span");
      rank.className = "combo-rank";
      rank.textContent = `#${i + 1}`;

      const berries = document.createElement("span");
      berries.className = "combo-berries";
      berries.textContent = berryLine;

      const donutCell = document.createElement("div");
      donutCell.className = "combo-donut-cell";
      const donutStack = document.createElement("div");
      donutStack.className = "combo-donut-stack";
      const imgSrc = donutImageUrl(
        details.donutLevel.stars,
        details.flavorSummary.dominantFlavor,
      );
      if (imgSrc) {
        const donutImg = document.createElement("img");
        donutImg.className = "combo-donut-img";
        donutImg.src = imgSrc;
        donutImg.alt = "";
        donutImg.decoding = "async";
        donutImg.setAttribute("aria-hidden", "true");
        donutStack.appendChild(donutImg);
      }
      appendStarRow(donutStack, details.donutLevel.stars);
      donutCell.appendChild(donutStack);

      const flavors = document.createElement("div");
      flavors.className = "combo-flavors";

      const flavorStats = document.createElement("div");
      flavorStats.className = "combo-flavor-stats";

      const detailsLink = document.createElement("a");
      detailsLink.className = "combo-flavor-details-link";
      detailsLink.href = ROTOM_DONUT_MAKER_DETAILS_BASE + compressRecipe(combo);
      detailsLink.textContent = "Details";
      detailsLink.target = "_blank";
      detailsLink.rel = "noopener noreferrer";
      detailsLink.appendChild(createFAIcon("external-link"));

      const flavorTotal = document.createElement("span");
      flavorTotal.className = "combo-flavor-total";
      flavorTotal.textContent = `Flavor Score: ${details.flavorSummary.totalFlavorScore.toLocaleString()}`;

      const levelBoostEl = document.createElement("span");
      levelBoostEl.className = "combo-flavor-level-boost";
      levelBoostEl.textContent = `Level Boost: +${details.levelBonus.toLocaleString(
        undefined,
        {
          maximumFractionDigits: 2,
        },
      )}`;

      flavorStats.append(detailsLink, flavorTotal, levelBoostEl);

      const flavorPills = document.createElement("span");
      flavorPills.className = "combo-flavor-pills";
      flavorPills.innerHTML = flavorBreakdownHtml(combo);

      flavors.append(flavorPills, flavorStats);

      const cal = document.createElement("span");
      cal.className = "combo-cal";
      cal.textContent = `${details.calories.toLocaleString()} Cal`;

      li.append(rank, berries, donutCell, flavors, cal);
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

  showResultsTargets(workerTarget);

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

const maximizerForm =
  document.querySelector<HTMLFormElement>("#maximizer-form")!;
const maximizerSubmitBtn =
  document.querySelector<HTMLButtonElement>("#maximizer-submit-btn")!;
const maximizerErrorEl =
  document.querySelector<HTMLParagraphElement>("#maximizer-error")!;

maximizerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  maximizerErrorEl.hidden = true;
  maximizerErrorEl.textContent = "";

  const fd = new FormData(maximizerForm);
  const primary = fd.get("primary") as MaximizerPriority;
  const secondaryRaw = fd.get("secondary") as string;
  const secondary = secondaryRaw
    ? (secondaryRaw as MaximizerPriority)
    : null;

  maximizerSubmitBtn.disabled = true;
  lastFullCombos = null;
  summaryEl.textContent = "";
  clearResultsTargets();
  bodyEl.replaceChildren();
  setCalculating(true);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        const results = maximizerSearch(
          primary,
          secondary,
          readInventoryCaps(),
        );
        const label = priorityLabel(primary);
        const tbLabel = secondary
          ? `, tie-breaker: ${priorityLabel(secondary)}`
          : "";
        const summaryText =
          results.length === 0
            ? "No recipes could be built from your current inventory."
            : `Top ${results.length.toLocaleString()} recipe${results.length === 1 ? "" : "s"} maximizing ${label}${tbLabel}.`;
        renderResults(
          results,
          () => {
            setCalculating(false);
            maximizerSubmitBtn.disabled = false;
          },
          { summaryText },
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Something went wrong.";
        maximizerErrorEl.textContent = message;
        maximizerErrorEl.hidden = false;
        showIdleResults();
        setCalculating(false);
        maximizerSubmitBtn.disabled = false;
      }
    });
  });
});

showIdleResults();
