// Main CHM Visualization Application
class CHMVisualization {
    constructor() {
        // Three.js scene elements
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.terrain = null;
        this.raycaster = null;
        this.mouse = new THREE.Vector2();

        // Data structures
        this.tiles = new Map(); // Map of year -> Map of key -> tileData
        this.tileRectangles = new Map(); // Map of year -> Map of key -> rectangle
        this.loadingTiles = new Set();

        // State variables
        this.lastUpdateTime = 0;
        this.switchingYear = false;
        this.selectedTileRectangle = null;
        this.selectedTileKey = null;
        this.currentYear = null; // Will be set to the most recent year
        this.availableYears = []; // Will be populated from tileMetadata
        this.maxHeight = CONFIG.MAX_HEIGHT;
        this.map = null;
        this.heightDistributionChart = null;

        // Settings with bound methods
        this.settings = {
            heightScale: 1.0,
            wireframe: false,
            smoothShading: true,
            showControls: true,
            minHeightFilter: 0.0,
            updateTerrain: this.updateTerrain.bind(this),
            resetCamera: this.resetCamera.bind(this)
        };

        // Initialize the application
        this.init();
    }

    async init() {
        // Extract available years from tileMetadata
        this.availableYears = Object.keys(tileMetadata).filter(year => Array.isArray(tileMetadata[year])).sort().reverse(); // Sort descending for most recent first
        if (this.availableYears.length === 0) {
            this.showError('No valid years found in tile metadata. Using dummy data.');
            this.createDummyData();
            this.createTileMesh(this.tiles.get('dummy').get('dummy_0_0'), 'dummy_0_0');
            this.createColorLegend();
            this.selectedTileKey = 'dummy_0_0';
            this.hideLoading();
            document.getElementById('downloadTile').disabled = true;
            this.animate();
            this.setupGUI();
            return;
        }
        this.currentYear = this.availableYears[0]; // Default to most recent year

        // Initialize year-specific Maps
        this.availableYears.forEach(year => {
            this.tiles.set(year, new Map());
            this.tileRectangles.set(year, new Map());
        });

        this.setupScene();
        this.setupMap();
        this.setupHeightDistributionModal();
        this.showLoading('Loading CHM Data...');

        try {
            const firstTile = tileMetadata[this.currentYear][0];
            await this.loadTile(firstTile, true, this.currentYear);
            this.createTileMesh(
                this.tiles.get(this.currentYear).get(`${firstTile.easting}_${firstTile.northing}`),
                `${firstTile.easting}_${firstTile.northing}`
            );

            // Load corresponding tile from other years if exists
            for (const year of this.availableYears) {
                if (year === this.currentYear) continue;
                const correspondingTile = tileMetadata[year].find(tile =>
                    tile.easting === firstTile.easting && tile.northing === firstTile.northing
                );
                if (correspondingTile) {
                    await this.loadTile(correspondingTile, false, year);
                }
            }

            this.createColorLegend();
            document.getElementById('maxHeightLabel').textContent = `${this.maxHeight.toFixed(1)}m`;
            this.selectedTileKey = `${firstTile.easting}_${firstTile.northing}`;
            this.hideLoading();
            document.getElementById('downloadTile').disabled = false;
            this.highlightTile(this.selectedTileKey);
            this.animate();
        } catch (error) {
            this.showError(`Error loading initial tile: ${error.message}. Using dummy data.`);
            this.createDummyData();
            this.createTileMesh(this.tiles.get('dummy').get('dummy_0_0'), 'dummy_0_0');
            this.createColorLegend();
            this.selectedTileKey = 'dummy_0_0';
            this.hideLoading();
            document.getElementById('downloadTile').disabled = true;
            this.animate();
        }

        this.loadRemainingTiles();
        this.setupGUI();
        this.setupEventListeners();
    }

    // ========== SETUP METHODS ========== //

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x2c3e50);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(0, 400, 600);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.querySelector('.visualization-container').appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.rotateSpeed = 0.7;

        this.raycaster = new THREE.Raycaster();

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(500, 500, 500);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 100;
        directionalLight.shadow.camera.far = 1500;
        directionalLight.shadow.camera.left = -500;
        directionalLight.shadow.camera.right = 500;
        directionalLight.shadow.camera.top = 500;
        directionalLight.shadow.camera.bottom = -500;
        this.scene.add(directionalLight);

        this.scene.fog = new THREE.FogExp2(0x2c3e50, 0.0007);

        this.terrain = new THREE.Group();
        this.scene.add(this.terrain);

        window.addEventListener('resize', () => this.onWindowResize());
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    }

    setupMap() {
        this.map = L.map('map', { attributionControl: false }).setView([37.02, -119.20], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {}).addTo(this.map);

        // Create rectangles for each year's tiles
        this.availableYears.forEach(year => {
            const layerGroup = L.layerGroup();
            tileMetadata[year].forEach(tile => {
                const [latSW, lngSW] = VisualizationUtils.utmToLatLng(tile.easting, tile.northing);
                const [latNE, lngNE] = VisualizationUtils.utmToLatLng(tile.easting + CONFIG.TILE_SIZE, tile.northing + CONFIG.TILE_SIZE);
                const bounds = [[latSW, lngSW], [latNE, lngNE]];

                const rectangle = L.rectangle(bounds, {
                    color: year === this.availableYears[0] ? '#4CAF50' : '#D2B48C', // Most recent year green, others tan
                    weight: 1,
                    fillOpacity: 0.2
                });

                const key = `${tile.easting}_${tile.northing}`;
                this.tileRectangles.get(year).set(key, rectangle);

                rectangle.on('click', () => this.handleTileClick(tile, key, year));
                rectangle.bindPopup(`${tile.file.split('/').pop()}`, { offset: L.point(10, 10) });
                layerGroup.addLayer(rectangle);
            });

            if (year === this.currentYear) {
                layerGroup.addTo(this.map);
            }
        });

        // Fit bounds to all tiles of the current year
        const allBounds = tileMetadata[this.currentYear].map(tile => {
            const [latSW, lngSW] = VisualizationUtils.utmToLatLng(tile.easting, tile.northing);
            const [latNE, lngNE] = VisualizationUtils.utmToLatLng(tile.easting + CONFIG.TILE_SIZE, tile.northing + CONFIG.TILE_SIZE);
            return [[latSW, lngSW], [latNE, lngNE]];
        });
        this.map.fitBounds(L.latLngBounds(allBounds.flat()));

        // Year select control
        const YearControl = L.Control.extend({
            options: { position: 'bottomright', availableYears: [] },
            onAdd: function() {
                const container = L.DomUtil.create('div', 'leaflet-control-year-select');
                const selectOptions = this.options.availableYears.map(year =>
                    `<option value="${year}">${year}</option>`
                ).join('');
                container.innerHTML = `
                    <select id="yearSelect">
                        ${selectOptions}
                    </select>
                `;
                L.DomEvent.disableClickPropagation(container);
                return container;
            }
        });

        this.map.addControl(new YearControl({ availableYears: this.availableYears }));
    }
    
    setupGUI() {
        const gui = new dat.GUI({ autoPlace: true, width: 310 });
        gui.domElement.style.opacity = '0.9';

        const terrainFolder = gui.addFolder('Forest Settings');
        terrainFolder.add(this.settings, 'heightScale', 0.1, 5.0).name('Height Exaggeration').onChange(this.settings.updateTerrain);
        terrainFolder.add(this.settings, 'wireframe').name('Wireframe').onChange(value => {
            this.terrain.children.forEach(child => {
                child.material.wireframe = value;
                child.material.needsUpdate = true;
            });
        });
        terrainFolder.add(this.settings, 'smoothShading').name('Smooth Shading').onChange(value => {
            this.terrain.children.forEach(child => {
                child.material.flatShading = !value;
                child.material.needsUpdate = true;
            });
        });
        terrainFolder.add(this.settings, 'minHeightFilter', 0, this.maxHeight, 0.1).name('Min Height Filter (m)').onChange(this.settings.updateTerrain);

        const cameraFolder = gui.addFolder('Camera');
        cameraFolder.add(this.settings, 'resetCamera').name('Reset Camera Position');

        terrainFolder.open();
    }

    setupHeightDistributionModal() {
        const ctx = document.getElementById('heightDistributionChart').getContext('2d');
        this.heightDistributionChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, labels: { color: 'rgba(255, 255, 255, 0.7)', font: { size: 12 } } },
                    title: { display: false }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Height (m)',
                            color: 'rgba(255, 255, 255, 0.7)',
                            font: { size: 12 }
                        },
                        ticks: { color: 'rgba(255, 255, 255, 0.7)', font: { size: 10 } }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Frequency',
                            color: 'rgba(255, 255, 255, 0.7)',
                            font: { size: 12 }
                        },
                        ticks: { color: 'rgba(255, 255, 255, 0.7)', font: { size: 10 } },
                        beginAtZero: true
                    }
                }
            }
        });

        const modal = document.getElementById('heightDistributionModal');
        document.getElementById('showHeightDistribution').addEventListener('click', () => {
            if (this.selectedTileKey && this.availableYears.some(year => this.tiles.get(year).has(this.selectedTileKey))) {
                this.updateHeightDistribution(this.selectedTileKey);
                modal.style.display = 'block';
            } else {
                this.showError('No tile selected. Please hover over a tile or click on the map.');
            }
        });

        document.getElementById('closeHeightDistribution').addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    setupEventListeners() {
        document.getElementById('downloadTile').addEventListener('click', () => this.downloadTile());

        document.getElementById('yearSelect').addEventListener('change', async (e) => {
            if (this.switchingYear) return;
            this.switchingYear = true;
            const newYear = e.target.value;
            const oldYear = this.currentYear;
            const currentTileKey = this.selectedTileKey;

            try {
                this.currentYear = newYear;
                document.getElementById('heightDistributionModal').style.display = 'none';
                this.updateColorLegend();
                this.updateMapLayers();

                let targetTile = null;
                if (currentTileKey && !currentTileKey.includes('dummy')) {
                    const [easting, northing] = currentTileKey.split('_').map(Number);
                    targetTile = tileMetadata[newYear].find(tile =>
                        tile.easting === easting && tile.northing === northing
                    );
                }

                if (targetTile) {
                    const key = `${targetTile.easting}_${targetTile.northing}`;
                    this.selectedTileKey = key;
                    this.settings.resetCamera(targetTile);
                    const tiles = this.tiles.get(newYear);
                    // Force reload: Clear any failed state
                    if (tiles.has(key)) tiles.delete(key);
                    await this.loadTile(targetTile, true, newYear);
                    this.createTileMesh(tiles.get(key), key);
                } else {
                    this.settings.resetCamera();
                }

                await this.updateVisibleTiles();
            } catch (error) {
                this.showError(`Error switching to ${newYear}: ${error.message}`);
            } finally {
                this.switchingYear = false;
            }
        });

        window.addEventListener('keydown', (event) => {
            if (event.key === 'h' || event.key === 'H') {
                this.settings.showControls = !this.settings.showControls;
                document.querySelector('.dg.ac').style.display = this.settings.showControls ? '' : 'none';
                document.getElementById('mapPanel').style.display = this.settings.showControls ? '' : 'none';
            }
        });
    }

    // ========== TILE MANAGEMENT METHODS ========== //

    async loadTile(tile, showLoadingMessage = false, year) {
        if (!tile || !tile.file) {
            console.warn(`Invalid tile data for ${year}:`, tile);
            throw new Error('Invalid tile data');
        }

        const key = `${tile.easting}_${tile.northing}`;
        const tiles = this.tiles.get(year);

        if (showLoadingMessage) this.showLoading(`Loading ${year} tile ${tile.file.split('/').pop()}...`);
        this.loadingTiles.add(key);

        try {
            console.log(`Attempting to fetch ${tile.file}`);
            const response = await fetch(tile.file);
            if (!response.ok) {
                const errorDetails = `HTTP error! Status: ${response.status}, Status Text: ${response.statusText}`;
                throw new Error(errorDetails);
            }
            const arrayBuffer = await response.arrayBuffer();
            const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
            const image = await tiff.getImage();

            const width = image.getWidth();
            const height = image.getHeight();
            const rasters = await image.readRasters();
            const heightData = rasters[0];

            let tileMaxHeight = 0;
            let validDataCount = 0;
            for (let i = 0; i < heightData.length; i++) {
                if (heightData[i] !== -9999 && heightData[i] !== 65535 && heightData[i] >= 0) {
                    tileMaxHeight = Math.max(tileMaxHeight, heightData[i]);
                    validDataCount++;
                } else {
                    heightData[i] = 0;
                }
            }

            if (validDataCount === 0) {
                console.warn(`Tile ${tile.file} contains no valid height data.`);
            }

            tiles.set(key, {
                heightData,
                width,
                height,
                maxHeight: tileMaxHeight,
                easting: tile.easting,
                northing: tile.northing,
                file: tile.file
            });

            const oldMaxHeight = this.maxHeight;
            this.maxHeight = Math.max(this.maxHeight, tileMaxHeight);
            document.getElementById('maxHeightLabel').textContent = `${this.maxHeight.toFixed(1)}m`;

            if (this.maxHeight !== oldMaxHeight) {
                this.settings.updateTerrain();
            }

            console.log(`Successfully loaded tile ${key}`);
            return true;
        } catch (error) {
            console.error(`Failed to load tile ${key}: ${error.message}`);
            this.showError(`Failed to load ${year} tile ${tile.file.split('/').pop()}: ${error.message}`);
            tiles.delete(key); // Clear failed tile to allow retry
            return false;
        } finally {
            this.loadingTiles.delete(key);
            if (showLoadingMessage) this.hideLoading();
        }
    }

    createTileMesh(tileData, key) {
        if (!tileData) {
            console.warn(`No tile data for key ${key}, creating placeholder mesh`);
            // Create a placeholder mesh to indicate missing tile
            const geometry = new THREE.PlaneGeometry(CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, 1, 1);
            const material = new THREE.MeshBasicMaterial({ color: 0xff0000, opacity: 0.5, transparent: true });
            const placeholderMesh = new THREE.Mesh(geometry, material);
            placeholderMesh.rotation.x = -Math.PI / 2;
            placeholderMesh.position.set(
                tileData ? tileData.easting - tileMetadata[this.currentYear][0].easting : 0,
                0,
                tileData ? tileData.northing - tileMetadata[this.currentYear][0].northing : 0
            );
            placeholderMesh.name = key;
            placeholderMesh.userData = { key, file: tileData ? tileData.file : 'placeholder' };
            this.terrain.add(placeholderMesh);
            return;
        }

        const geometry = new THREE.PlaneGeometry(
            CONFIG.TILE_SIZE, CONFIG.TILE_SIZE,
            Math.min(tileData.width - 1, 199),
            Math.min(tileData.height - 1, 199)
        );

        const vertices = geometry.attributes.position.array;
        const halfWidth = CONFIG.TILE_SIZE / 2;
        const halfHeight = CONFIG.TILE_SIZE / 2;

        for (let i = 0; i < vertices.length; i += 3) {
            const x = Math.floor((vertices[i] + halfWidth) / CONFIG.TILE_SIZE * tileData.width);
            const y = Math.floor((vertices[i + 1] + halfHeight) / CONFIG.TILE_SIZE * tileData.height);
            const heightIndex = (tileData.height - y - 1) * tileData.width + x;
            let height = 0;

            if (heightIndex >= 0 && heightIndex < tileData.heightData.length) {
                height = tileData.heightData[heightIndex];
                if (height === 65535 || height < 0) height = 0;
            }

            height = (height >= this.settings.minHeightFilter) ? height * this.settings.heightScale : 0;
            vertices[i + 2] = height;
        }

        geometry.computeVertexNormals();
        this.applyVertexColors(geometry);

        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            flatShading: !this.settings.smoothShading,
            wireframe: this.settings.wireframe,
            side: THREE.DoubleSide,
            shininess: 30
        });

        const tileMesh = new THREE.Mesh(geometry, material);
        tileMesh.rotation.x = -Math.PI / 2;
        tileMesh.position.set(
            tileData.easting - tileMetadata[this.currentYear][0].easting,
            0,
            tileData.northing - tileMetadata[this.currentYear][0].northing
        );
        tileMesh.receiveShadow = true;
        tileMesh.castShadow = true;
        tileMesh.name = key;
        tileMesh.userData = { key, file: tileData.file };

        this.terrain.add(tileMesh);
    }

    applyVertexColors(geometry) {
        const positions = geometry.attributes.position.array;
        const colors = new Float32Array(positions.length);

        const thresholdHeight = 60;
        const lowerRange = thresholdHeight;
        const upperRange = this.maxHeight - thresholdHeight;

        for (let i = 0; i < positions.length; i += 3) {
            let height = positions[i + 2] / this.settings.heightScale;
            let normalizedHeight;

            if (height <= thresholdHeight) {
                normalizedHeight = (height / lowerRange) * 0.6;
            } else {
                normalizedHeight = 0.6 + ((height - thresholdHeight) / upperRange) * 0.4;
            }

            normalizedHeight = Math.min(1.0, Math.max(0.0, normalizedHeight));
            const color = VisualizationUtils.getColorForHeight(normalizedHeight, CONFIG.COLOR_STOPS);

            colors[i] = color.r;
            colors[i + 1] = color.g;
            colors[i + 2] = color.b;
        }

        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }

    // ========== VISUALIZATION METHODS ========== //

    createColorLegend() {
        const gradientBar = document.getElementById('gradientBar');
        let gradientCSS = 'linear-gradient(to right';
        CONFIG.COLOR_STOPS.forEach(stop => {
            const hexColor = '#' + stop.color.getHexString();
            gradientCSS += `, ${hexColor} ${stop.height * 100}%`;
        });
        gradientCSS += ')';
        gradientBar.style.background = gradientCSS;
        gradientBar.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        gradientBar.style.borderRadius = '4px';
        document.getElementById('midHeightLabel').textContent = '60m';
    }

    updateColorLegend() {
        document.getElementById('minHeightLabel').textContent = '0m';
        document.getElementById('maxHeightLabel').textContent = `${this.maxHeight.toFixed(1)}m`;
        this.createColorLegend();
    }

    highlightTile(tileKey) {
        const rectangles = this.tileRectangles.get(this.currentYear);
        rectangles.forEach((rectangle, key) => {
            if (key === tileKey) {
                rectangle.setStyle({
                    color: '#FF4500',
                    weight: 1,
                    fillOpacity: 0.5
                });
                this.selectedTileRectangle = rectangle;
                this.selectedTileKey = key;
            } else {
                rectangle.setStyle({
                    color: this.currentYear === this.availableYears[0] ? '#4CAF50' : '#D2B48C',
                    weight: 1,
                    fillOpacity: 0.2
                });
            }
        });
    }

    updateMapLayers() {
        this.map.eachLayer(layer => {
            if (layer !== this.map._layers[Object.keys(this.map._layers)[0]]) {
                this.map.removeLayer(layer);
            }
        });

        const layerGroup = L.layerGroup(Array.from(this.tileRectangles.get(this.currentYear).values()));
        layerGroup.addTo(this.map);
    }

    // ========== TILE INTERACTION METHODS ========== //

    async handleTileClick(tile, key, year) {
        const heightDistributionModal = document.getElementById('heightDistributionModal');
        if (heightDistributionModal) {
            heightDistributionModal.style.display = 'none';
        }

        if (this.currentYear !== year) {
            this.currentYear = year;
            document.getElementById('yearSelect').value = year;
            this.updateMapLayers();
        }

        this.highlightTile(key);

        const tiles = this.tiles.get(year);
        // Force reload: Clear any failed state
        if (tiles.has(key)) tiles.delete(key);
        this.showLoading(`Loading ${year} tile ${tile.file.split('/').pop()}...`);
        const success = await this.loadTile(tile, true, year);
        if (success) {
            this.createTileMesh(tiles.get(key), key);
        } else {
            this.createTileMesh(null, key); // Placeholder for failed tile
        }

        // Load corresponding tiles from other years
        for (const otherYear of this.availableYears) {
            if (otherYear === year) continue;
            const otherTiles = tileMetadata[otherYear];
            const otherTileMap = this.tiles.get(otherYear);
            const correspondingTile = otherTiles.find(t =>
                t.easting === tile.easting && t.northing === tile.northing
            );
            if (correspondingTile && !otherTileMap.has(key)) {
                await this.loadTile(correspondingTile, false, otherYear);
            }
        }

        this.camera.position.set(
            tile.easting - tileMetadata[year][0].easting,
            400,
            tile.northing - tileMetadata[year][0].northing + 600
        );
        this.controls.target.set(
            tile.easting - tileMetadata[year][0].easting,
            0,
            tile.northing - tileMetadata[year][0].northing
        );
        this.controls.update();

        if (!this.terrain.getObjectByName(key) && tiles.has(key)) {
            this.createTileMesh(tiles.get(key), key);
        }

        this.selectedTileKey = key;
        document.getElementById('downloadTile').disabled = false;
        this.updateVisibleTiles();
    }

    downloadTile() {
        if (!this.selectedTileKey || !this.tiles.get(this.currentYear).has(this.selectedTileKey)) {
            this.showError('No tile selected for download.');
            return;
        }

        const tileData = this.tiles.get(this.currentYear).get(this.selectedTileKey);
        if (!tileData) {
            this.showError('Selected tile data not available.');
            return;
        }

        try {
            const newTab = window.open(tileData.file, '_blank');
            if (!newTab) {
                throw new Error('Failed to open new tab. Please allow popups for this site.');
            }
        } catch (error) {
            this.showError(`Failed to initiate download: ${error.message}`);
        }
    }

    // ========== DATA METHODS ========== //

    createDummyData() {
        const dummyData = VisualizationUtils.createDummyData();
        this.availableYears = ['dummy'];
        this.currentYear = 'dummy';
        this.tiles.set('dummy', new Map([['dummy_0_0', dummyData]]));
        this.maxHeight = 45;
    }

    async loadRemainingTiles() {
        const firstTile = tileMetadata[this.currentYear][0];
        const centerPos = new THREE.Vector3(
            firstTile.easting - tileMetadata[this.currentYear][0].easting,
            0,
            firstTile.northing - tileMetadata[this.currentYear][0].northing
        );

        for (const tile of tileMetadata[this.currentYear]) {
            const key = `${tile.easting}_${tile.northing}`;
            if (key === `${firstTile.easting}_${firstTile.northing}`) continue;

            const tilePos = new THREE.Vector3(
                tile.easting - tileMetadata[this.currentYear][0].easting,
                0,
                tile.northing - tileMetadata[this.currentYear][0].northing
            );
            const distance = centerPos.distanceTo(tilePos);

            const tiles = this.tiles.get(this.currentYear);
            if (distance < CONFIG.VISIBLE_DISTANCE && !tiles.has(key) && !this.loadingTiles.has(key)) {
                this.loadingTiles.add(key);
                try {
                    const success = await this.loadTile(tile, false, this.currentYear);
                    if (success) {
                        this.createTileMesh(tiles.get(key), key);
                    } else {
                        this.createTileMesh(null, key);
                    }
                } catch (error) {
                    console.error(`Error loading ${tile.file}:`, error);
                    this.showError(`Failed to load tile ${tile.file.split('/').pop()}: ${error.message}`);
                } finally {
                    this.loadingTiles.delete(key);
                }
            }
        }
    }

    updateHeightDistribution(tileKey) {
        const datasets = [];
        let maxTileHeight = 0;

        this.availableYears.forEach((year, index) => {
            const tiles = this.tiles.get(year);
            if (!tiles.has(tileKey)) return;

            const tileData = tiles.get(tileKey);
            const heights = [];
            for (let i = 0; i < tileData.heightData.length; i++) {
                const height = tileData.heightData[i];
                if (height > 0 && height !== 65535) {
                    heights.push(height);
                }
            }

            if (heights.length === 0) return;

            const numBins = 20;
            const tileMaxHeight = tileData.maxHeight || Math.max(...heights);
            maxTileHeight = Math.max(maxTileHeight, tileMaxHeight);
            const binWidth = tileMaxHeight / numBins;
            const bins = Array(numBins).fill(0);
            const labels = Array(numBins).fill(0).map((_, i) => (i * binWidth).toFixed(1));

            heights.forEach(height => {
                const binIndex = Math.min(Math.floor(height / binWidth), numBins - 1);
                bins[binIndex]++;
            });

            const isMostRecent = year === this.availableYears[0];
            datasets.push({
                label: year,
                data: bins,
                backgroundColor: isMostRecent ? 'rgba(76, 175, 80, 0.5)' : 'rgba(210, 180, 140, 0.5)',
                borderColor: isMostRecent ? 'rgba(76, 175, 80, 1)' : 'rgba(210, 180, 140, 1)',
                borderWidth: 1
            });

            this.heightDistributionChart.data.labels = labels;
        });

        if (datasets.length === 0) {
            this.heightDistributionChart.data.labels = [];
            this.heightDistributionChart.data.datasets = [];
            this.heightDistributionChart.update();
            return;
        }

        this.heightDistributionChart.data.datasets = datasets;
        this.heightDistributionChart.update();
    }

    // ========== SCENE MANAGEMENT METHODS ========== //

    updateTerrain() {
        const tiles = this.tiles.get(this.currentYear);
        tiles.forEach((tileData, key) => {
            const tileMesh = this.terrain.getObjectByName(key);
            if (tileMesh) {
                this.terrain.remove(tileMesh);
                VisualizationUtils.disposeMesh(tileMesh);
                this.createTileMesh(tileData, key);
            }
        });
    }

    resetCamera(tile = null) {
        const targetTile = tile || tileMetadata[this.currentYear][0];
        this.camera.position.set(
            targetTile.easting - tileMetadata[this.currentYear][0].easting,
            400,
            targetTile.northing - tileMetadata[this.currentYear][0].northing + 600
        );
        this.controls.target.set(
            targetTile.easting - tileMetadata[this.currentYear][0].easting,
            0,
            targetTile.northing - tileMetadata[this.currentYear][0].northing
        );
        this.controls.update();
        const key = `${targetTile.easting}_${targetTile.northing}`;
        this.highlightTile(key);
        this.selectedTileKey = key;
        this.updateVisibleTiles();
    }

    async updateVisibleTiles() {
        const now = Date.now();
        if (now - this.lastUpdateTime < CONFIG.UPDATE_INTERVAL || this.switchingYear) return;
        this.lastUpdateTime = now;

        const cameraPos = this.camera.position;
        let loadingCount = 0;

        const tiles = this.tiles.get(this.currentYear);
        const validKeys = new Set(tileMetadata[this.currentYear].map(tile => `${tile.easting}_${tile.northing}`));

        // Prioritize the selected tile
        if (this.selectedTileKey && validKeys.has(this.selectedTileKey) && !tiles.has(this.selectedTileKey) && !this.loadingTiles.has(this.selectedTileKey)) {
            const tile = tileMetadata[this.currentYear].find(t => `${t.easting}_${t.northing}` === this.selectedTileKey);
            if (tile) {
                this.loadingTiles.add(this.selectedTileKey);
                loadingCount++;
                this.showLoading(`Loading ${this.currentYear} tile ${tile.file.split('/').pop()}...`);
                const success = await this.loadTile(tile, true, this.currentYear);
                if (success) {
                    this.createTileMesh(tiles.get(this.selectedTileKey), this.selectedTileKey);
                } else {
                    this.createTileMesh(null, this.selectedTileKey);
                }
                this.loadingTiles.delete(this.selectedTileKey);
                this.hideLoading();
            }
        }

        // Load other nearby tiles
        for (const tile of tileMetadata[this.currentYear]) {
            if (loadingCount >= 3) break;
            const key = `${tile.easting}_${tile.northing}`;
            if (!validKeys.has(key) || tiles.has(key) || this.loadingTiles.has(key)) continue;

            const tilePos = new THREE.Vector3(
                tile.easting - tileMetadata[this.currentYear][0].easting,
                0,
                tile.northing - tileMetadata[this.currentYear][0].northing
            );
            const distance = cameraPos.distanceTo(tilePos);

            if (distance < CONFIG.VISIBLE_DISTANCE) {
                this.loadingTiles.add(key);
                loadingCount++;
                const success = await this.loadTile(tile, false, this.currentYear);
                if (success) {
                    this.createTileMesh(tiles.get(key), key);
                } else {
                    this.createTileMesh(null, key);
                }
                this.loadingTiles.delete(key);
            }
        }

        tiles.forEach((tileData, key) => {
            if (!validKeys.has(key)) return;
            const tilePos = new THREE.Vector3(
                tileData.easting - tileMetadata[this.currentYear][0].easting,
                0,
                tileData.northing - tileMetadata[this.currentYear][0].northing
            );
            const distance = cameraPos.distanceTo(tilePos);

            if (distance < CONFIG.VISIBLE_DISTANCE && !this.terrain.getObjectByName(key)) {
                this.createTileMesh(tileData, key);
            } else if (distance >= CONFIG.VISIBLE_DISTANCE && this.terrain.getObjectByName(key) && key !== this.selectedTileKey) {
                const tileMesh = this.terrain.getObjectByName(key);
                this.terrain.remove(tileMesh);
                VisualizationUtils.disposeMesh(tileMesh);
            }
        });

        this.unloadFarTiles();
    }

    unloadFarTiles() {
        const cameraPos = this.camera.position;
        const unloadDistance = CONFIG.VISIBLE_DISTANCE * 2;
        const tilesToRemove = [];

        const tiles = this.tiles.get(this.currentYear);
        tiles.forEach((tileData, key) => {
            const tilePos = new THREE.Vector3(
                tileData.easting - tileMetadata[this.currentYear][0].easting,
                0,
                tileData.northing - tileMetadata[this.currentYear][0].northing
            );
            const distance = cameraPos.distanceTo(tilePos);

            if (distance >= unloadDistance && key !== this.selectedTileKey) {
                tilesToRemove.push(key);
            }
        });

        tilesToRemove.forEach(key => {
            const tileMesh = this.terrain.getObjectByName(key);
            if (tileMesh) {
                this.terrain.remove(tileMesh);
                VisualizationUtils.disposeMesh(tileMesh);
            }
            tiles.delete(key);
        });
    }

    // ========== UI METHODS ========== //

    showError(message) {
        const errorElement = document.getElementById('errorMessage');
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        setTimeout(() => errorElement.style.display = 'none', 5000);
    }

    showLoading(message) {
        const loadingElement = document.getElementById('loadingMessage');
        loadingElement.textContent = message;
        loadingElement.style.display = 'block';
    }

    hideLoading() {
        const loadingElement = document.getElementById('loadingMessage');
        loadingElement.style.display = 'none';
    }

    // ========== EVENT HANDLERS ========== //

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onMouseMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.terrain.children);

        if (intersects.length > 0) {
            const point = intersects[0].point;
            const tileMesh = intersects[0].object;

            const actualEasting = point.x + tileMetadata[this.currentYear][0].easting;
            const actualNorthing = point.z + tileMetadata[this.currentYear][0].northing;

            const [longitude, latitude] = VisualizationUtils.utmToLatLng(actualEasting, actualNorthing);

            document.getElementById('coordinates').textContent =
                `Lat: ${latitude.toFixed(7)}, Lng: ${longitude.toFixed(7)}`;
            document.getElementById('heightValue').textContent = `${point.y.toFixed(1)}m`;
            document.getElementById('tileName').textContent = tileMesh.userData.file.split('/').pop();
            document.getElementById('downloadTile').disabled = tileMesh.userData.key.includes('dummy');
        } else {
            document.getElementById('coordinates').textContent = '-';
            document.getElementById('heightValue').textContent = '-';
            document.getElementById('tileName').textContent = '-';
            document.getElementById('downloadTile').disabled = true;
        }
    }

    // ========== ANIMATION LOOP ========== //

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.updateVisibleTiles();
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const visualization = new CHMVisualization();
});
