/** Shape of `src/assets/known_results/<preset-id>.json` (see `scripts/cache-known-results.ts`). */
export interface KnownResultsPayload {
  readonly presetId: string;
  readonly generatedAt: string;
  readonly target: {
    readonly fresh: number;
    readonly sour: number;
    readonly bitter: number;
    readonly sweet: number;
    readonly spicy: number;
  };
  readonly comboCount: number;
  readonly combos: string[];
}
