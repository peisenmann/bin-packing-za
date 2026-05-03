import alphaOldFashionedKnownUrl from "../assets/known_results/alpha-old-fashioned.json?url";
import badDreamsCrullerKnownUrl from "../assets/known_results/bad-dreams-cruller.json?url";
import deltaOldFashionedKnownUrl from "../assets/known_results/delta-old-fashioned.json?url";
import omegaOldFashionedKnownUrl from "../assets/known_results/omega-old-fashioned.json?url";
import plasmaGlazedKnownUrl from "../assets/known_results/plasma-glazed.json?url";
import alphaOldFashionedIcon from "../assets/img/alpha_old_fashioned.png";
import badDreamsCrullerIcon from "../assets/img/bad_dreams_cruller.png";
import deltaOldFashionedIcon from "../assets/img/delta_old_fashioned.png";
import omegaOldFashionedIcon from "../assets/img/omega_old_fashioned.png";
import plasmaGlazedIcon from "../assets/img/plasma_glazed.png";

/**
 * Flavor minimums for Pokémon Legends Z-A Mega Dimension special donuts.
 * Source: Game8 — All Special Donut Recipes (accessed via official flavor tables).
 * @see https://game8.co/games/Pokemon-Legends-Z-A/archives/571058
 */
export interface SpecialDonutPreset {
	readonly id: string;
	/** Button label */
	readonly label: string;
	/** Resolved asset URL (Vite) */
	readonly iconSrc: string;
	/** Precomputed combos (`bun run cache-known-results`) */
	readonly knownResultsUrl: string;
	readonly fresh: number;
	readonly sour: number;
	readonly bitter: number;
	readonly sweet: number;
	readonly spicy: number;
}

export const SPECIAL_DONUT_PRESETS: readonly SpecialDonutPreset[] = [
	{
		id: "bad-dreams-cruller",
		label: "Bad Dreams Cruller",
		iconSrc: badDreamsCrullerIcon,
		knownResultsUrl: badDreamsCrullerKnownUrl,
		sweet: 310,
		spicy: 100,
		sour: 310,
		bitter: 40,
		fresh: 40,
	},
	{
		id: "delta-old-fashioned",
		label: "Delta Old Fashioned",
		iconSrc: deltaOldFashionedIcon,
		knownResultsUrl: deltaOldFashionedKnownUrl,
		sweet: 120,
		spicy: 40,
		sour: 340,
		bitter: 40,
		fresh: 390,
	},
	{
		id: "omega-old-fashioned",
		label: "Omega Old Fashioned",
		iconSrc: omegaOldFashionedIcon,
		knownResultsUrl: omegaOldFashionedKnownUrl,
		sweet: 260,
		spicy: 160,
		sour: 160,
		bitter: 20,
		fresh: 260,
	},
	{
		id: "alpha-old-fashioned",
		label: "Alpha Old Fashioned",
		iconSrc: alphaOldFashionedIcon,
		knownResultsUrl: alphaOldFashionedKnownUrl,
		sweet: 50,
		spicy: 50,
		sour: 210,
		bitter: 180,
		fresh: 370,
	},
	{
		id: "plasma-glazed",
		label: "Plasma-Glazed",
		iconSrc: plasmaGlazedIcon,
		knownResultsUrl: plasmaGlazedKnownUrl,
		sweet: 40,
		spicy: 200,
		sour: 400,
		bitter: 280,
		fresh: 40,
	},
] as const;
