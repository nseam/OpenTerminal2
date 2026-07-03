import * as Gfx from 'three';
import { type Chart } from './Chart';

export class ChartGrid extends Gfx.Object3D
{
    // Unique identifier for the chart. It's not the id of the Object3D as we need the id to be persistent across sessions.
    public uuid: string = crypto.randomUUID();

    // The chart that this grid belongs to.
    public chart: Chart;

    // Tracks the number of vertical grid lines to avoid unnecessary buffer reallocations.
    private numGridLinesVertical: number = -1;

    // Tracks the number of horizontal grid lines to avoid unnecessary buffer reallocations.
    private numGridLinesHorizontal: number = -1;

    // Cached position buffer attribute to avoid reallocation when positions don't increase.
    private positionBuffer: Gfx.Float32BufferAttribute | null = null;

    /**
     * The grid lines of the chart on the left side.
     */
    public gridLinesVertical: Gfx.LineSegments = new Gfx.LineSegments(new Gfx.BufferGeometry(), new Gfx.LineBasicMaterial({ color: 0x303030 }));

    /**
     * Cube that represents the bounding box of the chart.
     */
    public gridCube: Gfx.Mesh = new Gfx.Mesh(new Gfx.BoxGeometry(1, 1, 1), new Gfx.MeshBasicMaterial({ color: 0x0d0d0d, side: Gfx.BackSide }));

    /**
     * Construtor.
     */
    public constructor(chart: Chart) {
        super();

        this.chart = chart;

        this.gridLinesVertical.frustumCulled = false;

        this.add(this.gridCube);
        this.add(this.gridLinesVertical);
    }

    /**
     * Layouts the grid lines of the chart. This will be called whenever the chart is updated.
     * 
     * Lines will be laid out based on the chart's OHLC value. The grid lines will be laid out in the x-axis and y-axis.
     */
    public layoutGridLines(): void {
        if (!this.chart) {
            console.warn('No chart set for the grid.');
            return;
        }

        const chart = this.chart;
        
        // Drawing line on both sides (left and right) of the chart's bounding box. The lines will start from the left-front side of the bounding box and end at the left-back side of the bounding box. The lines will be laid out in the y-axis based on the chart's OHLC value.
        const ohlc = chart.getOHLC();
        const bbox = chart.getBBox();

        const numLinesVertical = 10;
        const numLinesHorizontal = this.chart.getNumBars();

        if (numLinesVertical !== this.numGridLinesVertical || numLinesHorizontal !== this.numGridLinesHorizontal) {
            // Calculate total position values needed (each line = 2 points × 3 components = 6 values)
            const numLinePairsV = numLinesVertical + 1;
            const numLinePairsH = numLinesHorizontal + 1;
            const totalLinePairs = 3 * numLinePairsV + 2 * numLinePairsH + 4;
            const totalValues = totalLinePairs * 6;

            // Allocate or grow buffer only when we need more space
            if (!this.positionBuffer || totalValues > this.positionBuffer.array.length) {
                this.positionBuffer = new Gfx.Float32BufferAttribute(new Float32Array(totalValues), 3);
            }

            // Write positions directly into the existing buffer's underlying array
            const arr = this.positionBuffer.array;
            let idx = 0;

            for (let i = 0; i <= numLinesVertical; i++) {
                const y = bbox.min.y + (bbox.max.y - bbox.min.y) * (i / numLinesVertical);
                arr[idx++] = bbox.min.x; arr[idx++] = y; arr[idx++] = bbox.min.z;
                arr[idx++] = bbox.min.x; arr[idx++] = y; arr[idx++] = bbox.max.z;
            }

            for (let i = 0; i <= numLinesVertical; i++) {
                const y = bbox.min.y + (bbox.max.y - bbox.min.y) * (i / numLinesVertical);
                arr[idx++] = bbox.max.x; arr[idx++] = y; arr[idx++] = bbox.min.z;
                arr[idx++] = bbox.max.x; arr[idx++] = y; arr[idx++] = bbox.max.z;
            }

            for (let i = 0; i <= numLinesVertical; i++) {
                const y = bbox.min.y + (bbox.max.y - bbox.min.y) * (i / numLinesVertical);
                arr[idx++] = bbox.min.x; arr[idx++] = y; arr[idx++] = bbox.min.z;
                arr[idx++] = bbox.max.x; arr[idx++] = y; arr[idx++] = bbox.min.z;
            }

            for (let i = 0; i <= numLinesHorizontal; i++) {
                const x = bbox.min.x + (bbox.max.x - bbox.min.x) * (i / numLinesHorizontal);
                arr[idx++] = x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.min.z;
                arr[idx++] = x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.min.z;
            }

            for (let i = 0; i <= numLinesHorizontal; i++) {
                const x = bbox.min.x + (bbox.max.x - bbox.min.x) * (i / numLinesHorizontal);
                arr[idx++] = x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.min.z;
                arr[idx++] = x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.max.z;
            }

            arr[idx++] = bbox.min.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.max.z;
            arr[idx++] = bbox.min.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.max.z;

            arr[idx++] = bbox.max.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.max.z;
            arr[idx++] = bbox.max.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.max.z;

            arr[idx++] = bbox.min.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.max.z;
            arr[idx++] = bbox.max.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.max.z;

            arr[idx++] = bbox.min.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.max.z;
            arr[idx++] = bbox.max.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.max.z;

            // Reuse the same buffer attribute — no new allocation
            this.gridLinesVertical.geometry.setAttribute('position', this.positionBuffer);

            this.numGridLinesVertical = numLinesVertical;
            this.numGridLinesHorizontal = numLinesHorizontal;
        }

        // Positioning the grid cube to match the chart's bounding box.
        // We will add a little bit of padding to the grid cube so that it doesn't overlap with the chart's bars.
        const padding = 0.00001;
        this.gridCube.position.set((bbox.min.x + bbox.max.x) / 2, (bbox.min.y + bbox.max.y) / 2, (bbox.min.z + bbox.max.z) / 2);
        this.gridCube.scale.set(bbox.max.x - bbox.min.x + padding, bbox.max.y - bbox.min.y + padding, bbox.max.z - bbox.min.z + padding);
    }

    /**
     * @inheritDoc
     */
    public override updateMatrixWorld(force?: boolean): void {
        super.updateMatrixWorld(force);

        this.layoutGridLines();
    }
}