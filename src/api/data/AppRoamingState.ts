import { nextTick, reactive, watch } from "vue";

export interface AppRoamingStateChart {
    uuid: string;
    title: string;
    indicators: {
        uuid: string;
        typeId: string;
        config: any;
        /**
         * Whether the indicator's data is drawn on the chart. Persisted with the rest of the
         * roaming state, so the choice survives a page reload.
         */
        visible?: boolean;
        /**
         * Color the indicator is drawn with, as a `#rrggbb` string. Stored per indicator so the
         * color stays with it when the list is reordered.
         */
        color?: string;
        /**
         * Whether the indicator's settings panel is collapsed. Persisted with the rest of the
         * roaming state, so the layout survives a page reload.
         */
        collapsed?: boolean;
    }[];
}

/**
 * The part of the roaming state that is tracked by the undo/redo history.
 *
 * Only serializable data is kept, so a snapshot can be written back into the reactive state at
 * any time without dragging proxies or functions along.
 */
interface AppRoamingStateSnapshot {
    charts: AppRoamingStateChart[];
}

/** Maximum number of states kept in the undo/redo history. */
export const APP_ROAMING_STATE_HISTORY_LIMIT = 100;

/**
 * Delay (in milliseconds) used to coalesce rapid changes into a single history entry, so that
 * typing a chart title does not create one entry per keystroke.
 */
export const APP_ROAMING_STATE_HISTORY_DEBOUNCE = 300;

/** Called after undo/redo restored a previous state. */
export type AppRoamingStateRestoredListener = (state: AppRoamingStateType) => void;

/** Undo/redo API exposed by the roaming state. */
export interface AppRoamingStateHistoryApi {
    /** Whether there is a previous state that can be restored. */
    readonly canUndo: boolean;
    /** Whether there is an undone state that can be restored again. */
    readonly canRedo: boolean;
    /** Number of states currently stored in the history. */
    readonly historyLength: number;
    /** Index of the state that is currently applied. */
    readonly historyIndex: number;
    /**
     * Restores the state that was active before the last change.
     * @returns True if a previous state was restored.
     */
    undo(): boolean;
    /**
     * Re-applies the state that was undone by the last undo.
     * @returns True if a state was restored.
     */
    redo(): boolean;
    /** Drops the whole history and starts over from the current state. */
    resetHistory(): void;
    /**
     * Registers a listener that is called after undo/redo restored a state.
     * @returns A function that unregisters the listener.
     */
    onRestored(listener: AppRoamingStateRestoredListener): () => void;
}

export interface AppRoamingStateType extends AppRoamingStateHistoryApi {
    charts:  AppRoamingStateChart[];
}

/**
 * Undo/redo history.
 *
 * Kept in its own reactive object instead of inside the roaming state, because the deep watcher
 * below would otherwise record the history bookkeeping itself as a change.
 */
const history = reactive({
    /** Serialized snapshots, oldest first. */
    entries: [] as string[],
    /** Index of the snapshot that is currently applied to the state. */
    index: -1,
    /** Whether a change is waiting for its debounced commit. */
    pending: false
});

/** Listeners notified after a state has been restored by undo/redo. */
const restoredListeners = new Set<AppRoamingStateRestoredListener>();

/** Pending debounced history commit. */
let commitTimer: ReturnType<typeof setTimeout> | null = null;

/** Number of restores that are still waiting for their watcher flush to settle. */
let restoreDepth = 0;

/** Serializes the part of the state that is tracked by the history. */
function serialize(): string {
    const snapshot: AppRoamingStateSnapshot = { charts: AppRoamingState.charts };

    return JSON.stringify(snapshot);
}

/** Appends the current state to the history, dropping the redo tail. */
function commit(): void {
    history.pending = false;

    const snapshot = serialize();

    // Nothing changed since the current history entry (e.g. a change was reverted by hand).
    if (history.index >= 0 && history.entries[history.index] === snapshot)
        return;

    // A new change invalidates everything that was undone before it.
    if (history.index < history.entries.length - 1)
        history.entries.splice(history.index + 1);

    history.entries.push(snapshot);

    // Keep only the most recent entries.
    if (history.entries.length > APP_ROAMING_STATE_HISTORY_LIMIT)
        history.entries.splice(0, history.entries.length - APP_ROAMING_STATE_HISTORY_LIMIT);

    history.index = history.entries.length - 1;
    history.pending = false;
}

/** Commits a pending debounced change immediately. */
function flush(): void {
    if (commitTimer === null)
        return;

    clearTimeout(commitTimer);
    commitTimer = null;

    commit();
}

/** Schedules a history commit, coalescing rapid changes into a single entry. */
function scheduleCommit(): void {
    // A restore is not a user change, so it must not end up in the history.
    if (restoreDepth > 0)
        return;

    if (commitTimer !== null)
        clearTimeout(commitTimer);

    history.pending = true;

    commitTimer = setTimeout(() => {
        commitTimer = null;

        commit();
    }, APP_ROAMING_STATE_HISTORY_DEBOUNCE);
}

/**
 * Commits the value of the focused input, if any.
 *
 * Input components keep their own copy of the value while they are being edited and only write it
 * back on blur/change. Without this, an undo performed while an input is focused would restore the
 * old value and the input would then overwrite it again as soon as it loses focus.
 */
function commitFocusedInput(): void {
    const active = document.activeElement as HTMLElement | null;

    if (!active || active === document.body)
        return;

    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement)
        active.blur();
}

/** Writes a snapshot back into the roaming state. */
function restore(snapshot: string): void {
    const parsed = JSON.parse(snapshot) as AppRoamingStateSnapshot;

    restoreDepth++;

    AppRoamingState.charts = Array.isArray(parsed.charts) ? parsed.charts : [];

    // The deep watcher runs asynchronously, so the flag has to stay set until the pending flush
    // is done, otherwise the restore itself would be recorded as a new change.
    nextTick(() => {
        restoreDepth--;

        if (restoreDepth > 0)
            return;

        for (const listener of restoredListeners) {
            try {
                listener(AppRoamingState);
            }
            catch (error) {
                console.error('A roaming state restore listener failed.', error);
            }
        }
    });
}

export const AppRoamingState = reactive({
    charts: [] as AppRoamingStateChart[],

    get canUndo(): boolean {
        // A change that is still waiting for its debounced commit can already be undone.
        if (history.pending)
            return history.index >= 0;

        return history.index > 0;
    },

    get canRedo(): boolean {
        // A pending change would invalidate the redo tail, so redo is not available until it is
        // committed.
        if (history.pending)
            return false;

        return history.index < history.entries.length - 1;
    },

    get historyLength(): number {
        return history.entries.length;
    },

    get historyIndex(): number {
        return history.index;
    },

    undo(): boolean {
        // Committing the focused input first makes sure its value is part of the history entry
        // that is about to be left behind.
        commitFocusedInput();

        // Make sure the most recent change is part of the history before stepping back.
        flush();

        if (history.index <= 0)
            return false;

        history.index--;

        restore(history.entries[history.index]);

        return true;
    },

    redo(): boolean {
        commitFocusedInput();

        flush();

        if (history.index >= history.entries.length - 1)
            return false;

        history.index++;

        restore(history.entries[history.index]);

        return true;
    },

    resetHistory(): void {
        if (commitTimer !== null) {
            clearTimeout(commitTimer);
            commitTimer = null;
        }

        history.entries.length = 0;
        history.index = -1;
        history.pending = false;

        commit();
    },

    onRestored(listener: AppRoamingStateRestoredListener): () => void {
        restoredListeners.add(listener);

        return () => { restoredListeners.delete(listener); };
    }
}) as unknown as AppRoamingStateType;

// Loading app roaming state from the local storage if available.
const savedState = localStorage.getItem('AppRoamingState');

if (savedState) {
    try {
        const parsed = JSON.parse(savedState);

        if (Array.isArray(parsed?.charts))
            AppRoamingState.charts = parsed.charts;
    }
    catch (error) {
        console.error('Failed to load the app roaming state from the local storage.', error);
    }
}

// Seeding the history with the state the application starts with, so the first change can be
// undone back to it.
commit();

// Persisting app roaming state to the local storage whenever it changes.
watch(
    () => AppRoamingState.charts,
    () => {
        // Only the charts are persisted; the undo/redo bookkeeping lives outside of the state.
        localStorage.setItem('AppRoamingState', JSON.stringify({ charts: AppRoamingState.charts }));

        scheduleCommit();
    },
    { deep: true }
); 