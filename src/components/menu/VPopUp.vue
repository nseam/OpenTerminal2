<!-- TEMPLATE -->

<template>

  <Teleport to="body">
    <div v-if="visible" ref="popupEl" class="pop-up flex flex-0 flex-col" :style="popupStyle" :class="{ 'bordered': bordered }">
      <slot />
    </div>
  </Teleport>

</template>


<!-- SCRIPT -->

<script lang="ts">

  import { nextTick } from 'vue';
  import { OverlayScrollbars } from 'overlayscrollbars';

  @Component({
    expose: ['open', 'close', 'triggerEl', 'triggerComponent'],

    // Providing a hook for VMenu to call when it closes, so the popup can close too.
    provide() {
      return {
        // Injected by VMenu so it can close the popup when the menu closes.
        popupClose: () => (this as any).close(),
      };
    },
  })
  class VPopUp extends Vue
  {
    // Default width of the popup in pixels.
    @Prop({ type: Number })
    width?: number;

    // Default height of the popup in pixels.
    @Prop({ type: Number })
    height?: number;

    // Maximum width of the popup in pixels.
    @Prop({ type: Number })
    maxWidth?: number;

    // Maximum height of the popup in pixels. Content scrolls vertically when exceeded.
    @Prop({ type: Number })
    maxHeight?: number;

    // When true, any click anywhere closes the popup. When false, only clicks outside the popup close it.
    @Prop({ type: Boolean, default: false })
    closeOnClick!: boolean;

    // CSS class(es) added to the trigger element's root DOM node while the popup is open.
    @Prop({ type: String, default: '' })
    triggerClass!: string;

    // Whether to render a border and background for the popup. Should be false when the popup content provides its own styling (e.g. when using VMenu).
    @Prop({ type: Boolean, default: true })
    bordered!: boolean;

    // Whether the popup is currently visible.
    visible: boolean = false;

    // The element that triggered the popup (set when open() is called).
    triggerEl: HTMLElement | null = null;

    // The Vue component instance that triggered the popup, derived from triggerEl.
    get triggerComponent(): any {
        console.log('Trigger element:', this.triggerEl);

      return (this.triggerEl as any)?.__vueParentComponent?.proxy ?? null;
    }

    // Current position of the popup in viewport coordinates.
    posX: number = 0;

    // Current position of the popup in viewport coordinates.
    posY: number = 0;

    // Whether the popup has been positioned at least once since it was opened. Used to prevent showing the popup at (0, 0) before it is positioned.
    positioned: boolean = false;

    // Viewport-derived size constraints computed after clamping (null = unconstrained).
    viewportMaxWidth:  number | null = null;
    viewportMaxHeight: number | null = null;

    // Listeners for closing the popup when clicking outside or pressing Escape.
    private documentClickListener?: (e: MouseEvent) => void;

    // Listener for closing the popup when pressing Escape.
    private keydownListener?: (e: KeyboardEvent) => void;

    // OverlayScrollbars instance, alive while the popup is visible.
    private osInstance: { destroy: () => void } | null = null;

    // Computed style for the popup element based on the current position and size props.
    get popupStyle(): Record<string, string>
    {
      const style: Record<string, string> = {
        left:       `${this.posX}px`,
        top:        `${this.posY}px`,
        visibility: this.positioned ? 'visible' : 'hidden',
      };

      if (this.width != null)
        style.width = `${this.width}px`;

      if (this.height != null)
        style.height = `${this.height}px`;

      // Prop limits and viewport limits are both applied; the tighter one wins.
      const effectiveMaxWidth  = Math.min(
        this.maxWidth  ?? Infinity,
        this.viewportMaxWidth  ?? Infinity,
      );
      const effectiveMaxHeight = Math.min(
        this.maxHeight ?? Infinity,
        this.viewportMaxHeight ?? Infinity,
      );

      if (isFinite(effectiveMaxWidth))  style.maxWidth  = `${effectiveMaxWidth}px`;
      if (isFinite(effectiveMaxHeight)) style.maxHeight = `${effectiveMaxHeight}px`;

      return style;
    }

    // Opens the popup near the given viewport coordinates,
    // clamped to stay at least 15 px inside the window on all sides.
    open(x: number, y: number, triggerEl?: HTMLElement): void {
      this.positioned = false;
      this.posX = 0;
      this.posY = 0;
      this.removeTriggerClass();
      this.triggerEl = triggerEl ?? null;
      this.applyTriggerClass();
      this.visible = true;

      nextTick(() => {
        const el = this.$refs.popupEl as HTMLElement | undefined;
        if (!el) return;

        const PADDING = 15;
        const rect = el.getBoundingClientRect();
        let left = x;
        let top  = y;

        if (left + rect.width > window.innerWidth  - PADDING)
          left = window.innerWidth - rect.width  - PADDING;

        if (left < PADDING)
          left = PADDING;

        if (top + rect.height > window.innerHeight - PADDING)
          top = window.innerHeight - rect.height - PADDING;

        if (top < PADDING)
          top = PADDING;

        this.posX = left;
        this.posY = top;

        // Constrain to available viewport space so the popup scrolls rather than clips.
        // Vertical scrolling is always enabled; horizontal only when unavoidable.
        this.viewportMaxHeight = window.innerHeight - top  - PADDING;
        this.viewportMaxWidth  = window.innerWidth  - left - PADDING;

        this.positioned = true;

        this.osInstance = OverlayScrollbars(el, { scrollbars: { autoHide: 'never' } });

        this.removeListeners();

        // Defer listener registration so the event that triggered open() doesn't
        // immediately close the popup.
        setTimeout(() => {
          this.documentClickListener = (e: MouseEvent) => {
            if (this.closeOnClick) {
              this.close();
            } else {
              const target = e.target as HTMLElement;
              if (!el.contains(target)) this.close();
            }
          };

          this.keydownListener = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !e.defaultPrevented) this.close();
          };

          document.addEventListener('click',   this.documentClickListener);
          document.addEventListener('keydown', this.keydownListener);
        }, 0);
      });
    }

    // Closes the popup.
    close(): void {
      this.osInstance?.destroy();
      this.osInstance          = null;
      this.visible             = false;
      this.positioned          = false;
      this.viewportMaxWidth    = null;
      this.viewportMaxHeight   = null;
      this.removeTriggerClass();
      this.triggerEl           = null;
      this.removeListeners();
    }

    private applyTriggerClass(): void {
      if (!this.triggerClass || !this.triggerEl) return;
      this.triggerClass.split(/\s+/).filter(Boolean).forEach(c => this.triggerEl!.classList.add(c));
    }

    private removeTriggerClass(): void {
      if (!this.triggerClass || !this.triggerEl) return;
      this.triggerClass.split(/\s+/).filter(Boolean).forEach(c => this.triggerEl!.classList.remove(c));
    }

    private removeListeners(): void {
      if (this.documentClickListener) {
        document.removeEventListener('click',   this.documentClickListener);
        this.documentClickListener = undefined;
      }
      if (this.keydownListener) {
        document.removeEventListener('keydown', this.keydownListener);
        this.keydownListener = undefined;
      }
    }

    unmounted(): void {
      this.removeListeners();
    }
  }

  export default toNative(VPopUp);

</script>


<!-- STYLE -->

<style lang="scss" scoped>

  .pop-up {
    position: fixed;
    z-index: 9999;

    &.bordered {
      background-color: #000;
      border-radius: 5px;
    }
  }

</style>

<style lang="scss">

    .pop-up {
        .menu {
            background-color: #000;
            border: 2px solid #222;
            border-radius: 5px;;
        }
    }

</style>
