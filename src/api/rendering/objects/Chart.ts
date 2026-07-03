import * as Gfx from 'three';
import { Series } from './Series';
import { ChartGrid } from './ChartGrid';

export class Chart extends Gfx.Object3D
{
    // Unique identifier for the chart. It's not the id of the Object3D as we need the id to be persistent across sessions.
    public uuid: string = crypto.randomUUID();

    // List of series to be displayed in the chart.
    public series: Series[] = [];

    // The grid of the chart. This will be used to display the grid lines on the chart.
    public grid: ChartGrid = new ChartGrid(this);

    // Number of bars in the chart. This will be used to layout the grid lines in the chart.
    public numBars: number = 0;

    // The width of each bar in the chart. This will be used to layout the bars in the series.
    public barWidth: number = 0.1;

    // The spacing between bars in the chart. This will be used to layout the bars in the series.
    public barSpacing: number = 0.05;

    /**
     * Construtor.
     */
    public constructor(numBars: number, barWidth: number = 0.1, barSpacing: number = 0.05) {
        super();

        this.numBars = numBars;
        this.barWidth = barWidth;
        this.barSpacing = barSpacing;

        this.add(this.grid);
    }

    /**
     * Adds a series to the chart.
     *
     * @param series The series to add.
     */
    public addSeries(series: Series): void {
        if (this.series.includes(series)) {
            console.warn('Series is already added to the chart.');
            return;
        }

        this.series.push(series);

        this.add(series);

        series.setNumBars(this.numBars, this.barWidth, this.barSpacing);
    }

    /**
     * Removes a series from the chart.
     *
     * @param series The series to remove.
     */
    public removeSeries(series: Series): void {
        const index = this.series.indexOf(series);
        if (index === -1) {
            console.warn('Series is not part of the chart.');
            return;
        }

        this.series.splice(index, 1);
        this.remove(series);
    }
    
    /**
     * Return number of bars for the first series in the chart. If there are no series, return 0.
     */
    public getNumBars(): number {
        if (this.series.length === 0)
            return 0;

        return this.series[0].getNumBars();
    }

    /**
     * Gets the OHLC (Open, High, Low, Close) values of the chart. This will be calculated based on the series and bars in the chart.
     * 
     * @returns An object containing the OHLC values.
     */
    public getOHLC(): { o: number, h: number, l: number, c: number } {
        let o: number | null = null;
        let h: number | null = null;
        let l: number | null = null;
        let c: number | null = null;

        for (const series of this.series) {
            for (const bar of series.bars) {
                if (o === null || bar.o < o) o = bar.o;
                if (h === null || bar.h > h) h = bar.h;
                if (l === null || bar.l < l) l = bar.l;
                if (c === null || bar.c > c) c = bar.c;
            }
        }

        return { o: o ?? 0, h: h ?? 0, l: l ?? 0, c: c ?? 0 };
    }

    /**
     * Gets the bounding box of the chart. This will be calculated based on the OHLC values of all bars.
     * 
     * @returns The bounding box of the chart.
     */
    public getBBox(): Gfx.Box3 {
        const bbox = new Gfx.Box3();

        for (const series of this.series) {
            for (const bar of series.bars) {
                // Compute bar bounds from OHLC + layout position.
                const boxHeight = Math.abs(bar.c - bar.o);
                const boxY = (bar.c + bar.o) / 2;
                const halfW = this.barWidth / 2;
                const halfH = Math.max(boxHeight, 0.001) / 2;
                const px = bar.posX;

                bbox.min.x = Math.min(bbox.min.x, px - halfW);
                bbox.min.y = Math.min(bbox.min.y, boxY - halfH);
                bbox.max.x = Math.max(bbox.max.x, px + halfW);
                bbox.max.y = Math.max(bbox.max.y, boxY + halfH);
            }
        }

        bbox.expandByPoint(new Gfx.Vector3(0, 0, -0.5));
        bbox.expandByPoint(new Gfx.Vector3(0, 0, 0.1));

        // Expanding on sides by bar width.
        bbox.expandByPoint(new Gfx.Vector3(-this.barWidth - this.barSpacing, 0, 0));
        bbox.expandByPoint(new Gfx.Vector3(bbox.max.x + this.barWidth + this.barSpacing, 0, 0));

        return bbox;
    }

    /**
     * @inheritDoc
     */
    public override updateMatrixWorld(force?: boolean): void {
        super.updateMatrixWorld(force);
    }
}