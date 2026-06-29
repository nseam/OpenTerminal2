import * as Gfx     from 'three';
import { Camera }   from './Camera';
import { Renderer } from './Renderer';
import { Known }    from '@shared/api/Known';

@Known.class('BuiltIn.Scene')
export class Scene extends Gfx.Scene
{
    // All camera that could be used to render the scene.
    public cameras: Camera[] = [];

    // The currently active camera for rendering.
    public activeCamera: Camera | undefined = undefined;

    // Custom scene class that extends THREE.Scene.
    constructor(name: string = 'Scene') {
        super();

        this.name = name;
        this.background = new Gfx.Color(0x00000000); // Default background color.
    }

    /**
     * Generates a unique name for the object by appending a number if the name already exists.
     * Scans entire scene for existing objects with the same name.
     */
    private ensureUniqueName(baseName: string): string
    {
        let name = baseName;
        let index = 2;

        // Check if the name already exists in the scene.
        while (this.getObjectByName(name)) {
            name = `${baseName}_${index}`;
            index++;
        }

        return name;
    }

    update(renderer: Renderer): void {
        if (this.activeCamera)
            this.activeCamera.update(renderer);
    }

    override add(...object: Gfx.Object3D[]): this
    {
        // If the object is a Camera, set it as the current camera.
        for (const obj of object)
        {
            if (obj instanceof Camera) {
                // If the object is a Camera, add it to the cameras array.
                this.cameras.push(obj);

                if (!this.activeCamera)
                    this.activeCamera = obj;
            }

            // Ensure the object has a unique name.
            if (!obj.name || obj.name === '') {
                obj.name = this.ensureUniqueName(obj.constructor.name);
            } else {
                obj.name = this.ensureUniqueName(obj.name);
            }

            super.add(obj);
        }

        return this;
    }

    override remove(...object: Gfx.Object3D[]): this
    {
        // If the object is a Camera, remove its native camera.
        for (const obj of object) {
            if (obj instanceof Camera) {
                // If the removed camera was the active camera, set it to undefined.
                if (this.activeCamera === obj)
                    this.activeCamera = undefined;

                // Remove the camera from the cameras array.
                const index = this.cameras.indexOf(obj);

                if (index !== -1)
                    this.cameras.splice(index, 1);
            }

            super.remove(obj);
        }

        return this;
    }
}
