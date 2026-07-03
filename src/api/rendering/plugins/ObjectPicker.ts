import * as Gfx from 'three';
import { RendererPlugin } from "../RendererPlugin";
import { Known } from "@shared/api/Known";
import { RendererRenderPass } from '../RendererRenderPass';
import { Renderer } from '../Renderer';
import type { Scene } from '../Scene';
import type { Camera } from '../Camera';

export interface ObjectPickerOptions {
    // Options can be added here in the future if needed.
}

@Known.class('BuiltIn.ObjectPicker')
export class ObjectPicker extends RendererPlugin<ObjectPickerOptions>
{
    private raycaster: Gfx.Raycaster = new Gfx.Raycaster();

    public constructor(rendererPass: RendererRenderPass, options?: ObjectPickerOptions)
    {
        super(rendererPass, options);
    }

    public pick(scene: Scene, camera: Camera, mousePosition: Gfx.Vector2, expectedType?: new (...args: any[]) => Gfx.Object3D): Gfx.Intersection<Gfx.Object3D>[] | undefined
    {
        if (!scene || !camera) {
            // Nothing to pick from, no scene or camera.
            console.warn('ObjectPicker: No scene or camera set for picking.');
            return;
        }

        this.raycaster.setFromCamera(mousePosition, camera.native);
        this.raycaster.params.Line.threshold = 0.2;
        this.raycaster.params.Points.threshold = 0.5;
        const intersects = this.raycaster.intersectObjects(scene.children, true);

        // Also adding all parents of the instersected objects to the list of intersects, so that we can pick parent objects as well.
        for (const intersect of intersects) {
            let parent = intersect.object.parent;
            while (parent) {
                if (!intersects.find(i => i.object === parent)) {
                    intersects.push({ ...intersect, object: parent });
                }
                parent = parent.parent;
            }
        }

        if (expectedType) {
            return intersects.filter(i => i.object instanceof expectedType);
        }

        return intersects;
    }

    public override update(renderPass: RendererRenderPass): void {
    }

    public override onChangeViewport(): void {
        if (!this.scene)
            return;
    }
}
