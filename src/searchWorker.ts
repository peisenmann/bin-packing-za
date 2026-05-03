/// <reference lib="webworker" />

import { findBerryCombinations } from "./lib/find-berry-combinations";

export type WorkerTarget = {
	sweet: number;
	spicy: number;
	sour: number;
	bitter: number;
	fresh: number;
};

type WorkerResult =
	| { ok: true; combos: ReturnType<typeof findBerryCombinations> }
	| { ok: false; message: string };

self.onmessage = (event: MessageEvent<WorkerTarget>) => {
	try {
		const combos = findBerryCombinations(event.data);
		const result: WorkerResult = { ok: true, combos };
		self.postMessage(result);
	} catch (err) {
		const result: WorkerResult = {
			ok: false,
			message: err instanceof Error ? err.message : String(err),
		};
		self.postMessage(result);
	}
};
