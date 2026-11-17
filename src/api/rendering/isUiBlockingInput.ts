/** True when a dialog is open or a text-entry element has focus, so canvas input should be ignored. */
export function isUiBlockingInput(): boolean {
    const active = document.activeElement;

    if (active instanceof HTMLElement) {
        const tag = active.tagName;

        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || active.isContentEditable)
            return true;
    }

    // Closed Element Plus dialogs stay in the DOM with display:none, so only visible ones count.
    for (const dialog of document.querySelectorAll<HTMLElement>('.el-overlay, dialog[open]')) {
        if (getComputedStyle(dialog).display !== 'none')
            return true;
    }

    return false;
}
