<!-- TEMPLATE -->

<template>

  <div class="menu flex">
    <slot />
  </div>

</template>


<!-- SCRIPT -->

<script lang="ts">

import { VMenuItem } from './VMenuItem.vue';


  export interface MenuState {
    // Ids of expanded items.
    expandedItems: string[];

    // Currently selected item.
    selectedItem: VMenuItem;

    // Optional hook called when the menu closes, allowing a parent VPopUp to close too.
    closeHook?: () => void;

    // True while the user is holding a mousedown that originated on a container item.
    isDragOpen: boolean;
  }

  @Component({
    expose: ['close'],
  })
  class Menu extends Vue
  {
    @Provide
    menuLevel: number = 0;

    @Provide
    menuState: MenuState = {
      expandedItems: new Array<string>(32),
      selectedItem: null as unknown as VMenuItem,
      isDragOpen: false,
    };

    // Injected by VPopUp when VMenu is used inside one.
    @Inject({ from: 'popupClose', default: null })
    popupClose!: (() => void) | null;

    // Click listener to close the menu when clicked outside.
    private clickListener!: (event: MouseEvent) => void;

    // Keyboard listener to go back one menu level on Escape / Backspace.
    private keydownListener!: (event: KeyboardEvent) => void;

    /**
     * Component mounted lifecycle hook.
     */
    mounted() {
      // Resetting menu state.
      this.menuState.expandedItems.length = 0;
      this.menuState.selectedItem = null!;
      this.menuState.closeHook = this.popupClose ?? undefined;

      // Listening for mouse click event. If mouse clicked outside of the menu, we close it.
      this.clickListener = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.menu') && !target.closest('.menu-item')) {
          this.close();
        }
      };
      document.addEventListener('mousedown', this.clickListener);

      this.keydownListener = (event: KeyboardEvent) => {
        if (event.key !== 'Escape' && event.key !== 'Backspace') return;

        // Don't intercept Backspace while the user is typing in an editable element.
        if (event.key === 'Backspace') {
          const active = document.activeElement;
          if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || (active as HTMLElement)?.isContentEditable)
            return;
        }

        if (this.menuState.expandedItems.length > 0) {
          event.preventDefault();
          this.menuState.expandedItems.length--;
        }
      };
      document.addEventListener('keydown', this.keydownListener);
    }

    /**
     * Component unmounted lifecycle hook.
     */
    unmounted() {
      document.removeEventListener('mousedown', this.clickListener);
      document.removeEventListener('keydown', this.keydownListener);
    }

    /**
     * Collapses all expanded items in the menu.
     */
    close() {
      // Resetting menu state.
      this.menuState.expandedItems.length = 0;
      this.menuState.selectedItem = null!;
      this.menuState.closeHook?.();
    }

  }
  export default toNative(Menu);

</script>


<!-- STYLE -->

<style lang="scss" scoped>

  .menu {
    background-color: var(#000);
    font-weight: 600;
    &.bordered {
      background-color: #000;
      border-radius: 5px;
      border: 2px solid #000;
    }
  }


</style>
