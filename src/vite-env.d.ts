/// <reference types="vite/client" />

// Auto-imported decorators from vue-facing-decorator
declare const Component: any
declare const Vue: any
declare const Prop: any
declare const Vanilla: any
declare const Hook: any
declare const Emit: any
declare const Ref: any
declare const Watch: any
declare const Provide: any
declare const Inject: any
declare const Model: any
declare const Setup: any
declare const toNative: any

declare module 'vue-facing-decorator' {
  import type { App } from 'vue'

  export { Component, Vue, Prop, Vanilla, Hook, Emit, Ref, Watch, Provide, Inject, Model, Setup, toNative }
}
