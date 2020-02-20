import * as Delaunay from "d3-delaunay";
import Jimp from "jimp";

const neighborLocations = [
    [-1, -1],
    [ 0, -1],
    [ 1, -1],
    [ 1,  0],
    [ 1,  1],
    [ 0,  1],
    [-1,  1],
    [-1,  0],
];

export async function pixelfix(input) {
    const voronoiPoints = [];
    const voronoiColors = [];
    const image = await Jimp.read(input);
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
        const alpha = this.bitmap.data[ idx + 3 ];
        if (alpha !== 0) {
            const red   = this.bitmap.data[ idx + 0 ];
            const green = this.bitmap.data[ idx + 1 ];
            const blue  = this.bitmap.data[ idx + 2 ];
            // Voronoi
            for (const offset of neighborLocations) {
                const neighborAlpha = this.bitmap.data[image.getPixelIndex(x + offset[0], y + offset[1]) + 3];
                if (neighborAlpha === 0) {
                    voronoiPoints.push([x, y]);
                    voronoiColors.push([red, green, blue]);
                    break;
                }
            }
        }
    });
    if (voronoiPoints.length > 0) {
        const dela = Delaunay.Delaunay.from(voronoiPoints);
        image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
            const alpha = this.bitmap.data[ idx + 3 ];
            if (alpha === 0) {
                const closestIndex = dela.find(x, y);
                if (closestIndex !== -1) {
                    const color = voronoiColors[closestIndex];

                    this.bitmap.data[ idx + 0 ] = color[0];
                    this.bitmap.data[ idx + 1 ] = color[1];
                    this.bitmap.data[ idx + 2 ] = color[2];
                }
            }
        });
        return await image.getBufferAsync(Jimp.MIME_PNG);
    } else {
        return input;
    }
}
