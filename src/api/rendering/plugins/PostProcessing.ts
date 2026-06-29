import * as Gfx from 'three';

import { RendererPlugin }         from "../RendererPlugin";
import { EffectComposer }         from 'three/examples/jsm/Addons.js';
import { Pass }                   from 'three/examples/jsm/postprocessing/Pass.js';
import { RenderPass }             from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass }              from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass }             from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass }               from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { SSAARenderPass }         from 'three/examples/jsm/postprocessing/SSAARenderPass.js';
import { RenderPixelatedPass }    from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { Known }                  from '@shared/api/Known';
import { ShaderPass }             from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RendererRenderPass }     from '../RendererRenderPass';
import { CallbackRenderPass }     from '../passes/CallbackRenderPass';
import { CallbackSSAARenderPass } from '../passes/CallbackSSAARenderPass';

export interface PostProcessingOptions {
  ssaa?: boolean;
  bloom?: boolean;
};

@Known.class('BuiltIn.PostProcessing')
export class PostProcessing extends RendererPlugin<PostProcessingOptions>
{
  public effectComposer!: EffectComposer;
  public renderPassSSAA: CallbackSSAARenderPass | undefined;
  public renderPassRender: CallbackRenderPass | undefined;
  public renderPassBokeh: BokehPass | undefined;
  public renderPassOutput: OutputPass | undefined;
  public renderPassGTAO: GTAOPass | undefined;
  public renderPassPixelate: RenderPixelatedPass | undefined;

  public constructor(rendererPass: RendererRenderPass, options?: PostProcessingOptions)
  {
    super(rendererPass, options);

    this.effectComposer = new EffectComposer(this.renderer.native, this.rendererPass.renderTarget);
  }

  // Returns the render result of the post-processing.
  public get renderTargetTexture(): Gfx.Texture {
    return this.effectComposer.renderTarget2.texture;
  }

  public frameIndex: number = 0;

  public override update(rendererPass: RendererRenderPass): void
  {
    this.frameIndex++;

    if (!this.renderer || !this.scene || !this.scene.activeCamera) {
      // Nothing to render, no renderer or scene or camera.
      console.warn(`PostProcessing: No renderer, scene or camera available for rendering.`);
      return;
    }

    const width = rendererPass.renderTargetWidth;
    const height = rendererPass.renderTargetHeight;

    if (width <= 0 || height <= 0) {
      // Nowhere to render.
      console.warn(`PostProcessing: Invalid renderer size ${width}x${height}, nothing to render. renderTarget: ${rendererPass.renderTarget ? `renderTarget set` : 'none'}`);
      return;
    }

    this.effectComposer.setSize(width, height);

    if (this.renderPassGTAO) {
      this.renderPassGTAO.blendIntensity = 0.6;

      this.renderPassGTAO.updateGtaoMaterial({
        radius: 0.25,
        distanceExponent: 1,
        thickness: 0.5,
        scale: 2.0,
        samples: 16,
        distanceFallOff: 0.5,
        screenSpaceRadius: false,
      });

      this.renderPassGTAO.updatePdMaterial({
        lumaPhi: 14.,
        depthPhi: 2.,
        normalPhi: 3.,
        radius: 4.,
        radiusExponent: 1.,
        rings: 2.,
        samples: 16,
      });
    }

    // Updating plugins.
    for (const key in rendererPass.plugins)
      if (!(rendererPass.plugins[key] instanceof PostProcessing)) // Passes are updated in the EffectComposer, so we skip them here to avoid double updates.
    rendererPass.plugins[key].update(rendererPass);

    this.effectComposer.render();
  }

  public override onChangeViewport()
  {
    if (!this.scene?.activeCamera)
      // Nothing to render, no renderer or scene.
    return;


    this.renderPassRender = new CallbackRenderPass(this.renderer, this.scene, this.scene?.activeCamera, (time: DOMHighResTimeStamp, frame: XRFrame) => {
      if (this.rendererPass.loop)
        this.rendererPass.loop(time, frame);
    }, null, this.rendererPass.clearColor, this.rendererPass.clearAlpha);

    this.renderPassSSAA = new CallbackSSAARenderPass(this.renderer, this.scene, this.scene?.activeCamera, (time: DOMHighResTimeStamp, frame: XRFrame) => {
      if (this.rendererPass?.loop)
        this.rendererPass.loop(time, frame);
    }, null, this.rendererPass.clearColor,  this.rendererPass.clearAlpha);

    this.renderPassBokeh = new BokehPass(this.scene, this.scene?.activeCamera.native, {
      focus: 0.1,
      aperture: 0.0005,
      maxblur: 0.009
    });

    this.renderPassOutput = new OutputPass();

    this.renderPassGTAO = new GTAOPass(this.scene, this.scene?.activeCamera.native, this.renderer.native.getSize(new Gfx.Vector2()).width, this.renderer.native.getSize(new Gfx.Vector2()).height);

    this.renderPassPixelate = new RenderPixelatedPass(5, this.scene, this.scene?.activeCamera.native, {
      depthEdgeStrength: 0.6,
      normalEdgeStrength: 3
    });

    this.renderPassBokeh.enabled = true;
    this.renderPassPixelate.enabled = true;

    if (this.rendererPass.renderTarget)
      this.effectComposer.setSize(
      this.rendererPass.renderTarget?.width,
      this.rendererPass.renderTarget?.height
    );
    else
      this.effectComposer.setSize(
      this.renderer.native.getViewport(new Gfx.Vector4()).width,
      this.renderer.native.getViewport(new Gfx.Vector4()).height
    );

    this.setCustomPasses([], [], []);
  }

  setCustomPasses(preRenderPasses: Pass[], renderPasses: Pass[], postRenderPasses: Pass[]): void
  {
    this.effectComposer.passes.length = 0;
    this.effectComposer.addPass(this.renderPassRender!);

    this.effectComposer.addPass(this.renderPassSSAA!);
    this.effectComposer.addPass(this.renderPassGTAO!);
    //this.effectComposer.addPass(this.renderPassPixelate!);
    //this.effectComposer.addPass(this.renderPassBokeh!);

    for (const pass of renderPasses)
      this.effectComposer.addPass(pass);

    this.effectComposer.addPass(this.renderPassOutput!);

    for (const pass of postRenderPasses)
      this.effectComposer.addPass(pass);
  }
}

