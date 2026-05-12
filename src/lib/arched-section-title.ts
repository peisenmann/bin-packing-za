/** Default SVG canvas for the preset arch path (`pathD`). */
export const DEFAULT_ARCHED_SECTION_TITLE_VIEWBOX = "0 0 432 84";

/** Bottom-to-peak quadratic arch (same coordinate space as default viewBox). */
export const DEFAULT_ARCHED_SECTION_TITLE_PATH_D = "M 27 66 Q 216 9 405 10";

const VIEW_MARGIN_X = 16;
const WORD_GAP_X = -10;

export interface ArchedSectionTitleOptions {
  /** Visible title text (HTML-escaped when emitted). */
  title: string;
  /**
   * Prefix for SVG element ids (`${prefix}-shadow`, `${prefix}-arc`).
   * Must differ for each title instance on the page (letters, digits, `-`, `_`).
   */
  idPrefix: string;
  /** When set, applied as the root `<h2 id="…">` (for `aria-labelledby`, anchors). */
  headingId?: string;
  viewBox?: string;
  pathD?: string;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replaceAll('"', "&quot;");
}

function sanitizeIdPrefix(prefix: string): string {
  const trimmed = prefix.trim();
  if (!trimmed) {
    throw new Error("archedSectionTitleHtml: idPrefix is required");
  }
  let s = trimmed.replace(/[^a-zA-Z0-9_-]/g, "-");
  s = s.replace(/-+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
  if (!s) {
    throw new Error(`archedSectionTitleHtml: invalid idPrefix "${prefix}"`);
  }
  return s;
}

function parseViewBoxWidth(viewBox: string): number {
  const parts = viewBox.trim().split(/\s+/);
  if (parts.length >= 3) {
    const w = Number(parts[2]);
    if (Number.isFinite(w) && w > 0) {
      return w;
    }
  }
  return 432;
}

/** Split title into words (runs); each gets its own baseline→peak arc segment. */
function splitTitleWords(title: string): string[] {
  return title.trim().split(/\s+/).filter(Boolean);
}

/**
 * One bottom→peak quadratic path per word; widths scale by character count.
 */
export function archPathsForWords(
  words: string[],
  viewBoxWidth: number,
): string[] {
  const n = words.length;
  if (n === 0) {
    return [];
  }
  const totalChars = words.reduce((sum, w) => sum + w.length, 0);
  if (totalChars === 0) {
    return [];
  }

  const usable =
    viewBoxWidth - 2 * VIEW_MARGIN_X - Math.max(0, n - 1) * WORD_GAP_X;

  const paths: string[] = [];
  let cursor = VIEW_MARGIN_X;

  for (let i = 0; i < n; i++) {
    const w = words[i]!;
    const segW = usable * (w.length / totalChars);
    const left = cursor;
    const right = left + segW;
    const mid = left + segW / 2;
    paths.push(`M ${left} 66 Q ${mid} 9 ${right} 10`);
    cursor = right + WORD_GAP_X;
  }

  return paths;
}

function wordLayersHtml(
  id: string,
  pathSuffix: string,
  safeWord: string,
): string {
  const href = `#${id}-arc${pathSuffix}`;
  return `<text class="section-title__outline-outer">
        <textPath href="${href}" startOffset="50%" text-anchor="middle">${safeWord}</textPath>
      </text>
      <text class="section-title__outline-inner">
        <textPath href="${href}" startOffset="50%" text-anchor="middle">${safeWord}</textPath>
      </text>
      <text class="section-title__fill">
        <textPath href="${href}" startOffset="50%" text-anchor="middle">${safeWord}</textPath>
      </text>`;
}

/**
 * HTML for an `<h2>` with arched, stroked SVG text (game-style section title).
 * Inject with `insertAdjacentHTML` or assign to `element.innerHTML` inside a container.
 *
 * Multiple words: each word sits on its own baseline→peak arc (same shape, proportional width).
 */
export function archedSectionTitleHtml(
  options: ArchedSectionTitleOptions,
): string {
  const title = options.title;
  const id = sanitizeIdPrefix(options.idPrefix);
  const viewBox = options.viewBox ?? DEFAULT_ARCHED_SECTION_TITLE_VIEWBOX;
  const viewW = parseViewBoxWidth(viewBox);
  const words = splitTitleWords(title);

  const safeText = escapeHtml(title);
  const safeAttr = escapeAttr(title);
  const headingIdAttr =
    options.headingId !== undefined
      ? ` id="${escapeAttr(sanitizeIdPrefix(options.headingId))}"`
      : "";

  let pathDefsHtml: string;
  let graphicInnerHtml: string;

  if (words.length <= 1) {
    const pathD =
      options.pathD ??
      (words.length === 1 ? DEFAULT_ARCHED_SECTION_TITLE_PATH_D : "");
    if (!pathD) {
      throw new Error("archedSectionTitleHtml: empty title");
    }
    pathDefsHtml = `<path id="${id}-arc" fill="none" d="${escapeAttr(pathD)}" />`;
    graphicInnerHtml = `<g class="section-title__graphic" filter="url(#${id}-shadow)">
      ${wordLayersHtml(id, "", safeText)}
    </g>`;
  } else {
    const paths = archPathsForWords(words, viewW);
    pathDefsHtml = paths
      .map(
        (d, i) =>
          `<path id="${id}-arc-${i}" fill="none" d="${escapeAttr(d)}" />`,
      )
      .join("\n      ");

    const wordsHtml = words
      .map((word, i) => {
        const safeWord = escapeHtml(word);
        return `<g class="section-title__word">
      ${wordLayersHtml(id, `-${i}`, safeWord)}
    </g>`;
      })
      .join("\n    ");

    graphicInnerHtml = `<g class="section-title__graphic" filter="url(#${id}-shadow)">
    ${wordsHtml}
  </g>`;
  }

  return `<h2 class="section-title section-title--arched"${headingIdAttr} aria-label="${safeAttr}">
  <svg
    class="section-title__svg"
    viewBox="${escapeAttr(viewBox)}"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <filter
        id="${id}-shadow"
        x="-45%"
        y="-45%"
        width="190%"
        height="190%"
      >
        <feDropShadow
          dx="5"
          dy="7"
          stdDeviation="5.5"
          flood-opacity="0.52"
          flood-color="#b3c2d4"
        />
      </filter>
      ${pathDefsHtml}
    </defs>
    ${graphicInnerHtml}
  </svg>
</h2>`;
}
