import * as Gfx from 'three';
import { Bar } from './Bar';

/**
 * A series of OHLC bars rendered efficiently using InstancedMesh.
 * All bar boxes are drawn in a single draw call, and all vertical lines
 * share one LineSegments buffer for another single draw call.
 */
export class Series extends Gfx.Object3D
{
    // Unique identifier for the series. It's not the id of the Object3D as we need the id to be persistent across sessions.
    public uuid: string = crypto.randomUUID();

    // List of bar data objects (no longer Object3Ds).
    public bars: Bar[] = [];
    /** Returns the number of bars in this series. */
    public getNumBars(): number {
        return this.bars.length;
    }
    /** Shared unit-cube geometry for InstancedMesh. */
    private _boxGeometry = new Gfx.BoxGeometry(1, 1, 1);

    /** Single InstancedMesh that renders all bar boxes. */
    private _instancedMesh: Gfx.InstancedMesh | null = null;

    /** Shared material for the instanced bars. */
    private _boxMaterial = new Gfx.MeshLambertMaterial();

    /** BufferGeometry holding all vertical lines as LineSegments pairs. */
    private _lineGeometry = new Gfx.BufferGeometry();

    /** Single LineSegments that renders all bar wicks. */
    private _lineMesh: Gfx.LineSegments | null = null;

    /** Temporary color reused when setting instance colors. */
    private _tempColor = new Gfx.Color();

    /** The current bar width (used for scale). */
    private _barWidth: number = 0.1;

    /** Maximum number of instances allocated so far. */
    private _maxInstances: number = 0;

    /** Constructor. */
    public constructor() {
        super();
    }

    /**
     * Sets the number of bars in the series.
     * 
     * @param numBars The number of bars to set.
     * @param barWidth The width of each bar.
     * @param barSpacing The spacing between bars.
     */
    public setNumBars(numBars: number, barWidth: number, barSpacing: number): void {
        if (numBars < 0)
            throw new Error('Number of bars cannot be negative.');

        this._barWidth = barWidth;

        // Remove excess bars if the new number is less than the current number.
        while (this.bars.length > numBars) {
            this.bars.pop();
            // Bars are no longer Object3Ds, so nothing to remove from scene graph.
        }

        // Add new bars if the new number is greater than the current number.
        while (this.bars.length < numBars) {
            const previousBar = this.bars.length > 0 ? this.bars[this.bars.length - 1] : null;
            this.bars.push(new Bar(previousBar));
        }

        // Ensure InstancedMesh and LineSegments have enough capacity.
        this._ensureCapacity(numBars);

        // Layout bars in the x-axis.
        this.layoutBars(barWidth, barSpacing);

        // Update all instance matrices and colors.
        this.updateInstances();

        // Update line geometry for all bars.
        this.updateLines();
    }

    /**
     * Ensures InstancedMesh / LineSegments have at least `count` instances/vertices.
     */
    private _ensureCapacity(count: number): void {
        // --- InstancedMesh ---
        if (this._instancedMesh === null) {
            // First creation: build the mesh and attach to scene graph.
            this._instancedMesh = new Gfx.InstancedMesh(this._boxGeometry, this._boxMaterial, count);
            this._instancedMesh.instanceMatrix.setUsage(Gfx.DynamicDrawUsage);
            this.add(this._instancedMesh);
        } else if (count > this._maxInstances) {
            // Grow: InstancedMesh constructor doesn't support resizing directly.
            // We create a new InstancedMesh with the larger size and copy instance data.
            const oldCount = this._maxInstances;
            this._instancedMesh = new Gfx.InstancedMesh(this._boxGeometry, this._boxMaterial, count);
            this._instancedMesh.instanceMatrix.setUsage(Gfx.DynamicDrawUsage);

            // Copy existing instance matrices.
            for (let i = 0; i < oldCount; i++) {
                this._instancedMesh.setMatrixAt(i, this._getMatrixAt(i));
                this._instancedMesh.setColorAt(i, this._getColorAt(i));
            }
            this._instancedMesh.instanceMatrix.needsUpdate = true;
            if (this._instancedMesh.instanceColor)
                this._instancedMesh.instanceColor.needsUpdate = true;

            // Replace in scene graph.
            const parent = this._instancedMesh.parent;
            parent?.remove(this._instancedMesh);
            // The old mesh will be GC'd since nothing references it anymore.
            this.add(this._instancedMesh);
        }

        // --- LineSegments ---
        if (this._lineMesh === null) {
            // Each bar needs 2 vertices (1 line segment). We use LineSegments so each pair = 1 line.
            const positions = new Float32Array(count * 6); // 3 coords × 2 verts per line
            this._lineGeometry.setAttribute('position', new Gfx.BufferAttribute(positions, 3));
            this._lineGeometry.setDrawRange(0, 0); // start with nothing drawn

            this._lineMesh = new Gfx.LineSegments(this._lineGeometry, new Gfx.LineBasicMaterial());
            this.add(this._lineMesh);
        }

        if (count * 6 > (this._lineGeometry.attributes.position.array as Float32Array).length) {
            const positions = new Float32Array(count * 6);
            this._lineGeometry.setAttribute('position', new Gfx.BufferAttribute(positions, 3));
            this._lineGeometry.setDrawRange(0, 0);
        }

        this._maxInstances = Math.max(this._maxInstances, count);
    }

    /**
     * Gets the matrix for a given instance index (from either old or new InstancedMesh).
     */
    private _getMatrixAt(index: number): Gfx.Matrix4 {
        // After replacement, data is already in this._instancedMesh.
        // This helper exists for the resize path; during normal updates we write directly.
        const m = new Gfx.Matrix4();
        this._instancedMesh!.getMatrixAt(index, m);
        return m;
    }

    /**
     * Gets the color for a given instance index.
     */
    private _getColorAt(index: number): Gfx.Color {
        const c = new Gfx.Color();
        this._instancedMesh!.getColorAt(index, c);
        return c;
    }

    /**
     * Layouts the bars in the series so that they are next to each other, with a small spacing between them.
     * 
     * @param barWidth The width of each bar.
     * @param spacing The spacing between bars.
     */
    public layoutBars(barWidth: number = 0.1, spacing: number = 0.1): void {
        for (let i = 0; i < this.bars.length; i++) {
            const bar = this.bars[i];
            bar.posX = i * (barWidth + spacing);
        }
    }

    /**
     * Updates all instance matrices and colors on the InstancedMesh.
     */
    private updateInstances(): void {
        if (!this._instancedMesh) return;

        const count = this.bars.length;
        for (let i = 0; i < count; i++) {
            const bar = this.bars[i];
            const boxHeight = Math.abs(bar.c - bar.o);
            bar.updateMatrix(this._barWidth, boxHeight);
            this._instancedMesh.setMatrixAt(i, bar.getMatrix());

            const dc = bar.displayColor;
            this._tempColor.set(dc.r, dc.g, dc.b);
            this._instancedMesh.setColorAt(i, this._tempColor);
        }

        this._instancedMesh.instanceMatrix.needsUpdate = true;
        if (this._instancedMesh.instanceColor)
            this._instancedMesh.instanceColor.needsUpdate = true;

        // Clamp draw range to actual bar count.
        this._instancedMesh.count = count;
    }

    /**
     * Updates the shared LineSegments geometry with all bar wicks (high→low lines).
     */
    private updateLines(): void {
        if (!this._lineMesh) return;

        const positions = this._lineGeometry.attributes.position.array as Float32Array;
        const count = this.bars.length;

        for (let i = 0; i < count; i++) {
            const bar = this.bars[i];
            const base = i * 6; // 3 coords × 2 vertices
            positions[base + 0] = bar.posX; positions[base + 1] = bar.h; positions[base + 2] = 0;
            positions[base + 3] = bar.posX; positions[base + 4] = bar.l; positions[base + 5] = 0;

            // Color the wick the same as the bar body.
            const dc = bar.displayColor;
            this._tempColor.set(dc.r, dc.g, dc.b);
            // LineSegments uses vertex colors — assign to both vertices of each segment.
            if (!this._lineGeometry.attributes.color) {
                this._lineGeometry.setAttribute('color', new Gfx.BufferAttribute(new Float32Array(this._maxInstances * 6), 3));
            }
            const colors = this._lineGeometry.attributes.color.array as Float32Array;
            const cBase = (i * 6); // 3 RGB × 2 verts
            colors[cBase + 0] = dc.r; colors[cBase + 1] = dc.g; colors[cBase + 2] = dc.b;
            colors[cBase + 3] = dc.r; colors[cBase + 4] = dc.g; colors[cBase + 5] = dc.b;
        }

        this._lineGeometry.attributes.position.needsUpdate = true;
        if (this._lineGeometry.attributes.color)
            this._lineGeometry.attributes.color.needsUpdate = true;

        this._lineGeometry.setDrawRange(0, count * 2); // 2 vertices per line segment
    }

    /**
     * Randomizes the values of the bars in the series. This is useful for testing purposes.
     */
    public randomizeBars(): void {
        for (let i = 0; i < this.bars.length; i++) {
            const bar = this.bars[i];
            const o = i > 0 ? this.bars[i - 1].c : Math.random() * 0.2;
            const h = o + Math.random() * 0.2;
            const l = o - Math.random() * 0.2;
            const c = l + Math.random() * (h - l);
            bar.setValues(o, h, l, c);
        }
        // After randomizing, push updates to GPU.
        this.updateInstances();
        this.updateLines();
    }

    /**
     * Gets the bar at the specified index.
     * 
     * @param index The index of the bar to get.
     * 
     * @returns The bar at the specified index, or undefined if the index is out of bounds.
     */
    public getBar(index: number): Bar | undefined {
        return this.bars[index];
    }

    /**
     * Updates only the instance colors on the InstancedMesh (not matrices).
     * Call this after selection/hover state changes to refresh bar colors.
     */
    public updateColors(): void {
        if (!this._instancedMesh) return;

        const count = this.bars.length;
        for (let i = 0; i < count; i++) {
            const dc = this.bars[i].displayColor;
            this._tempColor.set(dc.r, dc.g, dc.b);
            this._instancedMesh.setColorAt(i, this._tempColor);
        }

        if (this._instancedMesh.instanceColor)
            this._instancedMesh.instanceColor.needsUpdate = true;

        // Also update line colors.
        this.updateLines();
    }

    /**
     * Updates instance matrices on the InstancedMesh only (no color changes).
     * Used internally by picking to ensure geometry is up-to-date before raycasting.
     */
    public updateMatricesOnly(): void {
        if (!this._instancedMesh) return;

        const count = this.bars.length;
        for (let i = 0; i < count; i++) {
            const bar = this.bars[i];
            const boxHeight = Math.abs(bar.c - bar.o);
            bar.updateMatrix(this._barWidth, boxHeight);
            this._instancedMesh.setMatrixAt(i, bar.getMatrix());
        }

        this._instancedMesh.instanceMatrix.needsUpdate = true;
        this._instancedMesh.count = count;
    }

    /**
     * @inheritDoc
     */
    public override updateMatrixWorld(force?: boolean): void {
        super.updateMatrixWorld(force);
    }
}