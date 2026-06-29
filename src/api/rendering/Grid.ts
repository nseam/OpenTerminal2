import * as Gfx  from 'three';
import { Known } from '@shared/api/Known';

@Known.class('BuiltIn.Grid')
export class Grid extends Gfx.Object3D
{
    constructor(size: number = 10, divisions: number = 10, subdivisions: number = 0, color1: Gfx.ColorRepresentation = 0x888888, color2: Gfx.ColorRepresentation = 0x444444, color3: Gfx.ColorRepresentation = 0x00aa00)
    {
        super();

        this.name = 'Grid';

        const gridHelper = new Gfx.GridHelper(size, divisions, color1, color2);
        gridHelper.position.set(0, -0.00001, 0);
        gridHelper.material.depthWrite = false;
        gridHelper.material.transparent = true;
        this.add(gridHelper);

        if (subdivisions > 0) {
            const gridSubdivisions = new Gfx.GridHelper(size, subdivisions, color1, color3);
            gridSubdivisions.position.set(0, -0.00001, 0);
            gridSubdivisions.material.depthWrite = false;
            gridSubdivisions.material.transparent = true;
            this.add(gridSubdivisions);
        }
    }
}
