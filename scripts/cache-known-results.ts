/**
 * Regenerates cached combo lists for each special donut preset.
 * Run: `bun run cache-known-results`
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findBerryCombinations } from "../src/lib/find-berry-combinations.ts";
import type { KnownResultsPayload } from "../src/lib/known-results-types.ts";
import { SPECIAL_DONUT_PRESETS } from "../src/lib/special-donut-presets.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src/assets/known_results");

await mkdir(outDir, { recursive: true });

for (const preset of SPECIAL_DONUT_PRESETS) {
	const target = {
		fresh: preset.fresh,
		sour: preset.sour,
		bitter: preset.bitter,
		sweet: preset.sweet,
		spicy: preset.spicy,
	} as const;

	console.log(`Generating ${preset.id}...`);
	const started = performance.now();
	const combos = findBerryCombinations(target);
	const ms = Math.round(performance.now() - started);

	const payload: KnownResultsPayload = {
		presetId: preset.id,
		generatedAt: new Date().toISOString(),
		target: { ...target },
		comboCount: combos.length,
		combos,
	};

	const filePath = join(outDir, `${preset.id}.json`);
	await writeFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
	console.log(`Wrote ${filePath} (${combos.length} combos, ${ms}ms)`);
}
