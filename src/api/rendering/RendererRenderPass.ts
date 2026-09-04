import * as Gfx from 'three';

import type { RendererPlugin } from "./RendererPlugin";
import type { Scene }          from './Scene';
import type { Camera }         from './Camera';
import { Known }               from '@shared/api/Known';
import type { Renderer }       from './Renderer';
import { RendererPluginBase }  from './RendererPluginBase';

export type RendererRenderPassOptions = {
    name?: string;
    scene?: Scene;
    camera?: Camera;
    renderTarget?: Gfx.WebGLRenderTarget;
    beforeRender?: (rendererPass: RendererRenderPass, renderer: Renderer, scene: Scene, camera: Camera) => void;
    loop?: (time: DOMHighResTimeStamp, frame: XRFrame) => void;
};

export class RendererRenderPass
{
    /**
     * The currently active renderer pass.
     */
    public static Current?: RendererRenderPass;

    // Rednerer instance that this render pass belongs to.
    public readonly renderer: Renderer;

    // List of plugins that can extend the renderer's functionality, stored by name.
    public readonly plugins: Record<string, RendererPluginBase> = {};

    // Render target that should be applied before rendering.
    public renderTarget?: Gfx.WebGLRenderTarget;

    // Width and height of the render target, if it exists.
    public get renderTargetWidth(): number {
        return this.renderTarget ? this.renderTarget.width : this.renderer.native.getSize(new Gfx.Vector2()).width;
    }

    // Height of the render target, if it exists.
    public get renderTargetHeight(): number {
        return this.renderTarget ? this.renderTarget.height : this.renderer.native.getSize(new Gfx.Vector2()).height;
    }

    // Renderer instance that this render pass belongs to.
    public loop?: (time: DOMHighResTimeStamp, frame: XRFrame) => void = () => { };

    // Function that will be called before rendering the scene.
    public beforeRender?: (rendererPass: RendererRenderPass, renderer: Renderer, scene: Scene, camera: Camera) => void;

    // Clear color and alpha that will be applied before rendering, if specified.
    public clearColor: Gfx.Color | number = 0x000000;

    // Clear alpha that will be applied before rendering, if specified.
    public clearAlpha: number = 0;

    // Scene that this render pass is rendering.
    public activeScene?: Scene;

    // The camera used for rendering the current scene.
    public get camera(): Camera | undefined { return this.activeScene?.activeCamera; }

    // Default animation loop that will be called by the native renderer.
    public defaultAnimationLoop = (time: DOMHighResTimeStamp, frame: XRFrame) => {};

    // Options used to create this render pass.
    public readonly options: RendererRenderPassOptions;

    constructor(renderer: Renderer, options: RendererRenderPassOptions = {})
    {
        this.renderer = renderer;

        this.options = options;

        this.activeScene = options.scene;

        if (options.camera)
            this.activeScene?.add(options.camera);

        if (options.renderTarget)
            this.renderTarget = options.renderTarget;

        this.loop = options.loop ?? this.defaultAnimationLoop;

        this.beforeRender = options.beforeRender;
    }

    /**
     * Adds a plugin to the renderer, e.g. PostProcessing, CameraMovement.
     */
    addPlugin<TPlugin, TOptions extends object>(pluginType: new (rendererPass: RendererRenderPass, options?: TOptions) => TPlugin, options?: TOptions): TPlugin
    {
        const pluginName = Known.className(pluginType);

        if (this.plugins[pluginName])
            throw new Error(`There can't be more than one plugin with the same name "${pluginName}".`);

        const plugin = new pluginType(this, options) as RendererPluginBase;

        this.plugins[pluginName] = plugin as RendererPluginBase;

        this.changePluginViewport(plugin as RendererPluginBase);

        plugin.mounted(this.renderer.native.domElement);

        return plugin as TPlugin;
    }

    /**
     * Retrieves a plugin by its name or type.
     */
    getPlugin<TPlugin, TOptions extends typeof RendererPlugin<TOptions>>(nameOrType: string | (new (...args: any[]) => TPlugin)): TPlugin
    {
        const plugin = this.tryGetPlugin(nameOrType);

        if (!plugin)
        {
            if (typeof nameOrType === 'string')
                throw new Error(`Plugin with name "${nameOrType}" not found. Plugins available: ${Object.keys(this.plugins).join(', ')}`);
            else
                throw new Error(`Plugin of type "${Known.className(nameOrType) ?? nameOrType.name}" not found. Plugins available: ${Object.keys(this.plugins).join(', ')}`);
        }

        return plugin as TPlugin;
    }

    /**
     * Tries to retrieve a plugin by its name or type. Returns undefined if not found.
     */
    tryGetPlugin<TPlugin, TOptions extends typeof RendererPlugin<TOptions>>(nameOrType: string | (new (...args: any[]) => TPlugin)): TPlugin | undefined
    {
        if (typeof nameOrType === 'string') {
            if (this.plugins[nameOrType])
                return this.plugins[nameOrType] as TPlugin;
        }
        else {
            for (const key in this.plugins)
                if (this.plugins[key] instanceof (nameOrType as any))
                    return this.plugins[key] as TPlugin;
        }

        return undefined
    }

    /**
     * Sets the current scene for rendering.
     */
    public set scene(scene: Scene)
    {
        if (this.activeScene === scene)
            // Nothing to do.
            return;

        this.activeScene = scene;

        this.changePluginsViewport();
    }

    /**
     * Gets the current scene being rendered.
     */
    public get scene(): Scene | undefined {
        return this.activeScene;
    }

    /**
     *  Changes the viewport for all plugins.
     */
    private changePluginsViewport(): void {
        for (const [key, plugin] of Object.entries(this.plugins))
            this.changePluginViewport(plugin);
    }

    /**
     * Changes the viewport for a single plugin.
     */
    private changePluginViewport(plugin: RendererPluginBase): void
    {
        // @ts-ignore
        plugin.renderer = this.renderer;

        // @ts-ignore
        plugin.scene = this.activeScene;

        // @ts-ignore
        plugin.camera = this.activeScene?.activeCamera;

        plugin.onChangeViewport();
    }
}
