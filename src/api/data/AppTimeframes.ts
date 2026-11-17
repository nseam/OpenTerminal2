/**
 * Time-frames a chart and its indicators can be run on.
 *
 * The ids are the keys of the `timeframes` object exported by the wasm module, so the numeric
 * `ENUM_TIMEFRAMES` value the wasm layer expects is `lib.timeframes[id]`. `CURRENT` is deliberately
 * not offered: the wasm platform rejects it when it has to create the candle indicator a
 * time-frame needs.
 */
export interface AppTimeframe {
    /** Key in the wasm module's `timeframes` object, e.g. `M1`. */
    id: string;
    /** Label shown in the selectors. */
    label: string;
    /** Length of the time-frame in minutes. */
    minutes: number;
}

/** Time-frames offered by the chart and indicator selectors, shortest first. */
export const APP_TIMEFRAMES: readonly AppTimeframe[] = [
    { id: 'M1', label: 'M1', minutes: 1 },
    { id: 'M2', label: 'M2', minutes: 2 },
    { id: 'M3', label: 'M3', minutes: 3 },
    { id: 'M4', label: 'M4', minutes: 4 },
    { id: 'M5', label: 'M5', minutes: 5 },
    { id: 'M6', label: 'M6', minutes: 6 },
    { id: 'M10', label: 'M10', minutes: 10 },
    { id: 'M12', label: 'M12', minutes: 12 },
    { id: 'M15', label: 'M15', minutes: 15 },
    { id: 'M20', label: 'M20', minutes: 20 },
    { id: 'M30', label: 'M30', minutes: 30 },
    { id: 'H1', label: 'H1', minutes: 60 },
    { id: 'H2', label: 'H2', minutes: 120 },
    { id: 'H3', label: 'H3', minutes: 180 },
    { id: 'H4', label: 'H4', minutes: 240 },
    { id: 'H6', label: 'H6', minutes: 360 },
    { id: 'H8', label: 'H8', minutes: 480 },
    { id: 'H12', label: 'H12', minutes: 720 },
    { id: 'D1', label: 'D1', minutes: 1440 },
    { id: 'W1', label: 'W1', minutes: 10080 },
    { id: 'MN1', label: 'MN1', minutes: 43200 },
];

/** Time-frame used when neither the chart nor the indicator specifies one. */
export const APP_DEFAULT_TIMEFRAME = 'M1';

/**
 * Returns the time-frame with the given id.
 *
 * @returns The time-frame, or `undefined` when the id is empty or not selectable.
 */
export function findAppTimeframe(id: string | null | undefined): AppTimeframe | undefined {
    if (!id)
        return undefined;

    return APP_TIMEFRAMES.find(timeframe => timeframe.id === id);
}

/**
 * Normalizes a stored time-frame id.
 *
 * Charts and indicators saved before time-frames were selectable have none, and a project saved by
 * a newer build may name a time-frame this build does not know, so anything unrecognized falls
 * back to the default one.
 */
export function normalizeAppTimeframe(id: string | null | undefined): string {
    return findAppTimeframe(id)?.id ?? APP_DEFAULT_TIMEFRAME;
}

/**
 * Resolves the time-frame an indicator is actually calculated on.
 *
 * An indicator without its own time-frame follows the chart, which is what the UI calls
 * "Same as chart". An empty string counts as "no time-frame", so a project that stored one is
 * still treated as following the chart.
 *
 * @param chartTimeframe Time-frame of the chart the indicator belongs to.
 * @param indicatorTimeframe Time-frame configured on the indicator, if any.
 */
export function resolveAppTimeframe(
    chartTimeframe: string | null | undefined,
    indicatorTimeframe: string | null | undefined
): string {
    return normalizeAppTimeframe(indicatorTimeframe || chartTimeframe);
}
