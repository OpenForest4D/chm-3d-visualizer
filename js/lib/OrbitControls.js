// OrbitControls implementation for Three.js
THREE.OrbitControls = function(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.target = new THREE.Vector3();
    this.enableDamping = false;
    this.dampingFactor = 0.05;
    this.enableZoom = true;
    this.zoomSpeed = 1.0;
    this.enableRotate = true;
    this.rotateSpeed = 1.0;
    this.enablePan = true;
    this.panSpeed = 1.0;
    
    // Internal properties
    this.STATE = { NONE: -1, ROTATE: 0, DOLLY: 1, PAN: 2, TOUCH_ROTATE: 3, TOUCH_DOLLY: 4, TOUCH_PAN: 5 };
    this.state = this.STATE.NONE;
    this.EPS = 0.000001;
    this.spherical = new THREE.Spherical();
    this.sphericalDelta = new THREE.Spherical();
    this.scale = 1;
    this.panOffset = new THREE.Vector3();
    this.rotateStart = new THREE.Vector2();
    this.rotateEnd = new THREE.Vector2();
    this.rotateDelta = new THREE.Vector2();
    this.panStart = new THREE.Vector2();
    this.panEnd = new THREE.Vector2();
    this.panDelta = new THREE.Vector2();
    this.dollyStart = new THREE.Vector2();
    this.dollyEnd = new THREE.Vector2();
    this.dollyDelta = new THREE.Vector2();
    
    // Bind methods
    this.handleMouseDownRotate = this.handleMouseDownRotate.bind(this);
    this.handleMouseDownDolly = this.handleMouseDownDolly.bind(this);
    this.handleMouseDownPan = this.handleMouseDownPan.bind(this);
    this.handleMouseMoveRotate = this.handleMouseMoveRotate.bind(this);
    this.handleMouseMoveDolly = this.handleMouseMoveDolly.bind(this);
    this.handleMouseMovePan = this.handleMouseMovePan.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleMouseWheel = this.handleMouseWheel.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseWheel = this.onMouseWheel.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
    
    // Add event listeners
    this.domElement.addEventListener('contextmenu', this.onContextMenu, false);
    this.domElement.addEventListener('mousedown', this.onMouseDown, false);
    this.domElement.addEventListener('wheel', this.onMouseWheel, false);
    
    this.update();
};

THREE.OrbitControls.prototype = {
    constructor: THREE.OrbitControls,
    
    getPolarAngle: function() {
        return this.spherical.phi;
    },
    
    getAzimuthalAngle: function() {
        return this.spherical.theta;
    },
    
    update: function() {
        const position = this.camera.position;
        const offset = new THREE.Vector3();
        
        // Get current camera position vector from target
        offset.copy(position).sub(this.target);
        
        // Convert to spherical coordinates
        this.spherical.setFromVector3(offset);
        
        // Apply rotation changes
        this.spherical.theta += this.sphericalDelta.theta;
        this.spherical.phi += this.sphericalDelta.phi;
        
        // Restrict phi to be between MIN and MAX
        this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi));
        this.spherical.makeSafe();
        
        // Apply scale change
        this.spherical.radius *= this.scale;
        
        // Enforce min and max distance
        this.spherical.radius = Math.max(1, Math.min(2000, this.spherical.radius));
        
        // Apply pan offset
        this.target.add(this.panOffset);
        
        // Convert back to Cartesian
        offset.setFromSpherical(this.spherical);
        
        // Update camera position
        position.copy(this.target).add(offset);
        this.camera.lookAt(this.target);
        
        // Reset changes
        this.sphericalDelta.set(0, 0, 0);
        this.panOffset.set(0, 0, 0);
        this.scale = 1;
        
        return true;
    },
    
    // Event handlers
    handleMouseDownRotate: function(event) {
        this.rotateStart.set(event.clientX, event.clientY);
    },
    
    handleMouseDownDolly: function(event) {
        this.dollyStart.set(event.clientX, event.clientY);
    },
    
    handleMouseDownPan: function(event) {
        this.panStart.set(event.clientX, event.clientY);
    },
    
    handleMouseMoveRotate: function(event) {
        this.rotateEnd.set(event.clientX, event.clientY);
        this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart).multiplyScalar(this.rotateSpeed);
        
        const element = this.domElement;
        this.sphericalDelta.theta -= 2 * Math.PI * this.rotateDelta.x / element.clientHeight;
        this.sphericalDelta.phi -= 2 * Math.PI * this.rotateDelta.y / element.clientHeight;
        
        this.rotateStart.copy(this.rotateEnd);
        this.update();
    },
    
    handleMouseMoveDolly: function(event) {
        this.dollyEnd.set(event.clientX, event.clientY);
        this.dollyDelta.subVectors(this.dollyEnd, this.dollyStart);
        
        if (this.dollyDelta.y > 0) {
            this.scale /= 1.1;
        } else if (this.dollyDelta.y < 0) {
            this.scale *= 1.1;
        }
        
        this.dollyStart.copy(this.dollyEnd);
        this.update();
    },
    
    handleMouseMovePan: function(event) {
        this.panEnd.set(event.clientX, event.clientY);
        this.panDelta.subVectors(this.panEnd, this.panStart).multiplyScalar(this.panSpeed);
        
        const element = this.domElement;
        this.panOffset.x -= 2 * this.panDelta.x * this.spherical.radius / element.clientHeight;
        this.panOffset.z -= 2 * this.panDelta.y * this.spherical.radius / element.clientHeight;
        
        this.panStart.copy(this.panEnd);
        this.update();
    },
    
    handleMouseUp: function() {
        // Nothing to do here
    },
    
    handleMouseWheel: function(event) {
        if (event.deltaY < 0) {
            this.scale /= 1.1;
        } else {
            this.scale *= 1.1;
        }
        
        this.update();
    },
    
    onMouseDown: function(event) {
        if (event.button === 0) { // Left mouse button
            this.state = this.STATE.ROTATE;
            this.handleMouseDownRotate(event);
        } else if (event.button === 1) { // Middle mouse button
            this.state = this.STATE.DOLLY;
            this.handleMouseDownDolly(event);
        } else if (event.button === 2) { // Right mouse button
            this.state = this.STATE.PAN;
            this.handleMouseDownPan(event);
        }
        
        document.addEventListener('mousemove', this.onMouseMove, false);
        document.addEventListener('mouseup', this.onMouseUp, false);
    },
    
    onMouseMove: function(event) {
        if (this.state === this.STATE.ROTATE) {
            this.handleMouseMoveRotate(event);
        } else if (this.state === this.STATE.DOLLY) {
            this.handleMouseMoveDolly(event);
        } else if (this.state === this.STATE.PAN) {
            this.handleMouseMovePan(event);
        }
    },
    
    onMouseUp: function() {
        document.removeEventListener('mousemove', this.onMouseMove, false);
        document.removeEventListener('mouseup', this.onMouseUp, false);
        this.state = this.STATE.NONE;
    },
    
    onMouseWheel: function(event) {
        event.preventDefault();
        event.stopPropagation();
        this.handleMouseWheel(event);
    },
    
    onContextMenu: function(event) {
        event.preventDefault();
    }
};
