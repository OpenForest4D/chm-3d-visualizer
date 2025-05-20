## Canopy Height Models (CHM) 3D Visualization - chm-3d-visualizer
A browser-based tool for interactive 3D visualization of canopy height model (CHM) datasets, built entirely in JavaScript. It allows users to load and explore multiple CHM GeoTIFF tiles directly in the browser—no build tools required.  

The visualization leverages Three.js to render GeoTIFF canopy height data as interactive 3D terrain. Each CHM tile is transformed into a detailed 3D mesh, with vertex elevations representing canopy heights and colors mapped along a gradient scale for intuitive interpretation. Seamless navigation between tiles is facilitated by an integrated minimap powered by Leaflet.

### Features
- Interactive 3D CHM Visualization:  
Explore a detailed, immersive and interactive 3D model of forest canopy structure.  

- Multi-tile Support:  
Seamlessly loads and visualizes multiple CHM GeoTIFF tiles

- Dynamic Height-Based Coloring:  
Instantly interpret canopy heights with intuitive color gradients.

- Interactive Minimap Navigation:
Navigate between tiles using a convenient minimap.

- In-Depth Data Analysis
View height distribution charts for any selected tiles.

- Customizable Display Options
    - Adjust height exaggeration for enhanced perspective
    - Toggle wireframe mode for structural clarity
    - Switch between smooth and flat shading
    - Minimum height filtering

### Getting Started

#### Prerequisites
No build tools required! This project uses CDN-loaded libraries for simplicity.

#### Installation

1. Clone the repository
    `git clone https://github.com/OpenForest4D/chm-3d-visualizer`

2. Copy chm-3d-visualizer folder to your web server directory.
3. Open your web browser at https://your_domain/chm-3d-visualizer

#### Using Your Own CHM Data

You can replace the sample data provided with your own:  
- Replace the GeoTIFF files in the data folder with your CHM tiles
- Update the js/tile_meta_data.js file to reflect your filenames and corresponding UTM coordinates.
- If your data uses a different UTM zone, adjust the UTM zone setting in the utmToLatLng function accordingly.

#### Data Format
The visualization expects GeoTIFF files with:

Single-band raster data representing canopy height in meters
Standard no-data values (-9999 or 65535)
UTM coordinate system (default is zone 11)

### Acknowledgments
- This tool is developed as part of the OpenForest4D project funded by NSF awards 2409885, 2409886 & 2409887.
- CHM data provided by NSF funded [National Ecological Observatory Network] (https://www.neonscience.org/data).
- three.js https://threejs.org/, geotiff.js https://github.com/geotiffjs/geotiff.js/