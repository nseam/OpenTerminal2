import { AppStaticSettings } from "./AppStaticSettings";

/**
 * Palette used to color the values of the indicators.
 *
 * The colors are soft pastel tones (light, moderately chromatic) so a chart with several
 * multi-value indicators stays easy on the eye, yet they are still far enough apart to be told
 * apart on the black background. The set was picked by maximizing the smallest CIELAB distance
 * between any two entries (min ΔE ≈ 17.9) while keeping every color light (L* 66..80), moderately
 * saturated (chroma 30..66) and readable on black (contrast ≥ 8:1).
 *
 * The entries are sorted by color — by hue (red → orange → yellow → green → cyan → blue → violet →
 * magenta → red) and, within a hue, from darker to lighter — so the swatch grid reads as a
 * spectrum.
 */
export const INDICATOR_PALETTE: readonly string[] = [
    '#f47e71', '#f7b49c', '#f08547', '#f3a968',
    '#c7996b', '#efa039', '#eabd43', '#d9c368',
    '#cbbd86', '#b1c464', '#a3d558', '#b2d090',
    '#7ab464', '#73d369', '#68b68a', '#3cdd97',
    '#3cddc2', '#5ebaae', '#36d7e2', '#4daecb',
    '#34aaef', '#8ec5f6', '#949fd6', '#899bf5',
    '#bf89f5', '#e7a3f5', '#e87de4', '#ca91c2',
    '#f476b1', '#f6acc7', '#f47b93', '#d98c8f',
];

/**
 * Number of colors the given indicator needs, i.e. the number of bullets shown for it.
 *
 * The count comes from the indicator's `valueTitles` in `AppStaticSettings`, which lists one title
 * per emitted value. Indicators with a single value have no titles configured, so they report 1.
 *
 * Indicators with four values are drawn as candlesticks (see `Series.setData()`), whose bars are
 * colored by the bull/bear relationship instead of by the indicator's color, so they only get a
 * single color — the one used by their last-price line and their tooltip entry.
 */
export function getIndicatorColorCount(typeId: string): number {
    const indicator = AppStaticSettings.indicators.find(candidate => candidate.typeId === typeId);
    const count = indicator?.valueTitles.length ?? 0;

    return count === 4 ? 1 : Math.max(1, count);
}

/**
 * Titles of the values the given indicator emits, in emission order.
 *
 * Values without a configured title get an empty string, so callers can fall back to a generic
 * label (e.g. "Value 2").
 */
export function getIndicatorValueTitles(typeId: string): string[] {
    const indicator = AppStaticSettings.indicators.find(candidate => candidate.typeId === typeId);

    return [...(indicator?.valueTitles ?? [])];
}

/**
 * Converts an HSL color into a `#rrggbb` string.
 *
 * @param hue Hue in degrees, wrapped into 0..360.
 * @param saturation Saturation as a 0..1 fraction.
 * @param lightness Lightness as a 0..1 fraction.
 */
function hslToHex(hue: number, saturation: number, lightness: number): string {
    const h = (((hue % 360) + 360) % 360) / 360;
    const s = saturation;
    const l = lightness;

    const hueToRgb = (p: number, q: number, t: number): number => {
        let tt = t;

        if (tt < 0) tt += 1;
        if (tt > 1) tt -= 1;
        if (tt < 1 / 6) return p + (q - p) * 6 * tt;
        if (tt < 1 / 2) return q;
        if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;

        return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    const channels = [
        hueToRgb(p, q, h + 1 / 3),
        hueToRgb(p, q, h),
        hueToRgb(p, q, h - 1 / 3),
    ];

    return `#${channels.map(channel => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Picks `count` random colors from the palette, avoiding the colors that are already in use.
 *
 * The palette is shuffled, so every indicator gets its own set of colors, and colors used by the
 * other indicators of the chart are skipped while there are enough unused ones left. When more
 * colors are requested than the palette holds, the extra ones are generated from evenly spread
 * hues so they stay distinct.
 *
 * @param count Number of colors to return.
 * @param used Colors that are already taken, e.g. by the other indicators of the chart.
 */
export function randomIndicatorColors(count: number, used: Iterable<string> = []): string[] {
    const usedColors = new Set(Array.from(used, color => color.toLowerCase()));
    const unused = INDICATOR_PALETTE.filter(color => !usedColors.has(color.toLowerCase()));
    const pool = [...(unused.length >= count ? unused : INDICATOR_PALETTE)];

    // Fisher-Yates shuffle, so the same indicator type does not always get the same colors.
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const colors: string[] = [];

    for (let i = 0; i < count; i++) {
        // More values than palette entries: derive the extra colors from spread-out hues, keeping
        // them in the same soft range as the palette.
        colors.push(i < pool.length ? pool[i] : hslToHex(i * 137.508, 0.65, 0.70));
    }

    return colors;
}

/**
 * Whether the given value is a usable `#rrggbb` color string.
 */
function isColorString(color: unknown): color is string {
    return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color.trim());
}

/**
 * Returns the colors of the given indicator's values without modifying it.
 *
 * This is what the UI renders, so it must stay free of side effects: it is called from the
 * template. Missing colors are filled in from the palette. Use
 * `ensureChartsIndicatorColors()` to persist a randomized set instead.
 */
export function resolveIndicatorColors(indicator: { typeId: string; colors?: string[]; color?: string }): string[] {
    const count = getIndicatorColorCount(indicator.typeId);

    const colors = Array.isArray(indicator.colors)
        ? indicator.colors.filter(isColorString).slice(0, count)
        : [];

    for (let index = colors.length; index < count; index++)
        colors.push(INDICATOR_PALETTE[index % INDICATOR_PALETTE.length]);

    return colors;
}

/**
 * Normalizes the colors of every indicator of the given charts, in place.
 *
 * Used when the roaming state is loaded (from the local storage, a project file or the undo
 * history), so the rest of the app can rely on every indicator having one color per value.
 *
 * Colors are randomized per chart while skipping the ones already taken by the chart's other
 * indicators, so the lines of a chart stay distinguishable from each other.
 */
export function ensureChartsIndicatorColors(charts: { indicators?: { typeId: string; colors?: string[]; color?: string }[] }[]): void {
    for (const chart of charts) {
        if (!Array.isArray(chart?.indicators))
            continue;

        const used: string[] = [];

        for (const indicator of chart.indicators) {
            const count = getIndicatorColorCount(indicator.typeId);
            const stored = Array.isArray(indicator.colors)
                ? indicator.colors.filter(isColorString)
                : [];

            if (stored.length === count) {
                delete indicator.color;
                used.push(...stored);

                continue;
            }

            const colors = stored.slice(0, count);

            if (colors.length < count)
                colors.push(...randomIndicatorColors(count - colors.length, [...used, ...colors]));

            indicator.colors = colors;
            delete indicator.color;
            used.push(...colors);
        }
    }
}
