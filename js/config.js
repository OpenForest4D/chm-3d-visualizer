// Configuration constants
const CONFIG = {
    TILE_SIZE: 1000,
    VISIBLE_DISTANCE: 2500,
    UPDATE_INTERVAL: 500,
    MAX_HEIGHT: 50,
    COLOR_STOPS: [
        { height: 0.0, color: new THREE.Color(0x003300) },
        { height: 0.2, color: new THREE.Color(0x339933) },
        { height: 0.4, color: new THREE.Color(0x66CC66) },
        { height: 0.6, color: new THREE.Color(0xFFCC00) },
        { height: 0.8, color: new THREE.Color(0xCC6600) },
        { height: 1.0, color: new THREE.Color(0xCC0000) }
    ],
    DEFAULT_SETTINGS: {
        heightScale: 1.0,
        wireframe: false,
        smoothShading: true,
        showControls: true,
        minHeightFilter: 0.0
    }
};
