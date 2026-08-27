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
    public gridCube: Gfx.Mesh = new Gfx.Mesh(new Gfx.BoxGeometry(1, 1, 1), new Gfx.MeshBasicMaterial({ color: 0x000000, side: Gfx.BackSide }));

    /** The shift of the grid lines in the x-axis. This will be used to scroll the grid lines when the chart is scrolled. */
    public gridLinesShiftX: number = 0;

    /** The shift of the grid lines in the y-axis. This will be used to scroll the grid lines when the chart is scrolled. */
    public gridLinesShiftY: number = 0;

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
     * Lines will be laid out based on the chart's bounding box. The grid lines will be laid out in
     * the x-axis and y-axis, scrolled by gridLinesShiftX and gridLinesShiftY respectively.
     */
    public layoutGridLines(): void {
        if (!this.chart) {
            console.warn('No chart set for the grid.');
            return;
        }

        const chart = this.chart;
        const bbox = chart.getBBox();
        const chartWidth  = bbox.max.x - bbox.min.x;
        const chartHeight = bbox.max.y - bbox.min.y;

        const numLinesVertical   = 10;
        const numLinesHorizontal = this.chart.numHorizontalGridLines;

        // Reallocate the GPU buffer only when line counts change.
        if (numLinesVertical !== this.numGridLinesVertical || numLinesHorizontal !== this.numGridLinesHorizontal) {
            const numLinePairsV  = numLinesVertical   + 1;
            const numLinePairsH  = numLinesHorizontal + 2;
            const totalLinePairs = 3 * numLinePairsV + 2 * numLinePairsH + 5;
            const totalValues    = totalLinePairs * 6;

            if (!this.positionBuffer || totalValues > this.positionBuffer.array.length) {
                this.positionBuffer = new Gfx.Float32BufferAttribute(new Float32Array(totalValues), 3);
                this.gridLinesVertical.geometry.setAttribute('position', this.positionBuffer);
            }

            this.numGridLinesVertical   = numLinesVertical;
            this.numGridLinesHorizontal = numLinesHorizontal;
        }

        if (!this.positionBuffer)
            return;

        // Use a slight Z offset to prevent depth fighting between grid lines and cube faces.
        const GRID_Z_OFFSET = 0.0001;

        // Normalize horizontal shift to [0, chartWidth) so vertical lines wrap seamlessly.
        // Negate so grid lines scroll in the same direction as the bars.
        let shiftX = chartWidth > 0 ? ((-this.gridLinesShiftX % chartWidth) + chartWidth) % chartWidth : 0;

        console.log(`Normalized horizontal shift: ${shiftX}`);

        // Normalize vertical shift to [0, chartHeight) so horizontal lines wrap seamlessly.
        const shiftY = chartHeight > 0 ? ((-this.gridLinesShiftY % chartHeight) + chartHeight) % chartHeight : 0;

        // Always rewrite positions so scroll shifts are applied every frame.
        const arr = this.positionBuffer.array as Float32Array;
        let idx = 0;

        // Left side — horizontal lines scrolled vertically.
        for (let i = 0; i <= numLinesVertical; i++) {
            const y = bbox.min.y + ((chartHeight * (i / numLinesVertical) + shiftY) % chartHeight);
            arr[idx++] = bbox.min.x; arr[idx++] = y; arr[idx++] = bbox.min.z;
            arr[idx++] = bbox.min.x; arr[idx++] = y; arr[idx++] = bbox.max.z;
        }

        // Left side — additional horizontal line at the very top edge of the chart.
        arr[idx++] = bbox.min.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.min.z;
        arr[idx++] = bbox.min.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.max.z;

        // Right side — horizontal lines scrolled vertically.
        for (let i = 0; i <= numLinesVertical; i++) {
            const y = bbox.min.y + ((chartHeight * (i / numLinesVertical) + shiftY) % chartHeight);
            arr[idx++] = bbox.max.x; arr[idx++] = y; arr[idx++] = bbox.min.z;
            arr[idx++] = bbox.max.x; arr[idx++] = y; arr[idx++] = bbox.max.z;
        }

        // Right side — additional horizontal line at the very top edge of the chart.
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.min.z;
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.max.z;

        // Front face — horizontal lines scrolled vertically.
        for (let i = 0; i <= numLinesVertical; i++) {
            const y = bbox.min.y + ((chartHeight * (i / numLinesVertical) + shiftY) % chartHeight);
            arr[idx++] = bbox.min.x; arr[idx++] = y; arr[idx++] = bbox.min.z;
            arr[idx++] = bbox.max.x; arr[idx++] = y; arr[idx++] = bbox.min.z;
        }

        // Additional horizontal line at the very top edge of the chart.
        arr[idx++] = bbox.min.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.min.z;
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.min.z;

        // Front face — vertical lines at varying x, scrolled horizontally.
        for (let i = 0; i <= numLinesHorizontal; i++) {
            const x = bbox.min.x + ((chartWidth * (i / numLinesHorizontal) + shiftX) % chartWidth);
            arr[idx++] = x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.min.z;
            arr[idx++] = x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.min.z;
        }

        // Back face (floor) — depth lines using the same x positions as the front vertical lines,
        // scrolled identically. Lines that land on the left or right wall are suppressed.
        for (let i = 0; i < numLinesHorizontal; i++) {
            const x = bbox.min.x + ((chartWidth * (i / numLinesHorizontal) + shiftX) % chartWidth);
            if (x <= bbox.min.x || x >= bbox.max.x) continue;
            arr[idx++] = x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.min.z;
            arr[idx++] = x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.max.z;
        }

        // Back/top corner edges (static structural bounds, not grid lines).
        arr[idx++] = bbox.min.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.max.z;
        arr[idx++] = bbox.min.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.max.z;

        arr[idx++] = bbox.max.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.max.z;
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.max.z;
        arr[idx++] = bbox.min.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.max.z;
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.max.z;

        arr[idx++] = bbox.min.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.max.z;
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.max.z;

        // Drawing line at the right/back edge.
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.min.z;
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.max.z;

        this.positionBuffer.needsUpdate = true;
        this.gridLinesVertical.geometry.setDrawRange(0, idx / 3);

        // Positioning the grid cube to match the chart's bounding box.
        const padding = 0.0001;

        this.gridCube.position.set(
            (bbox.min.x + bbox.max.x) / 2,
            (bbox.min.y + bbox.max.y) / 2,
            (bbox.min.z + bbox.max.z) / 2
        );

        this.gridCube.scale.set(
            chartWidth  + padding,
            chartHeight + padding,
            bbox.max.z - bbox.min.z + padding
        );
    }

    /**
     * @inheritDoc
     */
    public override updateMatrixWorld(force?: boolean): void {
        super.updateMatrixWorld(force);

        this.layoutGridLines();
    }
}