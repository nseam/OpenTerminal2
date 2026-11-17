<!-- TEMPLATE -->

<template>

    <div
        ref="root"
        class="opfs-explorer flex flex-col flex-0 border border-gray-800 rounded-lg"
        tabindex="0"
        @keydown="onKeyDown"
        @mousedown="onRootMouseDown"
    >

        <div class="opfs-explorer-toolbar flex flex-row items-center p-2 gap-4">

            <span class="opfs-explorer-disk flex-1" :title="diskUsageText">{{ diskUsageText }}</span>

            <ElButton title="Refresh (Ctrl+R)" @click="refreshAll()">Refresh</ElButton>

        </div>

        <div class="opfs-explorer-panels flex flex-row p-2">

            <div
                v-for="panel in panels"
                :key="panel.id"
                class="opfs-panel flex flex-col border border-gray-800"
                :class="{ 'is-active': activePanelId === panel.id }"
                @mousedown="activatePanel(panel.id)"
            >

                <div class="opfs-panel-path p-2" :title="'/' + panel.path">
                    <span class="opfs-panel-path-root">/</span>
                    <span class="opfs-panel-path-text">{{ panel.path }}</span>
                </div>

                <div class="opfs-panel-list">

                    <div v-if="panel.loading" class="opfs-panel-message">Loading…</div>

                    <div v-else-if="panel.error" class="opfs-panel-message is-error" :title="panel.error">{{ panel.error }}</div>

                    <div v-else-if="panel.entries.length === 0" class="opfs-panel-message">Empty</div>

                    <template v-else>
                        <div
                            v-for="(entry, index) in panel.entries"
                            :key="entry.kind === 'parent' ? '..' : entry.fullPath"
                            class="opfs-entry py-2 px-2"
                            :class="{
                                'is-selected': panel.selectedIndex === index,
                                'is-directory': entry.kind === 'directory',
                                'is-parent': entry.kind === 'parent'
                            }"
                            :title="entry.kind === 'parent' ? 'Parent directory' : entry.fullPath"
                            @click="selectEntry(panel, index)"
                            @dblclick.stop="openEntry(panel, entry)"
                        >
                            <span class="opfs-entry-name text-sm">{{ entry.kind === 'directory' ? entry.name + '/' : entry.name }}</span>
                            <span class="opfs-entry-size text-sm">{{ entry.kind === 'file' ? formatSize(entry.size) : '' }}</span>
                        </div>
                    </template>

                </div>

            </div>

        </div>

        <div class="opfs-explorer-status col items-start m-2">
            <span class="opfs-status-name font-mono text-sm" :title="selectedEntry?.fullPath">{{ selectedEntry ? selectedEntry.name : '' }}</span>
            <span class="opfs-status-details flex-1 font-mono text-xs mt-1">{{ selectedEntryDetails }}</span>
        </div>

        <div class="border-b border-gray-800 my-2" />

        <div class="opfs-explorer-actions flex flex-row p-2">

            <ElButton class="row" :disabled="!canViewSelection" title="View (F3)" @click="viewSelected">View</ElButton>
            <ElButton class="row" :disabled="!canActOnSelection" title="Rename (F2)" @click="openRenameDialog">Rename</ElButton>
            <ElButton class="row" v-if="panels.length > 1" :disabled="!canActOnSelection" title="Copy (F5)" @click="openCopyDialog">Copy</ElButton>
            <ElButton class="row" v-if="panels.length > 1" :disabled="!canActOnSelection" title="Move (F6)" @click="openMoveDialog">Move</ElButton>
            <ElButton class="row" title="New folder (F7)" @click="openMkdirDialog">MkDir</ElButton>
            <ElButton class="row" type="danger" :disabled="!canActOnSelection" title="Delete (F8)" @click="openDeleteDialog">Delete</ElButton>

        </div>

        <ElDialog
            v-model="prompt.visible"
            :title="prompt.title"
            width="420px"
            append-to-body
            :close-on-click-modal="!prompt.busy"
            :close-on-press-escape="!prompt.busy"
        >
            <div class="opfs-dialog flex flex-col">

                <div class="opfs-dialog-label">{{ prompt.label }}</div>

                <ElInput
                    ref="promptInput"
                    v-model="prompt.value"
                    class="opfs-dialog-input"
                    @keydown.enter.prevent="confirmPrompt"
                />

                <div v-if="prompt.error" class="opfs-dialog-error">{{ prompt.error }}</div>

            </div>

            <template #footer>
                <ElButton :disabled="prompt.busy" @click="prompt.visible = false">Cancel</ElButton>
                <ElButton type="primary" :loading="prompt.busy" @click="confirmPrompt">{{ prompt.confirmLabel }}</ElButton>
            </template>
        </ElDialog>

        <ElDialog
            v-model="confirm.visible"
            :title="confirm.title"
            width="420px"
            append-to-body
            :close-on-click-modal="!confirm.busy"
            :close-on-press-escape="!confirm.busy"
        >
            <div class="opfs-dialog flex flex-col">
                <div class="opfs-dialog-label">{{ confirm.message }}</div>
            </div>

            <template #footer>
                <ElButton :disabled="confirm.busy" @click="confirm.visible = false">Cancel</ElButton>
                <ElButton type="danger" :loading="confirm.busy" @click="confirmAction">Delete</ElButton>
            </template>
        </ElDialog>

        <ElDialog
            v-model="preview.visible"
            :title="preview.title"
            width="720px"
            append-to-body
        >
            <div class="opfs-dialog flex flex-col">

                <div v-if="preview.binary" class="opfs-dialog-label">Binary file, showing a hexadecimal dump.</div>

                <pre class="opfs-preview">{{ preview.content }}</pre>

                <div v-if="preview.truncated" class="opfs-dialog-label">Preview truncated to the first {{ formatSize(PREVIEW_BYTES) }}.</div>

            </div>
        </ElDialog>

    </div>

</template>


<!-- SCRIPT -->

<script lang="ts">

    import { ElButton, ElDialog, ElInput, ElMessage } from 'element-plus';
    import { opfs, type OPFSEntry } from '@shared/api/OPFS';
    import { InvalidPath, Throwable } from '@shared/api/Throwables';

    /** Maximum number of bytes read when previewing a file. */
    const PREVIEW_BYTES = 64 * 1024;

    /** Number of entries the selection moves by on PageUp/PageDown. */
    const PAGE_STEP = 10;

    /**
     * Delay (in milliseconds) used to coalesce bursts of OPFS changes into a single refresh.
     *
     * Moving a folder emits one change per file it contains, so refreshing on every single one
     * would list the same directories over and over again.
     */
    const CHANGE_REFRESH_DEBOUNCE = 150;

    type PanelId = 'left' | 'right';

    type ExplorerEntryKind = 'parent' | 'file' | 'directory';

    /** A row rendered in a panel: a real OPFS entry or the synthetic `..` row. */
    interface ExplorerEntry {
        kind: ExplorerEntryKind;
        name: string;
        fullPath: string;
        size: number;
        date: Date | null;
    }

    /** State of a single panel of the two-panel file manager. */
    interface ExplorerPanel {
        id: PanelId;
        path: string;
        entries: ExplorerEntry[];
        selectedIndex: number;
        loading: boolean;
        error: string | null;
    }

    interface PromptState {
        visible: boolean;
        title: string;
        label: string;
        value: string;
        confirmLabel: string;
        busy: boolean;
        error: string;
        action: ((value: string) => Promise<void>) | null;
    }

    interface ConfirmState {
        visible: boolean;
        title: string;
        message: string;
        busy: boolean;
        action: (() => Promise<void>) | null;
    }

    interface PreviewState {
        visible: boolean;
        title: string;
        content: string;
        truncated: boolean;
        binary: boolean;
    }

    @Component({
        components: {
            ElButton,
            ElDialog,
            ElInput
        }
    })
    export class VOPFSExplorer extends Vue
    {
        /** Exposed to the template so the truncation notice can show the limit. */
        PREVIEW_BYTES = PREVIEW_BYTES;

        @Ref
        root!: HTMLDivElement;

        /** The text input of the prompt dialog, used to preselect the current value. */
        @Ref
        promptInput!: InstanceType<typeof ElInput>;

        /** The two panels, both starting at the OPFS root. */
        public panels: ExplorerPanel[] = [
            { id: 'left', path: '', entries: [], selectedIndex: 0, loading: false, error: null },
            /* { id: 'right', path: '', entries: [], selectedIndex: 0, loading: false, error: null } */
        ];

        public activePanelId: PanelId = 'left';

        public diskUsed: number = 0;

        public diskFree: number = 0;

        public prompt: PromptState = {
            visible: false,
            title: '',
            label: '',
            value: '',
            confirmLabel: 'OK',
            busy: false,
            error: '',
            action: null
        };

        public confirm: ConfirmState = {
            visible: false,
            title: '',
            message: '',
            busy: false,
            action: null
        };

        public preview: PreviewState = {
            visible: false,
            title: '',
            content: '',
            truncated: false,
            binary: false
        };

        /** Timer that coalesces OPFS change notifications into a single refresh. */
        private changeRefreshTimer: ReturnType<typeof setTimeout> | null = null;

        /** Unregisters the OPFS change listener, or `null` when not subscribed. */
        private unsubscribeFromOPFS: (() => void) | null = null;

        public async mounted(): Promise<void> {
            // Any OPFS change (a project being saved, renamed or deleted, ticks being uploaded,
            // or an action performed in this very explorer) refreshes the listing, so the panels
            // never show a stale tree.
            this.unsubscribeFromOPFS = opfs.onChange(() => this.scheduleRefresh());

            await this.refreshAll();
        }

        public unmounted(): void {
            this.unsubscribeFromOPFS?.();
            this.unsubscribeFromOPFS = null;

            this.cancelScheduledRefresh();
        }

        /** Schedules a refresh, replacing a refresh that is already pending. */
        private scheduleRefresh(): void {
            this.cancelScheduledRefresh();

            this.changeRefreshTimer = setTimeout(() => {
                this.changeRefreshTimer = null;

                // Silent, so a background refresh does not flash the loading state.
                void this.refreshAll(true);
            }, CHANGE_REFRESH_DEBOUNCE);
        }

        private cancelScheduledRefresh(): void {
            if (this.changeRefreshTimer === null)
                return;

            clearTimeout(this.changeRefreshTimer);
            this.changeRefreshTimer = null;
        }

        // ------------------------------------------------------------------------------------
        // Getters
        // ------------------------------------------------------------------------------------

        public get activePanel(): ExplorerPanel {
            return this.panels.find(panel => panel.id === this.activePanelId) ?? this.panels[0];
        }

        public get otherPanel(): ExplorerPanel {
            return this.panels.find(panel => panel.id !== this.activePanelId) ?? this.panels[1];
        }

        public get selectedEntry(): ExplorerEntry | null {
            const panel = this.activePanel;

            return panel.entries[panel.selectedIndex] ?? null;
        }

        /** Whether the selected row is a real file or folder, i.e. not the `..` row. */
        public get canActOnSelection(): boolean {
            const entry = this.selectedEntry;

            return entry !== null && entry.kind !== 'parent';
        }

        /** Whether the selected row is a file that can be previewed. */
        public get canViewSelection(): boolean {
            return this.selectedEntry?.kind === 'file';
        }

        public get diskUsageText(): string {
            if (this.diskUsed === 0 && this.diskFree === 0)
                return '';

            return `${this.formatSize(this.diskUsed)} used · ${this.formatSize(this.diskFree)} free`;
        }

        public get selectedEntryDetails(): string {
            const entry = this.selectedEntry;

            if (!entry)
                return '';

            if (entry.kind === 'parent')
                return 'Parent directory';

            if (entry.kind === 'directory')
                return 'Folder';

            return `${this.formatSize(entry.size)} · ${this.formatDate(entry.date)}`;
        }

        // ------------------------------------------------------------------------------------
        // Loading
        // ------------------------------------------------------------------------------------

        /**
         * Reloads both panels and the disk usage.
         *
         * @param silent Whether to skip the loading state, used for background refreshes that
         * are triggered by OPFS changes rather than by the user.
         */
        public async refreshAll(silent: boolean = false): Promise<void> {
            // A refresh that is about to happen makes a pending change-triggered one redundant.
            this.cancelScheduledRefresh();

            await Promise.all(this.panels.map(panel => this.refreshPanel(panel, silent)));

            await this.refreshDiskUsage();
        }

        /**
         * Reloads the listing of a single panel, keeping the selection where possible.
         *
         * @param silent Whether to skip the loading state.
         */
        public async refreshPanel(panel: ExplorerPanel, silent: boolean = false): Promise<void> {
            const selectedPath = panel.entries[panel.selectedIndex]?.fullPath ?? null;

            if (!silent)
                panel.loading = true;

            panel.error = null;

            try {
                const entries = await opfs.listEntries(panel.path);

                panel.entries = this.buildEntries(panel.path, entries);

                const restoredIndex = selectedPath === null
                    ? -1
                    : panel.entries.findIndex(entry => entry.fullPath === selectedPath);

                panel.selectedIndex = restoredIndex >= 0
                    ? restoredIndex
                    : Math.min(panel.selectedIndex, Math.max(panel.entries.length - 1, 0));
            }
            catch (error) {
                panel.entries = [];
                panel.selectedIndex = 0;
                panel.error = this.describeError(error);
            }
            finally {
                panel.loading = false;
            }

            this.scrollSelectionIntoView(panel);
        }

        private async refreshDiskUsage(): Promise<void> {
            try {
                this.diskUsed = await opfs.getDiskUsed();
                this.diskFree = await opfs.getDiskFree();
            }
            catch (error) {
                // Disk usage is informational only, so a failure must not break the listing.
                console.warn('Failed to read the OPFS disk usage.', error);
            }
        }

        /** Turns the raw directory listing into sorted rows, with `..` first when not at the root. */
        private buildEntries(path: string, entries: OPFSEntry[]): ExplorerEntry[] {
            const rows: ExplorerEntry[] = [];

            if (path !== '')
                rows.push({ kind: 'parent', name: '..', fullPath: this.parentPath(path), size: 0, date: null });

            const sorted = [...entries].sort((a, b) => {
                if (a.kind !== b.kind)
                    return a.kind === 'directory' ? -1 : 1;

                return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            });

            for (const entry of sorted) {
                rows.push(entry.kind === 'file'
                    ? { kind: 'file', name: entry.name, fullPath: entry.fullPath, size: entry.size, date: entry.date }
                    : { kind: 'directory', name: entry.name, fullPath: entry.fullPath, size: 0, date: null });
            }

            return rows;
        }

        // ------------------------------------------------------------------------------------
        // Navigation
        // ------------------------------------------------------------------------------------

        /** Opens a directory in the given panel. */
        public async navigate(panel: ExplorerPanel, path: string): Promise<void> {
            panel.path = path;
            panel.selectedIndex = 0;

            await this.refreshPanel(panel);
        }

        /** Moves the given panel to its parent directory and selects the folder it came from. */
        public async goUp(panel: ExplorerPanel): Promise<void> {
            if (panel.path === '')
                return;

            const name = panel.path.slice(panel.path.lastIndexOf('/') + 1);

            await this.navigate(panel, this.parentPath(panel.path));

            const index = panel.entries.findIndex(entry => entry.kind === 'directory' && entry.name === name);

            if (index >= 0) {
                panel.selectedIndex = index;
                this.scrollSelectionIntoView(panel);
            }
        }

        /** Activates a row: enters directories, previews files and goes up for `..`. */
        public async openEntry(panel: ExplorerPanel, entry: ExplorerEntry): Promise<void> {
            this.activePanelId = panel.id;

            if (entry.kind === 'parent') {
                await this.goUp(panel);
                return;
            }

            if (entry.kind === 'directory') {
                await this.navigate(panel, entry.fullPath);
                return;
            }

            await this.viewFile(entry);
        }

        public selectEntry(panel: ExplorerPanel, index: number): void {
            panel.selectedIndex = index;
            this.activePanelId = panel.id;
        }

        public activatePanel(id: PanelId): void {
            this.activePanelId = id;
        }

        /** Keeps the keyboard focus on the explorer so its shortcuts keep working. */
        public onRootMouseDown(): void {
            this.root?.focus({ preventScroll: true });
        }

        private openSelected(): void {
            const entry = this.selectedEntry;

            if (entry)
                void this.openEntry(this.activePanel, entry);
        }

        private moveSelection(panel: ExplorerPanel, delta: number): void {
            if (panel.entries.length === 0)
                return;

            panel.selectedIndex = Math.min(Math.max(panel.selectedIndex + delta, 0), panel.entries.length - 1);

            this.scrollSelectionIntoView(panel);
        }

        /** Scrolls the selected row into view without moving any ancestor scroll container. */
        private scrollSelectionIntoView(panel: ExplorerPanel): void {
            void this.$nextTick(() => {
                const index = this.panels.findIndex(candidate => candidate.id === panel.id);
                const list = this.root?.querySelectorAll<HTMLElement>('.opfs-panel-list')[index];
                const row = list?.querySelector<HTMLElement>('.opfs-entry.is-selected');

                if (!list || !row)
                    return;

                const top = row.offsetTop;
                const bottom = top + row.offsetHeight;

                if (top < list.scrollTop)
                    list.scrollTop = top;
                else if (bottom > list.scrollTop + list.clientHeight)
                    list.scrollTop = bottom - list.clientHeight;
            });
        }

        // ------------------------------------------------------------------------------------
        // Keyboard
        // ------------------------------------------------------------------------------------

        public onKeyDown(event: KeyboardEvent): void {
            const panel = this.activePanel;
            let handled = true;

            switch (event.key) {
                case 'ArrowUp':
                    this.moveSelection(panel, -1);
                    break;

                case 'ArrowDown':
                    this.moveSelection(panel, 1);
                    break;

                case 'PageUp':
                    this.moveSelection(panel, -PAGE_STEP);
                    break;

                case 'PageDown':
                    this.moveSelection(panel, PAGE_STEP);
                    break;

                case 'Home':
                    panel.selectedIndex = 0;
                    this.scrollSelectionIntoView(panel);
                    break;

                case 'End':
                    panel.selectedIndex = Math.max(panel.entries.length - 1, 0);
                    this.scrollSelectionIntoView(panel);
                    break;

                case 'Enter':
                    this.openSelected();
                    break;

                case 'Backspace':
                    void this.goUp(panel);
                    break;

                case 'Tab':
                    // Shift+Tab is left alone so the keyboard focus can still leave the explorer.
                    if (event.shiftKey) {
                        handled = false;
                        break;
                    }

                    this.activePanelId = this.otherPanel.id;
                    this.scrollSelectionIntoView(this.activePanel);
                    break;

                case 'F2':
                    this.openRenameDialog();
                    break;

                case 'F3':
                    this.viewSelected();
                    break;

                case 'F5':
                    this.openCopyDialog();
                    break;

                case 'F6':
                    this.openMoveDialog();
                    break;

                case 'F7':
                    this.openMkdirDialog();
                    break;

                case 'F8':
                    this.openDeleteDialog();
                    break;

                case 'Escape':
                    if (!this.closeDialogs())
                        this.root?.blur();
                    break;

                default:
                    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r')
                        void this.refreshAll();
                    else
                        handled = false;
            }

            if (handled) {
                // The chart and camera plugins listen for keys on `window`, so handled keys must
                // not reach them (e.g. `Home` would otherwise recenter the camera).
                event.preventDefault();
                event.stopPropagation();
            }
        }

        /** Closes any open dialog. Returns whether something was closed. */
        private closeDialogs(): boolean {
            if (this.preview.visible) {
                this.preview.visible = false;
                return true;
            }

            if (this.confirm.visible) {
                this.confirm.visible = false;
                return true;
            }

            if (this.prompt.visible) {
                this.prompt.visible = false;
                return true;
            }

            return false;
        }

        // ------------------------------------------------------------------------------------
        // Actions
        // ------------------------------------------------------------------------------------

        public viewSelected(): void {
            const entry = this.selectedEntry;

            if (entry && entry.kind === 'file')
                void this.viewFile(entry);
        }

        /** Shows the beginning of a file, as text or as a hexadecimal dump for binary data. */
        public async viewFile(entry: ExplorerEntry): Promise<void> {
            try {
                const file = await opfs.getFile(entry.fullPath);
                const bytes = new Uint8Array(await file.slice(0, PREVIEW_BYTES).arrayBuffer());
                const binary = this.looksBinary(bytes);

                this.preview = {
                    visible: true,
                    title: entry.fullPath,
                    content: binary ? this.toHexDump(bytes) : new TextDecoder().decode(bytes),
                    truncated: file.size > PREVIEW_BYTES,
                    binary
                };
            }
            catch (error) {
                this.reportError(error);
            }
        }

        /** Renames the selected file or folder in place, keeping it in the same directory. */
        public openRenameDialog(): void {
            const entry = this.selectedEntry;

            if (!entry || entry.kind === 'parent')
                return;

            const panel = this.activePanel;

            this.openPrompt({
                title: 'Rename',
                label: `Rename "${entry.name}" to:`,
                value: entry.name,
                confirmLabel: 'Rename',
                action: async (value) => {
                    const newName = value.trim();

                    if (!this.isValidEntryName(newName)) {
                        throw new InvalidPath({
                            message: `"${value}" is not a valid name: it must not be empty, must not contain "/" and must not be "." or ".."`,
                            scope: 'VOPFSExplorer.rename'
                        });
                    }

                    const destination = this.joinPath(this.parentPath(entry.fullPath), newName);

                    // Renaming to the same name is a no-op.
                    if (destination === entry.fullPath)
                        return;

                    await this.renameEntry(entry, destination);
                    await this.refreshAll();

                    const index = panel.entries.findIndex(candidate => candidate.fullPath === destination);

                    if (index >= 0) {
                        panel.selectedIndex = index;
                        this.scrollSelectionIntoView(panel);
                    }
                }
            });
        }

        /**
         * Moves an entry to a new path inside the same directory, refusing to overwrite an
         * existing entry.
         *
         * A case-only rename goes through a temporary name, because on a case-insensitive
         * filesystem the source and the destination address the same entry and moving would
         * overwrite the source with itself.
         */
        private async renameEntry(entry: ExplorerEntry, destination: string): Promise<void> {
            const caseOnly = destination.toLowerCase() === entry.fullPath.toLowerCase();

            if (!caseOnly) {
                if (await opfs.getEntryKind(destination) !== null) {
                    throw new InvalidPath({
                        message: `"${destination}" already exists`,
                        scope: 'VOPFSExplorer.rename'
                    });
                }

                await opfs.moveEntry(entry.fullPath, destination);

                return;
            }

            const temporary = this.joinPath(this.parentPath(entry.fullPath), `.rename-${Date.now().toString(36)}`);

            await opfs.moveEntry(entry.fullPath, temporary);

            try {
                await opfs.moveEntry(temporary, destination);
            }
            catch (error) {
                // Put the entry back under its original name so a failed rename does not lose it.
                await opfs.moveEntry(temporary, entry.fullPath).catch(() => undefined);

                throw error;
            }
        }

        public openCopyDialog(): void {
            const entry = this.selectedEntry;

            if (!entry || entry.kind === 'parent')
                return;

            this.openPrompt({
                title: 'Copy',
                label: `Copy "${entry.name}" to:`,
                value: this.joinPath(this.otherPanel.path, entry.name),
                confirmLabel: 'Copy',
                action: async (destination) => {
                    await opfs.copyEntry(entry.fullPath, destination);
                    await this.refreshAll();
                }
            });
        }

        public openMoveDialog(): void {
            const entry = this.selectedEntry;

            if (!entry || entry.kind === 'parent')
                return;

            this.openPrompt({
                title: 'Move',
                label: `Move "${entry.name}" to:`,
                value: this.joinPath(this.otherPanel.path, entry.name),
                confirmLabel: 'Move',
                action: async (destination) => {
                    await opfs.moveEntry(entry.fullPath, destination);
                    await this.refreshAll();
                }
            });
        }

        public openMkdirDialog(): void {
            const panel = this.activePanel;

            this.openPrompt({
                title: 'New Folder',
                label: `Create a folder in "/${panel.path}":`,
                value: 'new-folder',
                confirmLabel: 'Create',
                action: async (name) => {
                    const path = this.joinPath(panel.path, name.trim());

                    await opfs.createFolder(path);
                    await this.refreshPanel(panel);

                    const index = panel.entries.findIndex(entry => entry.fullPath === path);

                    if (index >= 0) {
                        panel.selectedIndex = index;
                        this.scrollSelectionIntoView(panel);
                    }
                }
            });
        }

        public openDeleteDialog(): void {
            const entry = this.selectedEntry;

            if (!entry || entry.kind === 'parent')
                return;

            const isFolder = entry.kind === 'directory';

            this.confirm = {
                visible: true,
                title: 'Delete',
                message: isFolder
                    ? `Delete the folder "${entry.fullPath}" and everything inside it?`
                    : `Delete the file "${entry.fullPath}"?`,
                busy: false,
                action: async () => {
                    if (isFolder)
                        await opfs.removeFolder(entry.fullPath);
                    else
                        await opfs.removeFile(entry.fullPath);

                    await this.refreshAll();
                }
            };
        }

        private openPrompt(options: { title: string; label: string; value: string; confirmLabel: string; action: (value: string) => Promise<void> }): void {
            this.prompt = {
                visible: true,
                busy: false,
                error: '',
                ...options
            };

            // Preselect the current value so a rename can be typed over the old name right away.
            void this.$nextTick(() => {
                this.promptInput?.focus();
                this.promptInput?.select();
            });
        }

        public async confirmPrompt(): Promise<void> {
            const action = this.prompt.action;

            if (!action || this.prompt.busy)
                return;

            this.prompt.busy = true;
            this.prompt.error = '';

            try {
                await action(this.prompt.value);
                this.prompt.visible = false;
            }
            catch (error) {
                this.prompt.error = this.describeError(error);
            }
            finally {
                this.prompt.busy = false;
            }
        }

        public async confirmAction(): Promise<void> {
            const action = this.confirm.action;

            if (!action || this.confirm.busy)
                return;

            this.confirm.busy = true;

            try {
                await action();
                this.confirm.visible = false;
            }
            catch (error) {
                this.reportError(error);
            }
            finally {
                this.confirm.busy = false;
            }
        }

        // ------------------------------------------------------------------------------------
        // Helpers
        // ------------------------------------------------------------------------------------

        private parentPath(path: string): string {
            const index = path.lastIndexOf('/');

            return index < 0 ? '' : path.slice(0, index);
        }

        private joinPath(directory: string, name: string): string {
            return directory === '' ? name : `${directory}/${name}`;
        }

        /** Whether the given name can be used as a single OPFS path segment. */
        private isValidEntryName(name: string): boolean {
            return name !== '' && name !== '.' && name !== '..' && !name.includes('/');
        }

        public formatSize(bytes: number): string {
            if (bytes < 1024)
                return `${bytes} B`;

            const units = ['KB', 'MB', 'GB', 'TB'];
            let value = bytes / 1024;
            let unit = 0;

            while (value >= 1024 && unit < units.length - 1) {
                value /= 1024;
                unit++;
            }

            return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
        }

        private formatDate(date: Date | null): string {
            if (!date)
                return '';

            const pad = (value: number) => String(value).padStart(2, '0');

            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
        }

        /** Treats data containing a NUL byte as binary, which covers the common file formats. */
        private looksBinary(bytes: Uint8Array): boolean {
            return bytes.includes(0);
        }

        private toHexDump(bytes: Uint8Array): string {
            const lines: string[] = [];

            for (let offset = 0; offset < bytes.length; offset += 16) {
                const chunk = bytes.subarray(offset, offset + 16);
                const hex = Array.from(chunk, byte => byte.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ');
                const ascii = Array.from(chunk, byte => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '.')).join('');

                lines.push(`${offset.toString(16).padStart(8, '0')}  ${hex}  ${ascii}`);
            }

            return lines.join('\n');
        }

        private describeError(error: unknown): string {
            if (error instanceof Throwable)
                return error.scope ? `${error.message} (${error.scope})` : error.message;

            return error instanceof Error ? error.message : String(error);
        }

        private reportError(error: unknown): void {
            const message = this.describeError(error);

            console.error(message, error);
            ElMessage.error(message);
        }
    }

    export default toNative(VOPFSExplorer);

</script>


<!-- STYLE -->

<style lang="scss" scoped>

    .opfs-explorer {
        background-color: #0d0d0d;
        outline: none;

        &:focus {
            border-color: #4caf50;
        }
    }

    .opfs-explorer-title {
        font-weight: 700;
        color: #bbb;
    }

    .opfs-explorer-disk {
        color: #666;
        text-align: right;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    .opfs-panel {
        flex: 1 1 0;
        min-width: 0;
        border-radius: 4px;
        background-color: #111;
        overflow: hidden;

        /*
        &.is-active {
            border-color: #4caf50;
        }
        */
    }

    .opfs-panel-path {
        display: flex;
        flex-direction: row;
        align-items: center;
        background-color: #15202e;
        white-space: nowrap;
        overflow: hidden;
    }

    .opfs-panel-path-root {
        flex: 0 0 auto;
        color: #666;
    }

    .opfs-panel-path-text {
        flex: 1 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .opfs-panel-list {
        position: relative;
        height: 500px;
        max-height: 100%;
        overflow-y: auto;
        overflow-x: hidden;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    .opfs-panel-message {
        padding: 6px;
        color: #777;

        &.is-error {
            color: #e06c75;
            overflow: hidden;
            text-overflow: ellipsis;
        }
    }

    .opfs-entry {
        display: flex;
        flex-direction: row;
        align-items: center;
        color: #ccc;
        white-space: nowrap;
        cursor: default;
        user-select: none;

        &:hover {
            background-color: #1e1e1e;
        }

        &.is-selected {
            background-color: #264f78;
            color: #fff;
        }

        &.is-directory .opfs-entry-name {
            color: #6cb6ff;
            font-weight: 600;
        }

        &.is-parent .opfs-entry-name {
            color: #888;
        }

        &.is-selected .opfs-entry-name {
            color: #fff;
        }
    }

    .opfs-entry-name {
        flex: 1 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .opfs-entry-size {
        flex: 0 0 auto;
        margin-left: 8px;
        color: #aaa;
    }

    .opfs-explorer-status {
        min-height: 20px;
        color: #888;
    }

    .opfs-status-name {
        flex: 0 1 auto;
        max-width: 50%;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: #ccc;
    }

    .opfs-status-details {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    .opfs-dialog-label {
        color: #bbb;
        word-break: break-all;
    }

    .opfs-dialog-error {
        color: #e06c75;
        word-break: break-word;
    }

    .opfs-preview {
        max-height: 60vh;
        overflow: auto;
        margin: 0;
        padding: 8px;
        border-radius: 4px;
        background-color: #111;
        color: #ccc;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        white-space: pre;
    }

</style>
