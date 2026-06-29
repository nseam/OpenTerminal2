import { Known }                   from "@shared/api/Known";
import { RendererPluginBase }      from "./RendererPluginBase";
import type { RendererRenderPass } from "./RendererRenderPass";

@Known.class('BuiltIn.RendererPlugin')
export class RendererPlugin<TOptions> extends RendererPluginBase
{
    // The options provided to the plugin, if any.
    public readonly options?: TOptions;

    /**
     * Creates a new instance of the RendererPlugin class.
     * @param rendererPass The render pass that this plugin is associated with.
     * @param options Optional configuration options for the plugin.
     */
    constructor(rendererPass: RendererRenderPass, options?: TOptions) {
        super(rendererPass);

        this.options = options;
    }
}
