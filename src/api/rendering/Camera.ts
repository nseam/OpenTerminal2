import * as Gfx       from 'three';
import { CameraKind } from './CameraKind';
import { Renderer }   from './Renderer';
import { Known }      from '@shared/api/Known';

@Known.class('BuiltIn.Camera')
export class Camera extends Gfx.Object3D
{
    // The type of camera (perspective or orthographic).
    public readonly kind: CameraKind;

    // The native camera object from the THREE.js library.
    public readonly native: Gfx.Camera;

    // Constructor for the Camera class.
    constructor(kind: CameraKind = CameraKind.Perspective, fov: number = 75, near: number = 0.1, far: number = 1000) {
        super();

        this.kind = kind;

        if (kind === CameraKind.Perspective)
            this.native = new Gfx.PerspectiveCamera(fov, 1, near, far);
        else
        if (kind === CameraKind.Orthographic) {
            this.native = new Gfx.OrthographicCamera(0, 1, 1, 0, near, far);
        }
        else
            throw new Error(`Unsupported camera type: ${kind}.`);

        this.add(this.native);
    }

    public update(renderer: Renderer): void {
        if (this.native instanceof Gfx.PerspectiveCamera) {
            this.native.aspect = renderer.native.domElement.clientWidth / renderer.native.domElement.clientHeight;
            this.native.updateProjectionMatrix();
        }
        else
        if (this.native instanceof Gfx.OrthographicCamera) {
            const aspect = renderer.native.domElement.clientWidth / renderer.native.domElement.clientHeight;
            const frustumSize = 1; // Adjust as needed
            this.native.left = -frustumSize * aspect;
            this.native.right = frustumSize * aspect;
            this.native.top = frustumSize;
            this.native.bottom = -frustumSize;
            this.native.updateProjectionMatrix();
        }
        else
        throw new Error(`Unsupported camera type: ${this.kind}.`);
    }
}
