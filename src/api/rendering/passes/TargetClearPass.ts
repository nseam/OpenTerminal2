import * as Gfx from 'three';

import { read } from "original-fs";
import { Color } from "three";
import { Pass } from 'three/examples/jsm/Addons.js';

/**
 * This class can be used to force a clear operation for the current read or
 * default framebuffer (when rendering to screen).
 *
 * ```js
 * const clearPass = new ClearPass();
 * composer.addPass( clearPass );
 * ```
 *
 * @augments Pass
 * @three_import import { ClearPass } from 'three/addons/postprocessing/ClearPass.js';
 */
export class TargetClearPass extends Pass {

	renderTarget: Gfx.WebGLRenderTarget;

	/**
	 * Overwritten to disable the swap.
	 *
	 * @type {boolean}
	 * @default false
	 */
	needsSwap = false;

	/**
	 * The clear color.
	 *
	 * @type {(number|Color|string)}
	 * @default 0x000000
	 */
	clearColor: number | Color | string;

	/**
	 * The clear alpha.
	 *
	 * @type {number}
	 * @default 0
	 */
	clearAlpha: number;

	_oldClearColor: Color;

	/**
	 * Constructs a new clear pass.
	 *
	 * @param {(number|Color|string)} [clearColor=0x000000] - The clear color.
	 * @param {number} [clearAlpha=0] - The clear alpha.
	 */
	constructor( clearColor: number | Color | string = 0x000000, clearAlpha: number = 0, renderTarget: Gfx.WebGLRenderTarget) {

		super();

		this.clearColor = clearColor;
		this.clearAlpha = clearAlpha;

		this.renderTarget = renderTarget;

		// internals

		this._oldClearColor = new Color();

	}

	/**
	 * Performs the clear operation. This affects the current read or the default framebuffer.
	 *
	 * @param {WebGLRenderer} renderer - The renderer.
	 * @param {WebGLRenderTarget} writeBuffer - The write buffer. This buffer is intended as the rendering
	 * destination for the pass.
	 * @param {WebGLRenderTarget} readBuffer - The read buffer. The pass can access the result from the
	 * previous pass from this buffer.
	 * @param {number} deltaTime - The delta time in seconds.
	 * @param {boolean} maskActive - Whether masking is active or not.
	 */
	render(
		renderer: Gfx.WebGLRenderer,
		writeBuffer: Gfx.WebGLRenderTarget,
		readBuffer: Gfx.WebGLRenderTarget
	) {

		let oldClearAlpha;

		if ( this.clearColor ) {

			renderer.getClearColor( this._oldClearColor );
			oldClearAlpha = renderer.getClearAlpha();

			renderer.setClearColor( this.clearColor, this.clearAlpha );

		}

		renderer.setRenderTarget( this.renderTarget );

		renderer.clear();

		if ( this.clearColor ) {
			renderer.setClearColor( this._oldClearColor, oldClearAlpha );
		}

	}

}
