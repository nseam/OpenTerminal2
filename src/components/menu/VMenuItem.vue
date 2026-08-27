<!-- TEMPLATE -->

<template>

    <div class="menu-item row items-center select-none relative" @click="clicked" @mousedown="mouseDown" @mouseenter="mouseEnter" @mouseleave="mouseLeave" :class="{ 'top-menu': topMenu, 'sub-menu': !topMenu, expanded: expanded, enabled: enabled, disabled: !enabled, selected: selected, ['checked-' + ((type === MenuItemType.Checkbox && checkedInternal) || (type === MenuItemType.Radio && modelValue === id) ? 'true' : 'false')]: true, ['type-' + type]: true }">
        <div class="menu-item-hover row items-center">
            <div class="label row items-center h-full">
                <div v-if="type == MenuItemType.Checkbox" class="row-0 mr-2">
                    <ElCheckbox :model-value="checkedInternal" class="row-0 max-h-[16px]" style="pointer-events: none" />
                </div>
                <div v-if="type == MenuItemType.Radio" class="row-0 mr-2">
                    <ElRadio :model-value="modelValue" :value="id" style="pointer-events: none" />
                </div>
                <slot name="label">
                    {{ label }}
                </slot>
                <div class="row"></div>
                <VShortcut shift alt char="c" />
                <FontAwesomeIcon :icon="['fas', 'caret-right']" class="ml-2" v-if="$slots.content && !topMenu" />
            </div>
            <div class="content" v-if="$slots.content && expanded" @click.stop :style="contentStyle">
                <template v-if="$slots.content">
                    <slot name="content" />
                </template>
            </div>
        </div>
    </div>

</template>


<!-- SCRIPT -->

<script lang="ts">

import VShortcut from './VShortcut.vue';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { MenuItemType } from '@shared/api/menu/MenuItemType';
import { OverlayScrollbars } from 'overlayscrollbars';

import type { MenuState } from './VMenu.vue';

@Component({
    components: {
        VShortcut,
        FontAwesomeIcon,
        MenuItemType
    },
    emits: ['update:modelValue', 'clicked']
})
export class VMenuItem extends Vue
{
    // Imports.
    MenuItemType = MenuItemType;

    // Whether the menu item is enabled.
    @Prop({ type: Boolean, default: true })
    enabled!: boolean;

    @Prop({ type: String, required: true })
    id!: string;

    @Prop({ type: String, default: '' })
    label!: string;

    @Prop({ type: Boolean, default: false })
    topMenu!: boolean;

    // Whether the menu item should close the menu when clicked.
    @Prop({ type: Boolean, default: true })
    close!: boolean;

    // Whether the menu item is selected.
    @Prop({ type: Boolean, default: false })
    selected!: boolean;

    // Checked state for checkbox items (boolean) or selected id for radio items (string).
    @Prop({ type: [Boolean, String], default: false })
    modelValue!: boolean | string;

    // Radio group id — all VMenuItems sharing the same group act as a single radio group.
    @Prop({ type: String, default: '' })
    group!: string;

    // Internal checked state — initialized from prop, toggled locally so the checkbox
    // responds immediately even when no parent binds v-model.
    checkedInternal: boolean = false;

    @Watch('modelValue', { immediate: true })
    onCheckedPropChanged(val: boolean) { this.checkedInternal = val; }

    // Writable proxy so ElCheckbox can emit changes instead of mutating the prop.
    get checkedModel(): boolean { return this.checkedInternal; }
    set checkedModel(val: boolean) { this.checkedInternal = val; this.$emit('update:modelValue', val); }

    // Type of the menu item (normal, checkbox, radio).
    @Prop({ type: String, default: MenuItemType.Normal })
    type!: MenuItemType;

    // Whether the menu item is expanded.
    get expanded() { return this.menuState.expandedItems.includes(this.id); }

    // Hidden until positionContent() calculates and sets the final coordinates.
    contentPosition: { top: string; left: string; maxHeight?: string; maxWidth?: string } | null = null;

    // OverlayScrollbars instance for the content popup, alive for as long as it is expanded.
    private contentOsInstance: { destroy: () => void } | null = null;

    // Style for the content wrapper, including visibility, position, and optional size constraints.
    get contentStyle() {
        // Adding z-index. Each menu level gets a z-index 10 higher than the previous. Starting from 1000 for the first level so it's above the scrollbars.
        if (!this.contentPosition)
        return { position: 'fixed', visibility: 'hidden', zIndex: 1000 + this.menuLevel * 10 };

        return { position: 'fixed', visibility: 'visible', zIndex: 1000 + this.menuLevel * 10, ...this.contentPosition };
    }

    // Whether the mouse is still over the menu item.
    isMouseOver: boolean = false;

    // Injected menu state from the parent Menu component.
    @Inject
    menuState!: MenuState;

    // Actual menu level. Starting from 0 from MainMenu component.
    @Inject
    menuLevel: number = 0;

    // Providing menuLevel + 1 for child components.
    @Provide('menuLevel')
    get childMenuLevel(): number {
        return this.menuLevel === undefined ? 0 : this.menuLevel + 1;
    }

    // Expanded state captured at the moment mousedown fires, so doClick() toggles correctly
    // even though mouseDown pre-expands the container.
    private _expandedAtMouseDown: boolean | null = null;

    // Set for one tick when a drag-release is handled; suppresses the browser's natural LCA click on this container.
    private _suppressNextClick = false;

    // Clicked on the menu item.
    clicked()
    {
        if (this._suppressNextClick)
            return;

        if (this.enabled)
            this.$emit('clicked');

        this.doClick();
    }

    // Core click logic.
    private doClick()
    {
        if (!this.enabled)
        return;

        if (this.type === MenuItemType.Checkbox) {
            this.checkedModel = !this.checkedInternal;
            return;
        }

        if (this.type === MenuItemType.Radio) {
            this.$emit('update:modelValue', this.id);
            return;
        }

        const wantsClose = this.close && !this.topMenu;
        // Use the pre-mouseDown state if available so pre-expansion doesn't break toggle logic.
        const wasExpanded = this._expandedAtMouseDown !== null ? this._expandedAtMouseDown : this.expanded;
        this._expandedAtMouseDown = null;

        if (this.menuLevel == 0 || wantsClose)
        this.menuState.expandedItems.length = 0;

        if (wantsClose)
        this.menuState.closeHook?.();

        if (!wasExpanded && !wantsClose && this.$slots.content) {
            this.menuState.expandedItems[this.menuLevel] = this.id;
            this.menuState.expandedItems.length = this.menuLevel + 1;
        }
    }

    // Mousedown on a container item — pre-expands it so child items are reachable by dragging.
    mouseDown(event: MouseEvent)
    {
        if (!this.enabled)
        return;

        if (!this.$slots.content)
        return;

        // Don't handle drag if mousedown originated inside a child menu item (it will handle itself).
        if ((event.target as HTMLElement).closest('.menu-item') !== this.$el)
        return;

        // Capture expanded state BEFORE we expand, so doClick() can correctly determine toggle direction.
        this._expandedAtMouseDown = this.expanded;

        // Expand immediately so child items are visible for drag-selection.
        if (!this.expanded) {
            if (this.menuLevel == 0)
            this.menuState.expandedItems.length = 0;
            this.menuState.expandedItems[this.menuLevel] = this.id;
            this.menuState.expandedItems.length = this.menuLevel + 1;
        }

        this.menuState.isDragOpen = true;

        const onDragEnd = (upEvent: MouseEvent) => {
            this.menuState.isDragOpen = false;
            document.removeEventListener('mouseup', onDragEnd);

            // Find which menu item element the cursor is over at release time.
            const target = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
            const menuItemEl = target?.closest<HTMLElement>('.menu-item');

            if (menuItemEl && menuItemEl !== (this.$el as HTMLElement)) {
                // Suppress the browser's natural click that will fire on this container (it is the LCA
                // of the mousedown and mouseup targets, so the browser routes the click here).
                this._suppressNextClick = true;
                setTimeout(() => { this._suppressNextClick = false; }, 0);
                // Trigger normal click behavior on the item the user released over.
                menuItemEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            }
        };

        document.addEventListener('mouseup', onDragEnd);
    }

    // Mouse enter on the menu item.
    mouseEnter(event: MouseEvent)
    {
        if (this.isMouseOver)
        return;

        if (!this.enabled)
        return;

        if (this.topMenu && this.menuState.expandedItems.length == 0)
        // Do not expand top menu items on mouse enter if no other top menu is expanded.
        return;

        const isCurrentlySelectedContainer = this.menuState.selectedItem?.$slots.content;

        if ((this.topMenu || !isCurrentlySelectedContainer) && this.menuState.expandedItems[this.menuLevel] !== this.id) {
            if (this.$slots.content) {
                setTimeout(() => {
                    if (this.isMouseOver) {
                        this.menuState.expandedItems.length = this.menuLevel + 1;
                        this.menuState.expandedItems[this.menuLevel] = this.id;
                    }
                }, this.menuLevel === 0 ? 0 : 250);
            } else {
                // Delay closing the open container so accidental brief hovers don't collapse the menu.
                const expandedAtEntry = this.menuState.expandedItems[this.menuLevel];
                if (expandedAtEntry) {
                    setTimeout(() => {
                        if (this.isMouseOver && this.menuState.expandedItems[this.menuLevel] === expandedAtEntry)
                        this.menuState.expandedItems.length = this.menuLevel;
                    }, 250);
                }
            }
            this.menuState.selectedItem = this;
        }
        else {
            // Capture which container was open at the time of entry so the timeout can safely close it.
            const expandedAtEntry = this.menuState.expandedItems[this.menuLevel];
            setTimeout(() => {
                if (this.$slots.content) {
                    // Re-entering an already-expanded container must not truncate deeper levels; only switch
                    // expansion when a different container is being hovered (sibling swap scenario).
                    if (this.isMouseOver && this.menuState.expandedItems[this.menuLevel] !== this.id) {
                        this.menuState.expandedItems[this.menuLevel] = this.id;
                        this.menuState.expandedItems.length = this.menuLevel + 1;
                    }
                } else {
                    // Close the container only if the user is still hovering this item after the full delay.
                    if (this.isMouseOver && expandedAtEntry && this.menuState.expandedItems[this.menuLevel] === expandedAtEntry)
                    this.menuState.expandedItems.length = this.menuLevel;
                }
            }, this.menuLevel === 0 ? 0 : 250);
        }

        this.isMouseOver = true;
        this.menuState.selectedItem = this;
    }

    // Mouse leave from the menu item.
    mouseLeave() {
        this.isMouseOver = false;
    }

    // Watcher for expanded state; when it changes, calculate or clear content position and (re)initialize or destroy OverlayScrollbars.
    @Watch('expanded')
    onExpandedChanged(expanded: boolean) {
        if (expanded) {
            this.$nextTick(() => { if (this.expanded) this.positionContent(); });
        } else {
            this.contentOsInstance?.destroy();
            this.contentOsInstance = null;
            this.contentPosition = null;
        }
    }

    // Calculate and set the position of the content popup, and initialize OverlayScrollbars on it.
    positionContent() {
        const content = this.$el.querySelector(':scope > .menu-item-hover > .content');
        if (!content) return;

        const el = this.$el as HTMLElement;
        const item = el.getBoundingClientRect();
        const size = content.getBoundingClientRect();
        const style = getComputedStyle(el);
        const margin = 15;
        const gap = 4;

        // Use inner edges (excluding padding) so the popup sits flush with the content area.
        const innerTop    = item.top    + parseFloat(style.paddingTop);
        const innerBottom = item.bottom - parseFloat(style.paddingBottom);
        const innerLeft   = item.left   + parseFloat(style.paddingLeft);
        const innerRight  = item.right  - parseFloat(style.paddingRight);

        let top: number;
        let left: number;

        if (this.topMenu) {
            // Top-menu: open below the item, left-aligned, clamped to viewport horizontally.
            top = innerBottom + gap;
            left = innerLeft;
            left = Math.max(margin, Math.min(left, window.innerWidth - margin - size.width));
        } else {
            // Sub-menu: try right side first; fall back to left if it clips the right edge.
            top = innerTop;
            left = innerRight + gap;
            if (left + size.width > window.innerWidth - margin) {
                left = innerLeft - gap - size.width;
                // Neither side fits — anchor to the left boundary.
                if (left < margin)
                left = margin;
            }
        }

        // Clamp vertically so the popup stays within the viewport.
        top = Math.max(margin, Math.min(top, window.innerHeight - margin - size.height));

        // When the popup still doesn't fit after clamping, constrain its size so it scrolls.
        const availableHeight = window.innerHeight - margin - top;
        const availableWidth  = window.innerWidth  - margin - left;
        const maxHeight = size.height > availableHeight ? `${availableHeight}px` : undefined;
        const maxWidth  = size.width  > availableWidth  ? `${availableWidth}px`  : undefined;

        this.contentPosition = { top: `${top}px`, left: `${left}px`, maxHeight, maxWidth };

        this.contentOsInstance = OverlayScrollbars(content, { scrollbars: { autoHide: 'never' } });
    }
}
export default toNative(VMenuItem);

</script>


<!-- STYLE -->

<style lang="scss" scoped>

@use 'sass:color';

.menu-item {
    -webkit-app-region: no-drag;

    .menu-item {
        min-width: 120px;
    }

    &.type-checkbox.checked-false .label {
        // Dimming the label of an unchecked checkbox item.
    }

    &.type-checkbox.checked-true .label,
    &.type-radio.checked-true .label {
        // Highlighting the label of a checked radio item.
        color: #b28ff4;
    }

    > .menu-item-hover {
        > .label {
            white-space: nowrap;
            color: #888;
        }

    }

    &.disabled {
        > .menu-item-hover {
            opacity: 0.5;
        }
    }

    &.selected {
        > .menu-item-hover {
            > .label {
                color: #fff;
                background-color: color.adjust(#03a052, $lightness: -24%);
                outline: 2px solid color.adjust(#03a052, $lightness: -17%);
                outline-offset: -2px;
            }
        }
    }

    &.top-menu {
        align-self: center;
    }

    &.top-menu > .menu-item-hover {
        border: 2px solid transparent;
        border-radius: 5px;
        //height: 100%;
        &:hover {
            border-color: #222;
        }
    }

    &:hover:not(.disabled),
    &.expanded:not(.disabled) {
        > .menu-item-hover {
            border-bottom-left-radius: 5px;
            border-bottom-right-radius: 5px;
            border-color: #222;
            background-color: #222;
            > .label {
                color: #fff;
            }

        }
        &.sub-menu {
            > .menu-item-hover > .label {
                color: #fff;
                background-color: #202020;
                &:hover {
                    background-color: #222;
                }
            }
        }
    }

    &.top-menu.expanded > .menu-item-hover,
    &.top-menu:hover > .menu-item-hover {
        //border: 2px solid #222;
    }


    &.expanded > .menu-item-hover {
        background-color: #202020;
    }

    &.disabled > .menu-item-hover {
        color: #666 !important;
        background-color: transparent !important;
    }

    i {
        font-size: 11px;
    }

    &.top-menu > .menu-item-hover > .label {
        font-weight: 600;
        padding: 3px 12px 4px 12px;
    }

    &.sub-menu > .menu-item-hover > .label {
        padding: 4px 12px 5px 12px;
        min-width: 120px;
        white-space: nowrap;
    }

    > .menu-item-hover > .content {
        background-color: #000;
        border-radius: 5px;
        border: #222 2px solid;
    }
}


</style>

<style lang="scss">

</style>
