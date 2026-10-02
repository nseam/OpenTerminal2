import type { Directive, DirectiveBinding } from 'vue';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VPopUpInstance {
  open(x: number, y: number, triggerEl?: HTMLElement, component?: any, data?: Record<string, any>): void;
  close(): void;
}

/**
  * Accepted values for the v-popup directive:
  *
  *   v-popup="popupRef"                     → opens on contextmenu
  *   v-popup="{ popup: popupRef }"          → opens on contextmenu
  *   v-popup="{ popup: popupRef, event: 'click' }"  → opens on click
  */
export type PopupDirectiveValue =
  | VPopUpInstance
  | { popup: VPopUpInstance; event?: string; data?: Record<string, any> };

interface PopupState {
  handler: (e: Event) => void;
  eventName: string;
  /** Mutable box so the handler always reads the latest binding value. */
  valueBox: { current: PopupDirectiveValue };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const stateMap = new WeakMap<HTMLElement, PopupState>();

function resolveEventName(value: PopupDirectiveValue): string {
  if (value && typeof value === 'object' && 'popup' in value) {
    return value.event ?? 'contextmenu';
  }
  return 'contextmenu';
}

function resolveInstance(value: PopupDirectiveValue): VPopUpInstance | undefined {
  if (!value) return undefined;
  if (typeof value === 'object' && 'popup' in value) return value.popup ?? undefined;
  return value as VPopUpInstance;
}

function attach(el: HTMLElement, value: PopupDirectiveValue): void {
  const eventName = resolveEventName(value);
  const valueBox: { current: PopupDirectiveValue } = { current: value };

  // Resolve lazily so refs that were undefined at mount time still work once populated.
  const handler = (e: Event): void => {
    e.preventDefault();
    const value = valueBox.current;

    const instance = resolveInstance(value);
    let data: Record<string, any> | null = null;

    if (value && typeof value === 'object' && 'popup' in value) {
      data = value.data ?? null;
    }

    if (!instance?.open) return;
    const me = e as MouseEvent;
    const tc = triggerComponentMap.get(el);
    instance.open(me.clientX, me.clientY, el, tc ?? null, data ?? undefined);
  };

  el.addEventListener(eventName, handler);
  stateMap.set(el, { handler, eventName, valueBox });
}

// Stores trigger component (VTab proxy) keyed by trigger element — stable after mount, read at event time.
const triggerComponentMap = new WeakMap<HTMLElement, any>();

function detach(el: HTMLElement): void {
  const state = stateMap.get(el);
  if (state) {
    el.removeEventListener(state.eventName, state.handler);
    stateMap.delete(el);
    triggerComponentMap.delete(el);
  }
}

// ---------------------------------------------------------------------------
// Directive definition
// ---------------------------------------------------------------------------

export const vPopup: Directive<HTMLElement, PopupDirectiveValue> = {
  mounted(el: HTMLElement, binding: DirectiveBinding<PopupDirectiveValue>) {
    attach(el, binding.value);
    // Store the trigger component (from proxy). Data is read lazily from valueBox.current at event time.
    if (binding.instance) {
      triggerComponentMap.set(el, binding.instance);
    }
  },

  updated(el: HTMLElement, binding: DirectiveBinding<PopupDirectiveValue>) {
    if (binding.value === binding.oldValue) return;

    const state = stateMap.get(el);
    const newEventName = resolveEventName(binding.value);

    if (state && state.eventName === newEventName) {
      // Same event — just update the box; no need to re-register the listener.
      state.valueBox.current = binding.value;
    } else {
      // Event type changed — fully re-attach.
      detach(el);
      attach(el, binding.value);
    }
  },

  beforeUnmount(el: HTMLElement) {
    detach(el);
  },
};
