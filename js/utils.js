// Utility functions
class VisualizationUtils {
    static disposeMesh(mesh) {
        if (mesh.geometry) {
            mesh.geometry.dispose();
        }
        if (mesh.material) {
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(mat => mat.dispose());
            } else {
                mesh.material.dispose();
            }
        }
    }

    static utmToLatLng(easting, northing) {
        const utmProj = '+proj=utm +zone=11 +datum=WGS84 +units=m +no_defs';
        const wgs84Proj = '+proj=longlat +datum=WGS84 +no_defs';
        const [lng, lat] = proj4(utmProj, wgs84Proj, [easting, northing]);
        return [lat, lng];
    }

    static getColorForHeight(normalizedHeight, colorStops) {
        for (let i = 0; i < colorStops.length - 1; i++) {
            if (normalizedHeight >= colorStops[i].height && normalizedHeight <= colorStops[i + 1].height) {
                const t = (normalizedHeight - colorStops[i].height) / (colorStops[i + 1].height - colorStops[i].height);
                const color = new THREE.Color();
                color.r = colorStops[i].color.r + t * (colorStops[i + 1].color.r - colorStops[i].color.r);
                color.g = colorStops[i].color.g + t * (colorStops[i + 1].color.g - colorStops[i].color.g);
                color.b = colorStops[i].color.b + t * (colorStops[i + 1].color.b - colorStops[i].color.b);
                return color;
            }
        }
        return normalizedHeight <= 0 ? colorStops[0].color : colorStops[colorStops.length - 1].color;
    }

    static createDummyData() {
        const width = 100;
        const height = 100;
        const heightData = new Float32Array(width * height);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const centerDist = Math.sqrt(
                    Math.pow((x - width/2) / (width/4), 2) + 
                    Math.pow((y - height/2) / (height/4), 2)
                );
                const noise = Math.sin(x * 0.5) * Math.cos(y * 0.5) * 5;
                heightData[y * width + x] = Math.max(0, 40 * (1 - Math.min(1, centerDist))) + noise;
            }
        }
        
        return {
            heightData,
            width,
            height,
            maxHeight: 45,
            easting: 0,
            northing: 0,
            file: 'dummy.tif'
        };
    }
}
