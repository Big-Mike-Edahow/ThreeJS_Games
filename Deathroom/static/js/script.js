// script.js

import * as THREE from 'three'
import Stats from 'three/addons/libs/stats.module.js';

// Get DOM elements
const messageEl = document.getElementById('message');
const startButton = document.getElementById('startButton');
const healthBar = document.getElementById('healthBar');
const healthFill = document.getElementById('healthFill');
const bossHealthBar = document.getElementById('bossHealthBar');
const bossHealthFill = document.getElementById('bossHealthFill');
const bossHealthText = document.getElementById('bossHealthText');
const bossNameElement = document.getElementById('bossName');
const crosshair = document.getElementById('crosshair');
const controls = document.getElementById('controls');
const statsPanel = document.getElementById('statsPanel');
const strengthStat = document.getElementById('strengthStat');
const speedStat = document.getElementById('speedStat');
const roomStat = document.getElementById('roomStat');
const weaponDisplay = document.getElementById('weaponDisplay');
const currentWeapon = document.getElementById('currentWeapon');
const pickupMessage = document.getElementById('pickupMessage');
const damageOverlay = document.getElementById('damageOverlay');

// Mobile device detection
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.matchMedia && window.matchMedia("(max-width: 768px)").matches);

// Mobile controls elements (will be initialized later)
let mobileControls, joystickContainer, joystick, attackButton, lookControls;

// Game variables
let scene, camera, renderer, clock;
let player, enemy;
let isRunning = false;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let currentRoomIndex = 0;
let rooms = [];
let stats; // Performance stats
let animatedObjects = []; // Global array to track all animated objects
let maxLights = isMobile ? 5 : 10; // Reduce maximum lights on mobile
let lightCount = 0; // Current light count
let maxProjectiles = isMobile ? 10 : 20; // Reduce maximum projectiles on mobile

// Additional optimization settings for mobile
const particleMultiplier = isMobile ? 0.5 : 1.0; // Use fewer particles on mobile

// Project array
const projectiles = [];

// Create reusable geometry and materials for projectiles
const projectileGeometries = {
    small: new THREE.SphereGeometry(0.1, 4, 4),
    medium: new THREE.SphereGeometry(0.2, 4, 4)
};

const projectileMaterials = {
    player: new THREE.MeshBasicMaterial({ color: 0xff0000 }),
    enemy: new THREE.MeshBasicMaterial({ color: 0xff3300 })
};

const projectilePool = {
    available: [],
    active: [],

    getProjectile: function (isEnemy = false) {
        // Return from pool if available
        if (this.available.length > 0) {
            const projectile = this.available.pop();
            projectile.visible = true;
            // Reset any properties
            projectile.material = isEnemy ? projectileMaterials.enemy : projectileMaterials.player;
            this.active.push(projectile);
            return projectile;
        }

        // Create new projectile if below max
        if (this.active.length < maxProjectiles) {
            // Create with reused geometry and material
            const geometry = isEnemy ? projectileGeometries.medium : projectileGeometries.small;
            const material = isEnemy ? projectileMaterials.enemy : projectileMaterials.player;

            const projectile = new THREE.Mesh(geometry, material);

            // Only add light if we haven't reached maximum
            if (lightCount < maxLights) {
                const light = new THREE.PointLight(
                    isEnemy ? 0xff3300 : 0xff0000,
                    0.4,
                    2
                );
                projectile.add(light);
                lightCount++;
            }

            this.active.push(projectile);
            return projectile;
        }

        // If at max, reuse oldest
        const oldest = this.active.shift();
        oldest.visible = true;
        // Reset any properties
        oldest.material = isEnemy ? projectileMaterials.enemy : projectileMaterials.player;
        this.active.push(oldest);
        return oldest;
    },

    releaseProjectile: function (projectile) {
        // Remove from active array
        const index = this.active.indexOf(projectile);
        if (index !== -1) {
            this.active.splice(index, 1);
        }

        // Hide but don't remove from scene
        projectile.visible = false;

        // Add to available pool
        this.available.push(projectile);
    }
};

// Initialize game
function init() {
    // Prevent multiple initializations
    if (scene && renderer && isRunning) {
        console.log("Game already initialized, skipping");
        return;
    }

    try {
        messageEl.textContent = "Initializing...";

        console.log("Initialization started...");

        // Get mobile controls elements
        mobileControls = document.getElementById('mobileControls');
        joystickContainer = document.getElementById('joystickContainer');
        joystick = document.getElementById('joystick');
        attackButton = document.getElementById('attackButton');
        lookControls = document.getElementById('lookControls');

        // Set game to running state
        isRunning = true;

        // Initialize stats
        stats = new Stats();
        stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
        document.body.appendChild(stats.dom);
        stats.dom.style.position = 'absolute';
        stats.dom.style.top = '0px';
        stats.dom.style.left = '0px';
        stats.dom.style.zIndex = '10';

        if (isMobile) {
            // Modify stats display for mobile
            stats.dom.style.width = '50px';
            stats.dom.style.height = '24px';
            stats.dom.classList.add('stats');
        }
        console.log("Stats initialized");

        // Create scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x111111);
        console.log("Scene created");

        // Create camera
        console.log("Creating camera");
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 1.7, 0); // Player height
        camera.rotation.order = 'YXZ'; // Important for first-person controls to prevent gimbal lock
        console.log("Camera created with YXZ rotation order");

        // Create renderer with optimized settings
        renderer = new THREE.WebGLRenderer({
            antialias: isMobile ? false : true, // Disable antialiasing on mobile for better performance
            powerPreference: 'high-performance'
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        // Set pixel ratio with a reasonable cap
        renderer.setPixelRatio(isMobile ? 1 : Math.min(window.devicePixelRatio, 2));

        // Enable shadows with proper configuration
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = isMobile ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap; // Simpler shadows on mobile

        // Set physical correct lighting for better realism
        renderer.physicallyCorrectLights = true;

        // Set proper gamma correction
        renderer.outputEncoding = THREE.sRGBEncoding;

        document.body.appendChild(renderer.domElement);
        console.log("Renderer created and added to DOM with shadows enabled");

        // Create clock for timing
        clock = new THREE.Clock();

        // Create first room
        console.log("Creating first room (fire theme)");
        createRoom('fire', 1);

        // Initialize the player and boss with setupGame()
        console.log("Setting up game");

        // Setup controls
        console.log("Setting up controls");
        setupControls();

        // Handle window resize
        window.addEventListener('resize', onWindowResize);

        // Show UI
        console.log("Displaying UI elements");
        healthBar.style.display = 'block';
        crosshair.style.display = 'block';
        controls.style.display = 'block';
        statsPanel.style.display = 'block';
        weaponDisplay.style.display = 'block';

        // Update control instructions based on device
        if (isMobile) {
            controls.innerHTML = "Virtual joystick: Move | Touch screen: Look | Red button: Attack";
            console.log("Mobile device detected, showing mobile controls");
            mobileControls.style.display = 'block';
        } else {
            controls.innerHTML = "WASD: Move | Mouse: Look | Click: Swing";
            console.log("Desktop device detected, using keyboard/mouse controls");
        }

        // Hide message after a few seconds
        setTimeout(() => {
            messageEl.style.opacity = '0';
            setTimeout(() => messageEl.style.display = 'none', 1000);
        }, 3000);

        messageEl.textContent = "Game running! Look around with your mouse.";
        console.log("Initialization complete");

        // Clean up any existing animation frame
        if (window.animationFrameId) {
            cancelAnimationFrame(window.animationFrameId);
            window.animationFrameId = null;
        }

        // Start game loop
        isRunning = true;

        // Initialize audio and game setup
        initAudio();
        setupGame();

        // Use performance timing for the animation loop
        let lastFrameTime = 0;
        const targetFrameRate = isMobile ? 30 : 60; // Lower target FPS on mobile
        const frameInterval = 1000 / targetFrameRate;

        function animateWithFrameLimit(currentTime) {
            if (!isRunning) return;

            window.animationFrameId = requestAnimationFrame(animateWithFrameLimit);

            // Begin stats measurement
            stats.begin();

            // Calculate elapsed time since last frame
            const elapsed = currentTime - lastFrameTime;

            // Only update if enough time has passed
            if (elapsed > frameInterval) {
                // Adjust time to maintain consistent timing
                lastFrameTime = currentTime - (elapsed % frameInterval);
                animate();
            }

            // End stats measurement
            stats.end();
        }

        // Start the animation loop with frame limiting
        window.animationFrameId = requestAnimationFrame(animateWithFrameLimit);
    }
    catch (error) {
        messageEl.textContent = "Error during initialization: " + error.message;
        console.error("Initialization error:", error);
        // Show error details in console
        console.error(error.stack);
    }
}

// Function to create procedural textures
function createProceduralTexture(baseColor, type) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base color fill
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 512, 512);

    if (type === 'normal') {
        // Create bumpy normal map
        ctx.fillStyle = '#8080ff'; // Neutral normal map color
        ctx.fillRect(0, 0, 512, 512);

        // Add random bumps for normal map
        for (let i = 0; i < 100; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const radius = 5 + Math.random() * 20;

            const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, '#aaaaff'); // Raised bump
            gradient.addColorStop(1, '#8080ff'); // Back to neutral

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (type === 'roughness') {
        // Create roughness map with variations
        ctx.fillStyle = '#888888'; // Medium roughness
        ctx.fillRect(0, 0, 512, 512);

        // Add random roughness variations
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const radius = 10 + Math.random() * 30;

            const value = Math.random() * 80 + 50; // Random gray value
            ctx.fillStyle = `rgb(${value},${value},${value})`;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4); // Repeat to avoid obvious tiling
    return texture;
}

// Create a room with the specified theme
function createRoom(theme = 'fire', roomIndex = 1) {
    // Clear any existing room
    if (rooms[currentRoomIndex]) {
        // Remove existing room objects
        for (let obj of rooms[currentRoomIndex].objects) {
            scene.remove(obj);
        }
    }

    // Create a new room container
    const roomContainer = new THREE.Group();
    scene.add(roomContainer);

    // Create the room object
    const room = {
        theme: theme,
        index: roomIndex,
        doorOpen: false,
        objects: [],
        pickups: [],
        container: roomContainer,

        // Method to add object to tracking
        addObject: function (object) {
            this.objects.push(object);
            roomContainer.add(object);
            return object;
        }
    };

    // Set ambient lighting based on room theme
    let ambientColor;
    let ambientIntensity = 0.15; // Decreased base ambient light intensity from 0.4 to 0.15

    switch (theme) {
        case 'fire':
            ambientColor = 0xcc4400; // Warm orange ambient for fire theme
            break;
        case 'ice':
            ambientColor = 0x88aaff; // Cool blue ambient for ice theme
            break;
        case 'poison':
            ambientColor = 0x88aa44; // Sickly green ambient for poison theme
            break;
        case 'undead':
            ambientColor = 0x335544; // Eerie dark green for undead theme
            ambientIntensity = 0.1; // Even darker ambient for spooky effect (was 0.3)
            break;
        case 'mechanical':
            ambientColor = 0xaa8855; // Warm gold/bronze ambient for mechanical theme
            ambientIntensity = 0.2; // Reduced from 0.5, still slightly brighter than other themes
            break;
        default:
            ambientColor = 0x666666; // Neutral gray ambient by default
    }

    // Remove any existing ambient light
    scene.children.forEach(child => {
        if (child.isAmbientLight) {
            scene.remove(child);
        }
    });

    // Add new ambient light
    const ambientLight = new THREE.AmbientLight(ambientColor, ambientIntensity);
    scene.add(ambientLight);

    // Add main directional light that casts shadows
    // Removing this directional light (sky light) and replacing it with more room-appropriate lighting
    // This is the light that was making it feel like there's light from the sky

    // Room dimensions
    const roomSize = 20;
    const wallHeight = 5;

    // Create floor with improved PBR material
    const floorGeometry = new THREE.PlaneGeometry(roomSize, roomSize, 10, 10); // Add segments for better normal detail

    // Create PBR materials based on theme - simplified for troubleshooting
    let floorMaterial;

    // Define common textures procedurally
    const textureSize = 512;
    const normalStrength = 0.5;

    switch (theme) {
        case 'fire':
            floorMaterial = new THREE.MeshStandardMaterial({
                color: 0x551111,
                roughness: 0.7,
                metalness: 0.2
            });
            break;
        case 'ice':
            floorMaterial = new THREE.MeshStandardMaterial({
                color: 0x88aacc,
                roughness: 0.1,
                metalness: 0.3
            });
            break;
        case 'poison':
            floorMaterial = new THREE.MeshStandardMaterial({
                color: 0x336633,
                roughness: 0.8,
                metalness: 0.1
            });
            break;
        case 'undead':
            floorMaterial = new THREE.MeshStandardMaterial({
                color: 0x335544,
                roughness: 0.9,
                metalness: 0.0
            });
            break;
        case 'mechanical':
            floorMaterial = new THREE.MeshStandardMaterial({
                color: 0x887755,
                roughness: 0.5,
                metalness: 0.8
            });
            break;
        default:
            floorMaterial = new THREE.MeshStandardMaterial({
                color: 0x666666,
                roughness: 0.5,
                metalness: 0.2
            });
    }

    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    floor.receiveShadow = true; // Floor receives shadows
    room.addObject(floor);

    // Create walls with improved PBR materials
    const wallGeometry = new THREE.PlaneGeometry(roomSize, wallHeight, 10, 10);

    // Create wall material based on theme - simplified for troubleshooting
    let wallMaterial;
    switch (theme) {
        case 'fire':
            wallMaterial = new THREE.MeshStandardMaterial({
                color: 0x882222,
                roughness: 0.6,
                metalness: 0.1
            });
            break;
        case 'ice':
            wallMaterial = new THREE.MeshStandardMaterial({
                color: 0x6688aa,
                roughness: 0.2,
                metalness: 0.3
            });
            break;
        case 'poison':
            wallMaterial = new THREE.MeshStandardMaterial({
                color: 0x446633,
                roughness: 0.8,
                metalness: 0.1
            });
            break;
        case 'undead':
            wallMaterial = new THREE.MeshStandardMaterial({
                color: 0x445544,
                roughness: 0.6,
                metalness: 0.1
            });
            break;
        case 'mechanical':
            wallMaterial = new THREE.MeshStandardMaterial({
                color: 0x887755,
                roughness: 0.4,
                metalness: 0.7
            });
            break;
        default:
            wallMaterial = new THREE.MeshStandardMaterial({
                color: 0x555555,
                roughness: 0.5,
                metalness: 0.1
            });
    }

    // North wall
    const northWallGeometry = new THREE.PlaneGeometry(roomSize, wallHeight, 10, 10);
    const northWall = new THREE.Mesh(northWallGeometry, wallMaterial);
    northWall.position.z = -10;
    northWall.position.y = 2.5;
    northWall.castShadow = true;
    northWall.receiveShadow = true;
    room.addObject(northWall);

    // South wall
    const southWall = northWall.clone();
    southWall.position.z = 10;
    southWall.rotation.y = Math.PI;
    southWall.castShadow = true;
    southWall.receiveShadow = true;
    room.addObject(southWall);

    // East wall
    const eastWallGeometry = new THREE.PlaneGeometry(roomSize, wallHeight, 10, 10);
    const eastWall = new THREE.Mesh(eastWallGeometry, wallMaterial);
    eastWall.position.x = 10;
    eastWall.position.y = 2.5;
    eastWall.rotation.y = -Math.PI / 2;
    eastWall.castShadow = true;
    eastWall.receiveShadow = true;
    room.addObject(eastWall);

    // West wall
    const westWall = eastWall.clone();
    westWall.position.x = -10;
    westWall.rotation.y = Math.PI / 2;
    westWall.castShadow = true;
    westWall.receiveShadow = true;
    room.addObject(westWall);

    // Add lighting
    const mainLight = new THREE.PointLight(
        theme === 'fire' ? 0xff6622 :
            theme === 'ice' ? 0x88ccff :
                theme === 'poison' ? 0xaaff66 :
                    theme === 'undead' ? 0x44ff55 :
                        theme === 'mechanical' ? 0xffcc77 : 0xffffff,
        1.5,  // Increased brightness
        15   // Reduced range from 20 to 15
    );
    // Lower the light to feel more like a room light fixture
    mainLight.position.set(0, 3.5, 0);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 512;
    mainLight.shadow.mapSize.height = 512;
    mainLight.shadow.camera.near = 0.1;
    mainLight.shadow.camera.far = 25;
    room.addObject(mainLight);

    // Corner lights have been replaced with wall sconces for better room atmosphere

    // Create torch-like wall sconces around the room
    if (lightCount < maxLights - 8) { // Only if we have enough light quota
        // Wall sconces parameters
        const sconceIntensity = 0.7; // Brighter than previous corner lights
        const sconceRadius = 8;

        // Add wall sconces at better positions - 2 on each wall
        const wallSconces = [
            // North wall sconces
            { x: -5, y: 2.5, z: -9.5, rotation: 0 },
            { x: 5, y: 2.5, z: -9.5, rotation: 0 },
            // South wall sconces
            { x: -5, y: 2.5, z: 9.5, rotation: Math.PI },
            { x: 5, y: 2.5, z: 9.5, rotation: Math.PI },
            // East wall sconces
            { x: 9.5, y: 2.5, z: -5, rotation: -Math.PI / 2 },
            { x: 9.5, y: 2.5, z: 5, rotation: -Math.PI / 2 },
            // West wall sconces
            { x: -9.5, y: 2.5, z: -5, rotation: Math.PI / 2 },
            { x: -9.5, y: 2.5, z: 5, rotation: Math.PI / 2 }
        ];

        for (const sconce of wallSconces) {
            // Create sconce holder
            const sconceHolder = new THREE.Group();
            sconceHolder.position.set(sconce.x, sconce.y, sconce.z);
            sconceHolder.rotation.y = sconce.rotation;

            // Create physical sconce mount - a small box attached to the wall
            const mountGeometry = new THREE.BoxGeometry(0.3, 0.5, 0.2);
            const mountMaterial = new THREE.MeshStandardMaterial({
                color: theme === 'fire' ? 0x553322 :
                    theme === 'ice' ? 0x335566 :
                        theme === 'poison' ? 0x445533 :
                            theme === 'undead' ? 0x223322 :
                                theme === 'mechanical' ? 0x554433 : 0x444444,
                roughness: 0.8,
                metalness: 0.2
            });
            const mount = new THREE.Mesh(mountGeometry, mountMaterial);
            mount.position.z = 0.2; // Offset from wall
            mount.castShadow = true;
            sconceHolder.add(mount);

            // Add light to the sconce
            const sconceLight = new THREE.PointLight(
                theme === 'fire' ? 0xff8844 :
                    theme === 'ice' ? 0xaaddff :
                        theme === 'poison' ? 0xccff88 :
                            theme === 'undead' ? 0x66ff77 :
                                theme === 'mechanical' ? 0xffd288 : 0xffffcc,
                sconceIntensity,
                sconceRadius
            );
            sconceLight.position.z = 0.5; // Position light in front of the mount

            // Add shadow capability to some sconces but not all for performance
            if ((sconce.x === -5 && sconce.z === -9.5) ||
                (sconce.x === 5 && sconce.z === 9.5)) {
                sconceLight.castShadow = true;
                sconceLight.shadow.mapSize.width = 512;
                sconceLight.shadow.mapSize.height = 512;
                sconceLight.shadow.camera.near = 0.5;
                sconceLight.shadow.camera.far = 10;
            }

            sconceHolder.add(sconceLight);

            // Add to room
            room.addObject(sconceHolder);
            lightCount++;
        }
    }

    // Add some theme-specific decorations
    addRoomDecorations(room, theme);

    // Store the room and update UI
    rooms[roomIndex - 1] = room;
    roomStat.textContent = roomIndex;

    return room;
}

// Add decorations to the room based on the theme
function addRoomDecorations(room, theme) {
    switch (theme) {
        case 'fire':
            // Add fire pits
            addFireDecoration(room, -5, -5);
            addFireDecoration(room, 5, -5);
            addFireDecoration(room, 5, 5);
            addFireDecoration(room, -5, 5);
            break;

        case 'ice':
            // Add ice crystals
            addIceDecoration(room, -6, -6);
            addIceDecoration(room, 6, -6);
            addIceDecoration(room, 6, 6);
            addIceDecoration(room, -6, 6);
            break;

        case 'poison':
            // Add poison clouds
            addPoisonDecoration(room, -7, -7);
            addPoisonDecoration(room, 7, -7);
            addPoisonDecoration(room, 7, 7);
            addPoisonDecoration(room, -7, 7);
            break;

        case 'undead':
            // Add undead decorations
            addUndeadDecoration(room, -7, -7);
            addUndeadDecoration(room, 7, -7);
            addUndeadDecoration(room, 7, 7);
            addUndeadDecoration(room, -7, 7);
            break;

        case 'mechanical':
            // Add mechanical elements
            addMechanicalDecoration(room, -7, -7);
            addMechanicalDecoration(room, 7, -7);
            addMechanicalDecoration(room, 7, 7);
            addMechanicalDecoration(room, -7, 7);
            break;
    }
}

// Add fire decoration (fire pit)
function addFireDecoration(room, x, z) {
    // Fire group
    const fireGroup = new THREE.Group();

    // Create base with enhanced PBR material
    const baseGeometry = new THREE.CylinderGeometry(1, 1.2, 0.5, 12);
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: 0x442222,
        roughness: 0.8,
        metalness: 0.2
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.25;
    base.castShadow = true;
    base.receiveShadow = true;
    fireGroup.add(base);

    // Add embers/rocks in the fire pit
    const emberCount = 8;
    for (let i = 0; i < emberCount; i++) {
        const emberGeo = new THREE.SphereGeometry(0.15 + Math.random() * 0.1, 4, 4);
        const emberMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0.6 + Math.random() * 0.4, 0.2 + Math.random() * 0.2, 0),
            emissive: new THREE.Color(0.5 + Math.random() * 0.5, 0.2, 0),
            emissiveIntensity: 0.5 + Math.random() * 0.5,
            roughness: 0.7,
            metalness: 0
        });

        const ember = new THREE.Mesh(emberGeo, emberMat);

        // Position within pit
        const radius = Math.random() * 0.7;
        const angle = Math.random() * Math.PI * 2;
        ember.position.x = radius * Math.cos(angle);
        ember.position.z = radius * Math.sin(angle);
        ember.position.y = 0.3 + Math.random() * 0.2;

        // Store animation parameters for glowing effect
        ember.userData.baseY = ember.position.y;
        ember.userData.speed = 0.5 + Math.random() * 1;
        ember.userData.offset = Math.random() * Math.PI * 2;
        ember.userData.animationType = 'ember';

        fireGroup.add(ember);
        animatedObjects.push(ember);
    }

    // Fire effect (particle system simulation) - improved quality
    const particleCount = 12; // Keep particle count reasonable for performance

    for (let i = 0; i < particleCount; i++) {
        // Create a flame particle with better geometry
        const flameGeometry = i % 2 === 0 ?
            new THREE.ConeGeometry(0.2 + Math.random() * 0.15, 0.8, 4) :
            new THREE.SphereGeometry(0.2 + Math.random() * 0.1, 4, 4);

        // Create basic material for fire
        const flameMaterial = new THREE.MeshBasicMaterial({
            color: i % 3 === 0 ? 0xff9500 : (i % 3 === 1 ? 0xff3300 : 0xffff00),
            transparent: true,
            opacity: 0.7 + Math.random() * 0.3
        });

        const flame = new THREE.Mesh(flameGeometry, flameMaterial);

        // Random position around the base
        const radius = Math.random() * 0.6;
        const angle = Math.random() * Math.PI * 2;
        flame.position.x = radius * Math.cos(angle);
        flame.position.z = radius * Math.sin(angle);
        flame.position.y = 0.5 + Math.random() * 0.5;

        // Store animation parameters
        flame.userData.baseY = flame.position.y;
        flame.userData.speed = 1 + Math.random() * 2;
        flame.userData.offset = Math.random() * Math.PI * 2;
        flame.userData.animationType = 'fire';
        flame.userData.rotationSpeed = (Math.random() - 0.5) * 0.05;

        fireGroup.add(flame);
        animatedObjects.push(flame);
    }

    // Only add light if we haven't reached the maximum
    if (lightCount < maxLights) {
        const fireLight = new THREE.PointLight(0xff6622, 1.5, 8);
        fireLight.position.y = 1;
        fireLight.castShadow = true;
        fireLight.shadow.mapSize.width = 512;
        fireLight.shadow.mapSize.height = 512;
        fireLight.shadow.camera.near = 0.1;
        fireLight.shadow.camera.far = 10;
        fireGroup.add(fireLight);
        lightCount++;

        // Add to animation tracking for fire flickering
        fireLight.userData.offset = Math.random() * Math.PI * 2;
        fireLight.userData.animationType = 'fireLight';
        animatedObjects.push(fireLight);
    }

    // Position fire group
    fireGroup.position.set(x, 0, z);
    room.addObject(fireGroup);

    return fireGroup;
}

// Add ice decoration (ice crystal formation)
function addIceDecoration(room, x, z) {
    // Crystal group
    const crystalGroup = new THREE.Group();

    // Create base
    const baseGeometry = new THREE.CylinderGeometry(1, 1.2, 0.3, 8);
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: 0x88aacc,
        roughness: 0.2,
        metalness: 0.8
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.15;
    crystalGroup.add(base);

    // Create several crystals
    for (let i = 0; i < 5; i++) {
        // Create crystal with simpler geometry
        const height = 1 + Math.random();
        const crystal = createCrystal(0.3 + Math.random() * 0.2, height);

        // Random position within formation
        const radius = 0.4 + Math.random() * 0.3;
        const angle = (i / 5) * Math.PI * 2 + (Math.random() * 0.3);
        crystal.position.x = radius * Math.cos(angle);
        crystal.position.z = radius * Math.sin(angle);
        crystal.position.y = height / 2;

        // Random rotation
        crystal.rotation.y = Math.random() * Math.PI;
        crystal.rotation.x = (Math.random() - 0.5) * 0.2;
        crystal.rotation.z = (Math.random() - 0.5) * 0.2;

        // Store animation parameters
        crystal.userData.baseY = crystal.position.y;
        crystal.userData.speed = 0.5 + Math.random() * 0.5;
        crystal.userData.offset = Math.random() * Math.PI * 2;
        crystal.userData.animationType = 'ice';

        crystalGroup.add(crystal);
        animatedObjects.push(crystal);
    }

    // Only add light if we haven't reached maximum
    if (lightCount < maxLights) {
        const crystalLight = new THREE.PointLight(0xaaddff, 0.5, 4);
        crystalLight.position.y = 1;
        crystalGroup.add(crystalLight);
        lightCount++;

        // Add animation for ice light
        crystalLight.userData.offset = Math.random() * Math.PI * 2;
        crystalLight.userData.animationType = 'iceLight';
        animatedObjects.push(crystalLight);
    }

    // Position crystal group
    crystalGroup.position.set(x, 0, z);
    room.addObject(crystalGroup);

    return crystalGroup;
}

// Create a crystal mesh
function createCrystal(radius, height) {
    // Simpler geometry for better performance
    const geometry = new THREE.ConeGeometry(radius, height, 5);

    // Semi-transparent blue material
    const material = new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.7,
        roughness: 0.2,
        metalness: 0.9
    });

    return new THREE.Mesh(geometry, material);
}

// Add poison decoration (poison cloud)
function addPoisonDecoration(room, x, z) {
    // Poison cloud group
    const cloudGroup = new THREE.Group();

    // Create base
    const baseGeometry = new THREE.CylinderGeometry(1, 1.2, 0.3, 8);
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: 0x553355,
        roughness: 0.7,
        metalness: 0.2
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.15;
    cloudGroup.add(base);

    // Create several clouds - reduced count
    for (let i = 0; i < 3; i++) {
        const cloudGeo = new THREE.SphereGeometry(0.5 + Math.random() * 0.5, 4, 4);
        const cloudMat = new THREE.MeshBasicMaterial({
            color: 0x77cc55,
            transparent: true,
            opacity: 0.7
        });
        const cloud = new THREE.Mesh(cloudGeo, cloudMat);

        // Random position within cloud
        const radius = Math.random() * 0.7;
        const angle = Math.random() * Math.PI * 2;
        cloud.position.x = radius * Math.cos(angle);
        cloud.position.z = radius * Math.sin(angle);
        cloud.position.y = 0.5 + Math.random() * 0.5;

        // Store animation parameters
        cloud.userData.baseY = cloud.position.y;
        cloud.userData.speed = 0.5 + Math.random() * 0.5;
        cloud.userData.offset = Math.random() * Math.PI * 2;
        cloud.userData.animationType = 'poison';

        cloudGroup.add(cloud);
        animatedObjects.push(cloud);
    }

    // Only add light if we haven't reached the maximum
    if (lightCount < maxLights) {
        // Add poison light with reduced intensity
        const poisonLight = new THREE.PointLight(0x88ff88, 0.4, 5);
        poisonLight.position.y = 1;
        cloudGroup.add(poisonLight);
        lightCount++;

        // Add light animation
        poisonLight.userData.offset = Math.random() * Math.PI * 2;
        poisonLight.userData.animationType = 'poisonLight';
        animatedObjects.push(poisonLight);
    }

    // Position cloud group
    cloudGroup.position.set(x, 0, z);
    room.addObject(cloudGroup);

    return cloudGroup;
}

// Spawn a door to the next level
let exitDoor = null;
function spawnNextLevelDoor() {
    // Create door
    const doorGroup = new THREE.Group();

    // Play door sound
    playSound('doorOpen');

    // Door frame - reduced segments
    const frameGeo = new THREE.BoxGeometry(3, 4, 0.5);
    // Use MeshBasicMaterial with emissive color rather than MeshStandardMaterial
    const frameMat = new THREE.MeshBasicMaterial({
        color: 0x8866aa
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.y = 2;
    doorGroup.add(frame);

    // Door opening (inner part)
    const openingGeo = new THREE.PlaneGeometry(2, 3);
    const openingMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.7
    });
    const opening = new THREE.Mesh(openingGeo, openingMat);
    opening.position.z = 0.3;
    opening.position.y = 1.5;
    doorGroup.add(opening);

    // Portal effect - reduced particles
    const portalGroup = new THREE.Group();
    // Reduced from 20 to 10 particles
    for (let i = 0; i < 10; i++) {
        const particleGeo = new THREE.SphereGeometry(0.05 + Math.random() * 0.05, 4, 4);
        const particleMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(
                0.5 + Math.random() * 0.5,
                0.2 + Math.random() * 0.5,
                0.5 + Math.random() * 0.5
            ),
            transparent: true,
            opacity: 0.7
        });
        const particle = new THREE.Mesh(particleGeo, particleMat);

        // Random position in portal
        particle.position.x = (Math.random() - 0.5) * 1.5;
        particle.position.y = Math.random() * 2;
        particle.position.z = 0.25;

        // Store animation parameters
        particle.userData.basePos = particle.position.clone();
        particle.userData.speed = 0.5 + Math.random() * 1;
        particle.userData.offset = Math.random() * Math.PI * 2;
        particle.userData.animationType = 'portal';

        portalGroup.add(particle);
        animatedObjects.push(particle); // Add to global animation tracking
    }

    // Add portal light if we haven't reached max
    if (lightCount < maxLights) {
        const portalLight = new THREE.PointLight(0xaa55ff, 0.8, 5);
        portalLight.position.z = 0.5;
        portalLight.position.y = 1.5;
        portalLight.userData.animationType = 'portalLight';

        portalGroup.add(portalLight);
        animatedObjects.push(portalLight); // Add to global animation tracking
        lightCount++;
    }

    doorGroup.add(portalGroup);

    // Position door at north wall
    doorGroup.position.set(0, 0, -9.5);
    doorGroup.rotation.y = Math.PI;
    scene.add(doorGroup);

    // Store in room objects
    if (rooms[currentRoomIndex]) {
        rooms[currentRoomIndex].objects.push(doorGroup);
    }

    // Store door reference
    exitDoor = doorGroup;

    // Show door message
    player.showPickupMessage("A portal to the next level has appeared!");

    return doorGroup;
}

// Check if player is near the exit door
function checkDoorCollision() {
    if (!exitDoor) return;

    const doorPos = new THREE.Vector3();
    exitDoor.getWorldPosition(doorPos);

    const distance = player.position.distanceTo(doorPos);

    if (distance < 2) {
        goToNextLevel();
    }
}

// Transition to next level - improved cleanup
function goToNextLevel() {
    // Increment room
    currentRoomIndex++;
    updateLevelDisplay();

    // Reset room array at the new index
    if (!rooms[currentRoomIndex]) {
        rooms[currentRoomIndex] = { objects: [] };
    }

    // Reset any ongoing timers/intervals if necessary
    clearBossAttackInterval();

    // Clear projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        scene.remove(projectiles[i]);

        // Cleanup lights
        projectiles[i].traverse(child => {
            if (child instanceof THREE.PointLight) {
                lightCount = Math.max(0, lightCount - 1);
            }
        });
    }
    projectiles.length = 0;

    // Clear pickups
    for (let i = pickups.length - 1; i >= 0; i--) {
        scene.remove(pickups[i]);
    }
    pickups.length = 0;

    // Remove old boss
    if (enemy) {
        scene.remove(enemy.mesh);
        enemy = null;
    }

    // Clear any exit door
    if (exitDoor) {
        scene.remove(exitDoor);
        exitDoor = null;
    }

    // Clear all animated objects
    for (let i = animatedObjects.length - 1; i >= 0; i--) {
        const obj = animatedObjects[i];
        if (obj.parent) {
            scene.remove(obj.parent);
        }
        // For objects that are themselves in the scene
        if (obj.isObject3D) {
            scene.remove(obj);
        }
    }
    animatedObjects.length = 0;

    // Thorough cleanup - remove all room elements
    // Clear ALL room decorations from previous rooms
    for (let roomIdx = 0; roomIdx < currentRoomIndex; roomIdx++) {
        if (rooms[roomIdx] && rooms[roomIdx].objects) {
            rooms[roomIdx].objects.forEach(obj => {
                scene.remove(obj);
            });
            rooms[roomIdx].objects = [];
        }
    }

    // Additional scene cleanup - remove any mesh that's not essential
    const essentialObjects = [player, camera];
    scene.children.slice().forEach(object => {
        if (!essentialObjects.includes(object) &&
            !(object instanceof THREE.AmbientLight) &&
            !(object instanceof THREE.DirectionalLight)) {
            scene.remove(object);
        }
    });

    // Reset light count for the new room
    lightCount = 0;

    // Generate new room
    generateRoom();

    // Spawn boss
    spawnBoss();
}

// Spawn upgrade pickups
const pickups = [];
function spawnUpgrade() {
    // Choose random upgrade type
    const types = [
        { type: 'weapon', name: 'Plasma Gun' },
        { type: 'weapon', name: 'Pulse Rifle' },
        { type: 'weapon', name: 'BFG' },
        { type: 'stats', strength: 0.5, speed: 0.2 },
        { type: 'stats', strength: 0.2, speed: 0.5 },
        { type: 'stats', strength: 0.4, speed: 0.4 }
    ];

    // Choose more advanced weapons for higher levels
    let availableTypes = types;
    if (currentRoomIndex < 1) {
        // First level - exclude BFG
        availableTypes = types.filter(t => t.type !== 'weapon' || t.name !== 'BFG');
    }

    const upgrade = availableTypes[Math.floor(Math.random() * availableTypes.length)];

    // Create pickup mesh
    const pickupGroup = new THREE.Group();

    // Base
    const baseGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16);
    const baseMat = new THREE.MeshStandardMaterial({
        color: 0x333333,
        metalness: 0.7,
        roughness: 0.3
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    pickupGroup.add(base);

    // Floating item
    let itemGeo, itemMat;
    if (upgrade.type === 'weapon') {
        // Weapon pickup
        itemGeo = new THREE.BoxGeometry(0.4, 0.2, 0.8);
        itemMat = new THREE.MeshStandardMaterial({
            color: 0x3366ff,
            emissive: 0x0033cc,
            emissiveIntensity: 0.5,
            metalness: 0.8,
            roughness: 0.2
        });
    } else {
        // Stat pickup
        itemGeo = new THREE.SphereGeometry(0.3, 16, 16);
        itemMat = new THREE.MeshStandardMaterial({
            color: 0xffcc00,
            emissive: 0xff6600,
            emissiveIntensity: 0.5,
            metalness: 0.5,
            roughness: 0.3
        });
    }

    const item = new THREE.Mesh(itemGeo, itemMat);
    item.position.y = 0.5;
    pickupGroup.add(item);

    // Add light
    const pickupLight = new THREE.PointLight(
        upgrade.type === 'weapon' ? 0x3366ff : 0xffcc00,
        0.7,
        3
    );
    pickupLight.position.y = 0.5;
    pickupGroup.add(pickupLight);

    // Position pickup - random location in room
    const x = (Math.random() - 0.5) * 16;
    const z = (Math.random() - 0.5) * 16;
    pickupGroup.position.set(x, 0, z);

    // Add to scene
    scene.add(pickupGroup);

    // Store in room objects if available
    if (rooms[currentRoomIndex]) {
        rooms[currentRoomIndex].objects.push(pickupGroup);
    }

    // Store pickup data
    pickupGroup.userData = {
        type: upgrade.type,
        ...upgrade
    };

    // Add to pickups array
    pickups.push(pickupGroup);

    // Animate pickup
    const startTime = Date.now();
    function animatePickup() {
        if (!pickupGroup.parent) return; // Stop if removed

        const time = Date.now() * 0.001;

        // Hover and rotate
        item.position.y = 0.5 + Math.sin(time * 1.5) * 0.15;
        item.rotation.y = time * 0.5;

        // Pulse light
        if (pickupLight) {
            pickupLight.intensity = 0.5 + Math.sin(time * 2) * 0.2;
        }

        requestAnimationFrame(animatePickup);
    }

    animatePickup();

    return pickupGroup;
}

// Check pickup collisions
function checkPickupCollisions() {
    for (let i = pickups.length - 1; i >= 0; i--) {
        const pickup = pickups[i];
        const distance = player.position.distanceTo(pickup.position);

        if (distance < 1.5) {
            // Collect pickup based on type
            if (pickup.userData.type === 'weapon') {
                player.collectWeapon(pickup.userData.name);
            } else if (pickup.userData.type === 'stats') {
                player.addStats({
                    strength: pickup.userData.strength || 0,
                    speed: pickup.userData.speed || 0
                });
            }

            // Remove from scene and array
            scene.remove(pickup);
            pickups.splice(i, 1);
        }
    }
}

// Create player
function createPlayer() {
    player = {
        health: 100,
        maxHealth: 100,
        strength: 1,
        speed: 1,
        baseSpeed: 0.15,
        canShoot: true,
        shootCooldown: 500, // milliseconds
        damage: 20,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        radius: 0.5,
        invulnerable: false,
        alive: true, // Add alive property
        weapon: 'Basic Sword', // Changed from 'Blaster' to 'Basic Sword'

        update: function (deltaTime) {
            // Get camera direction
            const direction = new THREE.Vector3();
            camera.getWorldDirection(direction);
            direction.y = 0;
            direction.normalize();

            // Calculate movement
            const sideDirection = new THREE.Vector3(-direction.z, 0, direction.x);

            // Reset velocity
            this.velocity.set(0, 0, 0);

            // Apply movement with speed modifier
            const speedFactor = this.baseSpeed * this.speed;

            if (moveForward) {
                this.velocity.add(direction.multiplyScalar(speedFactor));
            }
            if (moveBackward) {
                this.velocity.add(direction.multiplyScalar(-speedFactor));
            }
            if (moveLeft) {
                this.velocity.add(sideDirection.multiplyScalar(-speedFactor));
            }
            if (moveRight) {
                this.velocity.add(sideDirection.multiplyScalar(speedFactor));
            }

            // Update position
            camera.position.add(this.velocity);

            // Keep player within room bounds
            camera.position.x = Math.max(-9.5, Math.min(9.5, camera.position.x));
            camera.position.z = Math.max(-9.5, Math.min(9.5, camera.position.z));

            // Update player position
            this.position.copy(camera.position);
        },

        takeDamage: function (amount, specialEffect = null) {
            if (this.invulnerable) return;

            this.health -= amount;
            if (this.health < 0) this.health = 0;

            // Debug logging for damage
            console.log(`Boss taking ${amount} damage, health now: ${this.health}/${this.maxHealth}`);

            // Apply special effects from weapons
            if (specialEffect) {
                console.log(`Applying special effect: ${specialEffect.type}`);
                switch (specialEffect.type) {
                    case 'burn':
                        // Apply burn effect
                        console.log(`Applying burn effect: ${specialEffect.damage} damage every ${specialEffect.tickInterval}ms for ${specialEffect.duration}ms`);
                        this.statusEffects.burn.active = true;
                        this.statusEffects.burn.damage = specialEffect.damage;
                        this.statusEffects.burn.endTime = Date.now() + specialEffect.duration;
                        this.statusEffects.burn.tickInterval = specialEffect.tickInterval;
                        this.statusEffects.burn.nextTickTime = Date.now() + specialEffect.tickInterval;

                        // Create fire visual effect
                        this.addBurnEffect();
                        break;

                    case 'slow':
                        // Apply slow effect
                        console.log(`Applying slow effect: speed reduced by ${specialEffect.speedReduction}, attack slowed by ${specialEffect.attackSlowdown} for ${specialEffect.duration}ms`);
                        if (!this.statusEffects.slow.active) {
                            // Save original values if not already slowed
                            this.statusEffects.slow.originalSpeed = this.speed;
                            this.statusEffects.slow.originalAttackCooldown = this.attackCooldown;
                        }

                        // Apply slow
                        this.statusEffects.slow.active = true;
                        this.statusEffects.slow.endTime = Date.now() + specialEffect.duration;
                        this.speed = this.statusEffects.slow.originalSpeed * specialEffect.speedReduction;
                        this.attackCooldown = this.statusEffects.slow.originalAttackCooldown / specialEffect.attackSlowdown;

                        // Add frost visual effect
                        this.addFrostEffect();
                        break;

                    case 'lifesteal':
                        // Heal player
                        const healAmount = amount * specialEffect.healPercent;
                        console.log(`Applying lifesteal effect: healing player for ${healAmount} (${specialEffect.healPercent * 100}% of damage)`);
                        player.heal(healAmount);

                        // Add soul drain visual effect
                        this.addSoulDrainEffect();
                        break;
                }
            }

            // Update health bar
            healthFill.style.width = (this.health / this.maxHealth * 100) + '%';

            // Play damage sound
            playSound('playerHit');

            // Show damage overlay
            damageOverlay.style.opacity = 0.7;
            setTimeout(() => {
                damageOverlay.style.opacity = 0;
            }, 300);

            // Check if dead
            if (this.health <= 0) {
                gameOver();
            } else {
                // Temporary invulnerability
                this.invulnerable = true;
                setTimeout(() => {
                    this.invulnerable = false;
                }, 500);
            }
        },

        attackWithSword: function () {
            return this.shoot();
        },

        heal: function (amount) {
            // Add health but don't exceed max health
            const oldHealth = this.health;
            this.health = Math.min(this.maxHealth, this.health + amount);

            console.log(`Player healed for ${amount}, health increased from ${oldHealth} to ${this.health}`);

            // Update health bar
            healthFill.style.width = (this.health / this.maxHealth * 100) + '%';

            // Show heal effect
            this.createHealEffect(amount);
        },

        createHealEffect: function (amount) {
            // Create heal text that floats up
            const healText = document.createElement('div');
            healText.textContent = '+' + Math.floor(amount);
            healText.style.position = 'absolute';
            healText.style.color = '#44ff44';
            healText.style.fontWeight = 'bold';
            healText.style.fontSize = '24px';
            healText.style.textShadow = '0 0 3px #000';
            healText.style.left = '50%';
            healText.style.top = '60%';
            healText.style.transform = 'translate(-50%, -50%)';
            healText.style.pointerEvents = 'none';
            healText.style.zIndex = '1000';
            healText.style.opacity = '1';
            healText.style.transition = 'opacity 1s ease-out, top 1s ease-out';

            document.body.appendChild(healText);

            // Animate text floating up
            setTimeout(() => {
                healText.style.opacity = '0';
                healText.style.top = '50%';

                // Remove after animation
                setTimeout(() => {
                    document.body.removeChild(healText);
                }, 1000);
            }, 10);
        },

        shoot: function () {
            if (!this.canShoot) return;

            // Set cooldown based on weapon
            this.canShoot = false;
            setTimeout(() => { this.canShoot = true; }, this.getWeaponInfo().cooldown);

            // Get weapon properties
            const weaponInfo = this.getWeaponInfo();

            // Play weapon swing sound
            playSound('weaponSwing');

            // Create sword swing effect - pass enemy detection to animation function
            // instead of doing damage immediately
            this.createSwordSwingEffect(weaponInfo);

            // Damage will be applied during the swing animation
        },

        createSwordSwingEffect: function (weaponInfo) {
            // Create visual sword swing effect
            const swingGroup = new THREE.Group();

            // Create sword blade using a box
            const bladeGeo = new THREE.BoxGeometry(0.1, 0.8, 0.2);
            const bladeMat = new THREE.MeshBasicMaterial({
                color: weaponInfo.color,
                transparent: true,
                opacity: 0.7
            });
            const blade = new THREE.Mesh(bladeGeo, bladeMat);
            blade.position.y = 0; // Center of blade
            swingGroup.add(blade);

            // Create sword handle
            const handleGeo = new THREE.BoxGeometry(0.05, 0.2, 0.05);
            const handleMat = new THREE.MeshBasicMaterial({ color: 0x8B4513 });
            const handle = new THREE.Mesh(handleGeo, handleMat);
            handle.position.y = -0.5; // Below blade
            swingGroup.add(handle);

            // Add sword guard (crossguard)
            const guardGeo = new THREE.BoxGeometry(0.3, 0.05, 0.1);
            const guardMat = new THREE.MeshBasicMaterial({ color: 0x8B4513 });
            const guard = new THREE.Mesh(guardGeo, guardMat);
            guard.position.y = -0.4; // Between blade and handle
            swingGroup.add(guard);

            // Create player hand holding the sword
            const handGeo = new THREE.SphereGeometry(0.12, 8, 8);
            const handMat = new THREE.MeshBasicMaterial({ color: 0xFFD700 }); // Simple gold color for glove
            const hand = new THREE.Mesh(handGeo, handMat);
            hand.position.y = -0.6; // At the end of handle
            hand.position.x = 0.05; // Slightly offset to show hand
            swingGroup.add(hand);

            // Add to scene - will position during animation
            scene.add(swingGroup);

            // Add trail effect for swing arc
            const trailCount = 8;
            const trails = [];
            for (let i = 0; i < trailCount; i++) {
                const trailGeo = new THREE.BoxGeometry(0.05, 0.6, 0.1);
                const trailMat = new THREE.MeshBasicMaterial({
                    color: weaponInfo.color,
                    transparent: true,
                    opacity: 0.3 - (i * 0.03)
                });
                const trail = new THREE.Mesh(trailGeo, trailMat);
                trail.visible = false;
                swingGroup.add(trail);
                trails.push(trail);
            }

            // Add light effect if we have room for it
            let light = null;
            if (lightCount < maxLights) {
                light = new THREE.PointLight(weaponInfo.color, 0.7, 2);
                swingGroup.add(light);
                lightCount++;
            }

            // Animate swing and remove after animation
            const startTime = Date.now();
            const swingDuration = 400; // milliseconds - slightly longer for more dramatic effect

            // Store last positions for trail effect
            const lastPositions = [];

            // Flag to track if damage has been applied
            let damageApplied = false;
            // Track when damage should be applied (around 65-70% of animation)
            const damageTime = swingDuration * 0.65;

            function animateSwing() {
                const elapsed = Date.now() - startTime;
                if (elapsed < swingDuration) {
                    // Calculate swing progress (0 to 1)
                    const progress = elapsed / swingDuration;

                    // Get current camera direction and position
                    const direction = new THREE.Vector3();
                    camera.getWorldDirection(direction);

                    // Calculate right vector relative to camera
                    const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();

                    // Position sword relative to the camera
                    // 1. Start with camera position
                    swingGroup.position.copy(camera.position);

                    // 2. Position to the right and down as if player is holding it
                    const handOffset = 0.6; // Distance from camera center where hand would be
                    swingGroup.position.add(right.clone().multiplyScalar(0.4)); // Right side
                    swingGroup.position.y -= 0.3; // Lower position as if holding sword

                    // 3. Add forward offset to place sword in front of player
                    swingGroup.position.add(direction.clone().multiplyScalar(1.0));

                    // Sword slash animation - swing from "ready" position through center cursor to left side
                    // Start: bottom right, End: top left
                    // This creates a diagonal upward slash through the center crosshair

                    // Calculate animation path
                    const swingAngle = Math.PI * 0.9; // ~160 degree arc
                    let currentRotation;

                    if (progress < 0.5) {
                        // First half - rearing back for the slash
                        const prepProgress = progress * 2; // 0 to 1 during first half
                        currentRotation = -Math.PI / 4 - (prepProgress * Math.PI / 6);

                        // Adjust position to simulate rearing back
                        swingGroup.position.add(right.clone().multiplyScalar(0.2 * prepProgress));
                        swingGroup.position.y -= 0.1 * prepProgress;
                    } else {
                        // Second half - actual slashing motion through cursor
                        const slashProgress = (progress - 0.5) * 2; // 0 to 1 during second half

                        // Swing from rear position through crosshair to end position
                        currentRotation = -Math.PI / 4 - Math.PI / 6 + (slashProgress * swingAngle);

                        // Move sword through center of screen
                        swingGroup.position.add(right.clone().multiplyScalar(-0.8 * slashProgress));
                        swingGroup.position.y += 0.3 * slashProgress;

                        // Apply damage during the middle of the swing (when sword passes through center)
                        // Only apply damage once during the animation
                        if (!damageApplied && elapsed >= damageTime) {
                            damageApplied = true;

                            // Check for enemies in range with a forward-facing cone
                            if (enemy && enemy.health > 0) {
                                // Get direction and position for sword attack
                                const attackDirection = new THREE.Vector3();
                                camera.getWorldDirection(attackDirection);

                                // Get distance to enemy
                                const distanceToEnemy = player.position.distanceTo(enemy.mesh.position);

                                // Check if enemy is in front of player (dot product > 0)
                                const toEnemy = new THREE.Vector3()
                                    .subVectors(enemy.mesh.position, player.position)
                                    .normalize();
                                const angleToEnemy = attackDirection.dot(toEnemy);

                                // More lenient hit detection:
                                // - Increased effective range for larger bosses
                                // - Reduced angle requirement for easier hits
                                // - Added a small bonus to the hitbox size
                                const hitboxBonus = 0.5; // Additional bonus to hit detection

                                // If enemy is in range (distance) and in front (angle)
                                // Note: lower arc values mean a wider angle is acceptable
                                if (distanceToEnemy < (weaponInfo.range + hitboxBonus) && angleToEnemy > (weaponInfo.arc - 0.1)) {
                                    // Apply damage directly
                                    enemy.takeDamage(weaponInfo.damage * player.strength, weaponInfo.specialEffect);

                                    // Show hit effect
                                    player.createHitEffect(enemy.mesh.position);
                                }
                            }
                        }
                    }

                    // Apply rotation to sword
                    swingGroup.lookAt(camera.position.clone().add(direction));
                    swingGroup.rotateOnAxis(new THREE.Vector3(0, 0, 1), currentRotation);

                    // Update trail effect
                    if (progress > 0.5) { // Only show trail during actual slash
                        const bladePos = new THREE.Vector3();
                        blade.getWorldPosition(bladePos);

                        lastPositions.unshift({
                            position: blade.position.clone(),
                            quaternion: swingGroup.quaternion.clone()
                        });

                        // Limit trail length
                        if (lastPositions.length > trailCount) {
                            lastPositions.pop();
                        }

                        // Update trail meshes
                        for (let i = 0; i < lastPositions.length && i < trails.length; i++) {
                            const trail = trails[i];
                            trail.visible = true;
                            trail.position.copy(lastPositions[i].position);
                            trail.quaternion.copy(lastPositions[i].quaternion);

                            // Fade out based on how old the position is
                            trail.material.opacity = 0.3 * (1 - (i / trailCount));
                        }
                    }

                    // Fade out toward end of animation
                    if (elapsed > swingDuration * 0.8) {
                        const fade = 1 - ((elapsed - (swingDuration * 0.8)) / (swingDuration * 0.2));
                        blade.material.opacity = fade * 0.7;
                        // Also fade trails
                        trails.forEach(trail => {
                            if (trail.visible) {
                                trail.material.opacity *= fade;
                            }
                        });
                        // Fade light
                        if (light) {
                            light.intensity = 0.7 * fade;
                        }
                    }

                    requestAnimationFrame(animateSwing);
                } else {
                    // Clean up when done
                    scene.remove(swingGroup);
                    // Reduce light count if we added one
                    if (light) {
                        lightCount = Math.max(0, lightCount - 1);
                    }
                }
            }

            animateSwing();
        },

        createHitEffect: function (position) {
            // Create hit effect at enemy position
            const hitGroup = new THREE.Group();

            // Create several particles for hit effect
            for (let i = 0; i < 5; i++) {
                const particleGeo = new THREE.SphereGeometry(0.05 + Math.random() * 0.05, 4, 4);
                const particleMat = new THREE.MeshBasicMaterial({
                    color: 0xff0000,
                    transparent: true,
                    opacity: 0.8
                });
                const particle = new THREE.Mesh(particleGeo, particleMat);

                // Random position around hit point
                particle.position.set(
                    (Math.random() - 0.5) * 0.3,
                    (Math.random() - 0.5) * 0.3,
                    (Math.random() - 0.5) * 0.3
                );

                // Random velocity
                particle.userData.velocity = new THREE.Vector3(
                    (Math.random() - 0.5) * 0.05,
                    (Math.random() - 0.5) * 0.05 + 0.02,
                    (Math.random() - 0.5) * 0.05
                );

                hitGroup.add(particle);
            }

            // Position at hit location
            hitGroup.position.copy(position);

            // Add to scene
            scene.add(hitGroup);

            // Animate particles
            const startTime = Date.now();
            const effectDuration = 500; // milliseconds

            function animateParticles() {
                const elapsed = Date.now() - startTime;
                if (elapsed < effectDuration) {
                    // Move particles outward
                    hitGroup.children.forEach(particle => {
                        particle.position.add(particle.userData.velocity);

                        // Fade out
                        const fade = 1 - (elapsed / effectDuration);
                        if (particle.material) {
                            particle.material.opacity = fade * 0.8;
                        }
                    });

                    requestAnimationFrame(animateParticles);
                } else {
                    // Clean up when done
                    scene.remove(hitGroup);
                }
            }

            animateParticles();
        },

        getWeaponInfo: function () {
            // Different sword types with properties
            const weapons = {
                'Basic Sword': {
                    damage: 25,
                    cooldown: 600,
                    range: 3.0, // Increased from 2.5
                    arc: 0.5, // Reduced from 0.6 - smaller value means wider angle
                    color: 0xcccccc,
                    specialEffect: null
                },
                'Fire Blade': {
                    damage: 40,
                    cooldown: 700,
                    range: 3.5, // Increased from 3.0
                    arc: 0.6, // Reduced from 0.7
                    color: 0xff5500,
                    specialEffect: {
                        type: 'burn',
                        damage: 5,
                        duration: 3000,
                        tickInterval: 500
                    }
                },
                'Ice Saber': {
                    damage: 30,
                    cooldown: 400, // Faster attacks
                    range: 3.3, // Increased from 2.8
                    arc: 0.55, // Reduced from 0.65
                    color: 0x00ccff,
                    specialEffect: {
                        type: 'slow',
                        speedReduction: 0.5,
                        attackSlowdown: 0.7,
                        duration: 2000
                    }
                },
                'Soul Reaver': {
                    damage: 70,
                    cooldown: 900,
                    range: 4.0, // Increased from 3.5
                    arc: 0.7, // Reduced from 0.8
                    color: 0x9933ff,
                    specialEffect: {
                        type: 'lifesteal',
                        healPercent: 0.15
                    }
                }
            };

            return weapons[this.weapon] || weapons['Basic Sword'];
        },

        collectWeapon: function (weaponName) {
            this.weapon = weaponName;
            currentWeapon.textContent = weaponName;

            // Show pickup message
            this.showPickupMessage(`New weapon: ${weaponName}`);
        },

        addStats: function (stats) {
            this.strength += stats.strength || 0;
            this.speed += stats.speed || 0;

            // Update UI
            strengthStat.textContent = this.strength.toFixed(1);
            speedStat.textContent = this.speed.toFixed(1);

            // Show pickup message
            this.showPickupMessage(`Stats increased: +${stats.strength || 0} Strength, +${stats.speed || 0} Speed`);
        },

        showPickupMessage: function (message) {
            pickupMessage.textContent = message;
            pickupMessage.style.opacity = 1;
            pickupMessage.classList.remove('fadeOut');

            // Force a reflow to restart animation
            void pickupMessage.offsetWidth;

            setTimeout(() => {
                pickupMessage.classList.add('fadeOut');
            }, 50);
        },

        addBurnEffect: function () {
            // Create burn particle effect around the enemy
            const burnGroup = new THREE.Group();

            // Create fire particles
            for (let i = 0; i < 8; i++) {
                const particleGeo = new THREE.SphereGeometry(0.1 + Math.random() * 0.1, 4, 4);
                const particleMat = new THREE.MeshBasicMaterial({
                    color: 0xff4500,
                    transparent: true,
                    opacity: 0.7
                });
                const particle = new THREE.Mesh(particleGeo, particleMat);

                // Random position around enemy
                const radius = 0.7 * this.scale;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI;

                particle.position.set(
                    radius * Math.sin(phi) * Math.cos(theta),
                    radius * Math.cos(phi) + 1.5 * this.scale,
                    radius * Math.sin(phi) * Math.sin(theta)
                );

                // Add rising movement
                particle.userData.velocity = new THREE.Vector3(
                    (Math.random() - 0.5) * 0.01,
                    0.01 + Math.random() * 0.01,
                    (Math.random() - 0.5) * 0.01
                );

                burnGroup.add(particle);
            }

            burnGroup.position.copy(this.mesh.position);
            scene.add(burnGroup);

            // Animate fire particles
            const startTime = Date.now();
            const effectDuration = 1500; // milliseconds

            const animateFire = () => {
                const elapsed = Date.now() - startTime;
                if (elapsed < effectDuration) {
                    // Move particles upward and flicker
                    burnGroup.children.forEach(particle => {
                        particle.position.add(particle.userData.velocity);

                        // Random scale for flickering effect
                        const flicker = 0.8 + (Math.random() * 0.4);
                        particle.scale.set(flicker, flicker, flicker);

                        // Fade out
                        const fade = 1 - (elapsed / effectDuration);
                        if (particle.material) {
                            particle.material.opacity = fade * 0.7;
                        }
                    });

                    requestAnimationFrame(animateFire);
                } else {
                    scene.remove(burnGroup);
                }
            };

            animateFire();
        },

        addFrostEffect: function () {
            // Create frost particle effect with angular ice crystals
            const frostGroup = new THREE.Group();

            // Create ice particles with geometric shapes
            for (let i = 0; i < 15; i++) {
                // Alternate between shapes for variety
                let particleGeo;
                if (i % 3 === 0) {
                    particleGeo = new THREE.TetrahedronGeometry(0.08 + Math.random() * 0.08);
                } else if (i % 3 === 1) {
                    particleGeo = new THREE.OctahedronGeometry(0.08 + Math.random() * 0.08, 0);
                } else {
                    particleGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
                }

                // Vary shades of blue-white
                const blueShade = Math.random() * 0.4;
                const particleMat = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(0.6 + blueShade, 0.8 + blueShade * 0.2, 0.95),
                    emissive: new THREE.Color(0.3 + blueShade, 0.5 + blueShade * 0.2, 0.8),
                    emissiveIntensity: 0.3,
                    transparent: true,
                    opacity: 0.8,
                    flatShading: true
                });

                const particle = new THREE.Mesh(particleGeo, particleMat);

                // Random position around enemy
                const radius = 1.0 * this.scale;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI;

                particle.position.set(
                    radius * Math.sin(phi) * Math.cos(theta),
                    radius * Math.cos(phi) + 1.5 * this.scale,
                    radius * Math.sin(phi) * Math.sin(theta)
                );

                // Random rotation for better crystal look
                particle.rotation.set(
                    Math.random() * Math.PI,
                    Math.random() * Math.PI,
                    Math.random() * Math.PI
                );

                // Add subtle outward drift
                particle.userData.velocity = new THREE.Vector3(
                    particle.position.x * 0.01,
                    (Math.random() - 0.3) * 0.01, // Slight upward bias
                    particle.position.z * 0.01
                );

                frostGroup.add(particle);
            }

            frostGroup.position.copy(this.mesh.position);
            scene.add(frostGroup);

            // Add shimmer effect with point light
            let shimmerLight = null;
            if (lightCount < maxLights) {
                shimmerLight = new THREE.PointLight(0xccffff, 0.8, 4);
                shimmerLight.position.set(0, 1.5, 0);
                frostGroup.add(shimmerLight);
                lightCount++;
            }

            // Animate ice particles
            const startTime = Date.now();
            const effectDuration = 1500; // milliseconds

            const animateFrost = () => {
                const elapsed = Date.now() - startTime;
                if (elapsed < effectDuration) {
                    // Update particles
                    frostGroup.children.forEach((particle, index) => {
                        // Skip light
                        if (particle.isLight) return;

                        // Move particles
                        if (particle.userData.velocity) {
                            particle.position.add(particle.userData.velocity);
                        }

                        // Slow rotation
                        particle.rotation.x += 0.01;
                        particle.rotation.y += 0.01;

                        // Fade out
                        const fade = 1 - (elapsed / effectDuration);
                        if (particle.material) {
                            particle.material.opacity = fade * 0.8;
                        }

                        // Scale up slightly
                        const scale = 1 + (elapsed / effectDuration) * 0.5;
                        particle.scale.set(scale, scale, scale);
                    });

                    // Animate light intensity if it exists
                    if (shimmerLight) {
                        shimmerLight.intensity = 0.8 * (1 - (elapsed / effectDuration)) *
                            (0.7 + Math.sin(elapsed * 0.01) * 0.3);
                    }

                    requestAnimationFrame(animateFrost);
                } else {
                    // Clean up when done
                    if (shimmerLight) {
                        lightCount = Math.max(0, lightCount - 1);
                    }
                    scene.remove(frostGroup);
                }
            };

            animateFrost();
        },

        addSoulDrainEffect: function () {
            // Create soul drain effect
            const drainGroup = new THREE.Group();

            // Create particles that flow from enemy to player
            for (let i = 0; i < 6; i++) {
                const particleGeo = new THREE.SphereGeometry(0.06, 4, 4);
                const particleMat = new THREE.MeshBasicMaterial({
                    color: 0xcc66ff,
                    transparent: true,
                    opacity: 0.7
                });
                const particle = new THREE.Mesh(particleGeo, particleMat);

                // Start at random position on enemy
                const radius = 0.5 * this.scale;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI;

                particle.position.set(
                    radius * Math.sin(phi) * Math.cos(theta),
                    radius * Math.cos(phi) + 1.5 * this.scale,
                    radius * Math.sin(phi) * Math.sin(theta)
                );

                drainGroup.add(particle);
            }

            drainGroup.position.copy(this.mesh.position);
            scene.add(drainGroup);

            // Animate particles to flow toward player
            const startTime = Date.now();
            const effectDuration = 800; // milliseconds

            // Calculate vector from enemy to player
            const toPlayer = new THREE.Vector3();

            const animateDrain = () => {
                const elapsed = Date.now() - startTime;
                if (elapsed < effectDuration) {
                    // Get current direction to player
                    toPlayer.subVectors(player.position, this.mesh.position).normalize();

                    // Move particles toward player
                    drainGroup.children.forEach(particle => {
                        // Progress determines speed (accelerate as they get closer)
                        const progress = elapsed / effectDuration;
                        const speed = 0.05 + (progress * 0.1);

                        // Move toward player
                        particle.position.add(toPlayer.clone().multiplyScalar(speed));

                        // Fade out at the end
                        if (progress > 0.7) {
                            const fade = 1 - ((progress - 0.7) / 0.3);
                            if (particle.material) {
                                particle.material.opacity = fade * 0.7;
                            }
                        }
                    });

                    requestAnimationFrame(animateDrain);
                } else {
                    scene.remove(drainGroup);
                }
            };

            animateDrain();
        },

        updateStatusEffects: function (deltaTime) {
            const now = Date.now();

            // Update burn effect
            if (this.statusEffects.burn.active) {
                // Apply damage over time
                if (now >= this.statusEffects.burn.nextTickTime) {
                    // Take burn damage
                    this.health -= this.statusEffects.burn.damage;
                    if (this.health < 0) this.health = 0;

                    console.log(`Burn tick: ${this.statusEffects.burn.damage} damage applied, health now ${this.health}/${this.maxHealth}`);

                    // Update boss health bar
                    bossHealthFill.style.width = (this.health / this.maxHealth * 100) + '%';
                    bossHealthText.textContent = `${Math.floor(this.health)}/${Math.floor(this.maxHealth)}`;

                    // Add small fire visual
                    this.addBurnEffect();

                    // Schedule next tick
                    this.statusEffects.burn.nextTickTime = now + this.statusEffects.burn.tickInterval;
                }

                // Check if effect has expired
                if (now > this.statusEffects.burn.endTime) {
                    console.log('Burn effect expired');
                    this.statusEffects.burn.active = false;
                }

                // Check if dead from burn
                if (this.health <= 0 && this.alive) {
                    console.log('Boss killed by burn effect');
                    this.takeDamage(0); // Call takeDamage with 0 to handle death
                }
            }

            // Update slow effect
            if (this.statusEffects.slow.active) {
                // Check if effect has expired
                if (now > this.statusEffects.slow.endTime) {
                    console.log('Slow effect expired, restoring original speed and attack rate');
                    // Restore original values
                    this.speed = this.statusEffects.slow.originalSpeed;
                    this.attackCooldown = this.statusEffects.slow.originalAttackCooldown;
                    this.statusEffects.slow.active = false;
                }
            }
        }
    };

    return player;
}

// Create enemy boss
function createBoss(theme = 'fire', difficulty = 1) {
    // Determine boss properties based on theme
    const bossTypes = {
        fire: {
            name: 'Inferno Overlord',
            color: 0xff3300,
            attackType: 'ranged',
            attackDamage: 10 * difficulty,
            attackSpeed: 2 - (difficulty * 0.1),
            scale: 1 + (difficulty * 0.2)
        },
        ice: {
            name: 'Frost Monarch',
            color: 0x33ccff,
            attackType: 'melee',
            attackDamage: 15 * difficulty,
            attackSpeed: 3 - (difficulty * 0.2),
            scale: 0.8 + (difficulty * 0.15)
        },
        undead: {
            name: 'Necro Lord',
            color: 0x660066,
            attackType: 'summon',
            attackDamage: 8 * difficulty,
            attackSpeed: 4 - (difficulty * 0.3),
            scale: 0.9 + (difficulty * 0.18)
        },
        mechanical: {
            name: 'Clockwork Titan',
            color: 0xccaa00,
            attackType: 'aoe',
            attackDamage: 12 * difficulty,
            attackSpeed: 2.5 - (difficulty * 0.15),
            scale: 1.2 + (difficulty * 0.25)
        }
    };

    // Use fire boss as default
    const bossType = bossTypes[theme] || bossTypes.fire;

    // Create boss mesh
    const bossGroup = new THREE.Group();

    // Create boss based on theme
    switch (theme) {
        case 'fire':
            createFireBoss(bossGroup, bossType);
            break;
        case 'ice':
            createIceBoss(bossGroup, bossType);
            break;
        case 'undead':
            createUndeadBoss(bossGroup, bossType);
            break;
        case 'mechanical':
            createMechanicalBoss(bossGroup, bossType);
            break;
        default:
            createFireBoss(bossGroup, bossType); // Default to fire boss
    }

    // Scale boss
    bossGroup.scale.set(bossType.scale, bossType.scale, bossType.scale);

    // Add to scene
    bossGroup.position.set(0, 0, -7);
    scene.add(bossGroup);

    // Create boss object
    const boss = {
        mesh: bossGroup,
        theme: theme,
        name: bossType.name,
        attackType: bossType.attackType,
        color: bossType.color,
        health: 100 * difficulty,
        maxHealth: 100 * difficulty,
        speed: 0.03,
        damage: bossType.attackDamage,
        // Set different attack ranges based on boss type
        attackRange: theme === 'ice' ? 2.5 :
            theme === 'mechanical' ? 1.7 :
                1.5, // Default attack range (1.5) for other boss types
        attackCooldown: 1000 / bossType.attackSpeed,
        attackTimer: 0,
        canAttack: true,
        difficulty: difficulty,
        scale: bossType.scale,
        radius: 2.0 * bossType.scale, // Increased from 1.5 to 2.0 for larger hitbox
        alive: true, // Add missing alive property

        // Status effect tracking
        statusEffects: {
            burn: {
                active: false,
                damage: 0,
                endTime: 0,
                nextTickTime: 0,
                tickInterval: 0
            },
            slow: {
                active: false,
                endTime: 0,
                originalSpeed: 0,
                originalAttackCooldown: 0
            }
        },
        position: new THREE.Vector3(0, 0, -7),
        projectiles: [],

        update: function (deltaTime) {
            if (!this.alive) return;

            // Update position of the boss's logical position
            this.position.copy(this.mesh.position);
            this.position.y = 0; // Keep ground-level for collision

            // Move towards player
            const direction = new THREE.Vector3();
            direction.subVectors(player.position, this.position);
            direction.y = 0; // Keep on ground

            // Only move if player is more than attack range away
            const distance = direction.length();
            if (distance > this.attackRange) {
                direction.normalize();
                this.mesh.position.add(direction.multiplyScalar(this.speed));
            }

            // Look at player
            const lookPoint = new THREE.Vector3(player.position.x, this.mesh.position.y, player.position.z);
            this.mesh.lookAt(lookPoint);

            // Update attack timer
            this.attackTimer += deltaTime * 1000;
            if (this.attackTimer >= this.attackCooldown) {
                try {
                    this.attack(distance);
                    this.attackTimer = 0;
                } catch (e) {
                    console.error("Error in boss attack:", e);
                    this.attackTimer = 0; // Reset timer to prevent spam errors
                }
            }

            // Update projectiles if this boss uses them
            try {
                this.updateProjectiles(deltaTime);
            } catch (e) {
                console.error("Error updating boss projectiles:", e);
            }
        },

        attack: function (distanceToPlayer) {
            if (!this.alive) return;

            switch (this.attackType) {
                case 'melee':
                    // Only damage if in range
                    if (distanceToPlayer <= this.attackRange) {
                        player.takeDamage(this.damage);

                        // Show attack effect
                        messageEl.textContent = `${this.name} strikes you!`;
                        messageEl.style.display = 'block';
                        messageEl.style.opacity = '1';
                        setTimeout(() => {
                            messageEl.style.opacity = '0';
                        }, 1000);
                    }
                    break;

                case 'ranged':
                    // Fire a projectile
                    this.fireProjectile();
                    break;

                case 'aoe':
                    // Area effect attack
                    if (distanceToPlayer <= this.attackRange * 2) {
                        player.takeDamage(this.damage * 0.7);

                        // Show ground impact
                        this.createAOEEffect();

                        // Show attack effect
                        messageEl.textContent = `${this.name} unleashes a shock wave!`;
                        messageEl.style.display = 'block';
                        messageEl.style.opacity = '1';
                        setTimeout(() => {
                            messageEl.style.opacity = '0';
                        }, 1000);
                    }
                    break;

                case 'summon':
                    // Not implementing full summon mechanics for simplicity
                    // Just do a ranged attack for now
                    this.fireProjectile();
                    break;
            }
        },

        fireProjectile: function () {
            try {
                // Get projectile from pool
                const projectile = projectilePool.getProjectile(true);

                // Position at boss's "mouth" level
                projectile.position.copy(this.mesh.position);
                projectile.position.y = 2.5 * this.scale;
                projectile.visible = true;

                // Special color for undead boss projectiles
                if (this.theme === 'undead') {
                    // Override the material with a green one for undead boss
                    projectile.material = new THREE.MeshBasicMaterial({ color: 0x22ff66 });

                    // Change light color to green if it exists
                    projectile.children.forEach(child => {
                        if (child.isLight) {
                            child.color.setHex(0x22ff66);
                        }
                    });
                }

                // Direction towards player with slight randomness
                const direction = new THREE.Vector3();
                direction.subVectors(player.position, projectile.position);
                direction.normalize();

                // Add slight randomness
                direction.x += (Math.random() - 0.5) * 0.1;
                direction.y += (Math.random() - 0.5) * 0.1;
                direction.z += (Math.random() - 0.5) * 0.1;
                direction.normalize();

                // Add to scene
                scene.add(projectile);

                // Store data
                projectile.userData.direction = direction;
                projectile.userData.speed = 0.2;
                projectile.userData.damage = this.damage;
                projectile.userData.lifetime = 3000;
                projectile.userData.born = Date.now();
                projectile.userData.isEnemy = true;

                // Add to boss projectiles
                this.projectiles.push(projectile);
            } catch (e) {
                // Fallback to old projectile creation if pool fails
                console.warn("Boss projectile pool failed, using fallback:", e);

                // Create projectile
                const projectileGeometry = new THREE.SphereGeometry(0.2, 4, 4);
                const projectileMaterial = new THREE.MeshBasicMaterial({
                    color: this.theme === 'undead' ? 0x22ff66 : this.color
                });
                const projectile = new THREE.Mesh(projectileGeometry, projectileMaterial);

                // Position at boss's "mouth" level
                projectile.position.copy(this.mesh.position);
                projectile.position.y = 2.5 * this.scale;

                // Add light with appropriate color for the undead boss
                if (lightCount < maxLights) {
                    const lightColor = this.theme === 'undead' ? 0x22ff66 : this.color;
                    const projectileLight = new THREE.PointLight(lightColor, 0.4, 2);
                    projectile.add(projectileLight);
                    lightCount++;
                }

                // Direction towards player with slight randomness
                const direction = new THREE.Vector3();
                direction.subVectors(player.position, projectile.position);
                direction.normalize();

                // Add slight randomness
                direction.x += (Math.random() - 0.5) * 0.1;
                direction.y += (Math.random() - 0.5) * 0.1;
                direction.z += (Math.random() - 0.5) * 0.1;
                direction.normalize();

                // Add to scene
                scene.add(projectile);

                // Store data
                projectile.userData.direction = direction;
                projectile.userData.speed = 0.2;
                projectile.userData.damage = this.damage;
                projectile.userData.lifetime = 3000;
                projectile.userData.born = Date.now();

                // Add to boss projectiles
                this.projectiles.push(projectile);
            }

            // Show attack effect
            messageEl.textContent = `${this.name} shoots at you!`;
            messageEl.style.display = 'block';
            messageEl.style.opacity = '1';
            setTimeout(() => {
                messageEl.style.opacity = '0';
            }, 1000);
        },

        createAOEEffect: function () {
            // Create ring effect on the ground
            const ringGeometry = new THREE.RingGeometry(0.5, 3, 32);
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: this.color,
                transparent: true,
                opacity: 0.7,
                side: THREE.DoubleSide
            });
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.position.copy(this.mesh.position);
            ring.position.y = 0.05;
            ring.rotation.x = -Math.PI / 2;

            // Add to scene
            scene.add(ring);

            // Animate and remove
            const startTime = Date.now();
            const duration = 1000;

            function animateRing() {
                const elapsed = Date.now() - startTime;
                const progress = elapsed / duration;

                if (progress < 1) {
                    // Scale up and fade out
                    ring.scale.set(1 + progress * 2, 1 + progress * 2, 1);
                    ringMaterial.opacity = 0.7 * (1 - progress);

                    requestAnimationFrame(animateRing);
                } else {
                    // Remove when done
                    scene.remove(ring);
                }
            }

            animateRing();
        },

        updateProjectiles: function (deltaTime) {
            const now = Date.now();

            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                const projectile = this.projectiles[i];

                // Move projectile
                projectile.position.add(
                    projectile.userData.direction.clone().multiplyScalar(projectile.userData.speed)
                );

                // Check for player collision
                const distance = projectile.position.distanceTo(player.position);
                if (distance < player.radius + 0.2) {
                    // Hit player
                    player.takeDamage(projectile.userData.damage);

                    // Return projectile to pool
                    try {
                        projectilePool.releaseProjectile(projectile);
                    } catch (e) {
                        console.warn("Could not release boss projectile to pool:", e);
                        scene.remove(projectile);
                    }
                    this.projectiles.splice(i, 1);
                    continue;
                }

                // Check for wall collision
                if (
                    projectile.position.x > 9.5 || projectile.position.x < -9.5 ||
                    projectile.position.z > 9.5 || projectile.position.z < -9.5
                ) {
                    try {
                        projectilePool.releaseProjectile(projectile);
                    } catch (e) {
                        console.warn("Could not release boss projectile to pool:", e);
                        scene.remove(projectile);
                    }
                    this.projectiles.splice(i, 1);
                    continue;
                }

                // Check lifetime
                if (now - projectile.userData.born > projectile.userData.lifetime) {
                    try {
                        projectilePool.releaseProjectile(projectile);
                    } catch (e) {
                        console.warn("Could not release boss projectile to pool:", e);
                        scene.remove(projectile);
                    }
                    this.projectiles.splice(i, 1);
                }
            }
        },

        takeDamage: function (amount, specialEffect = null) {
            if (!this.alive) return;

            this.health -= amount;
            if (this.health < 0) this.health = 0;

            // Apply special effects from weapons
            if (specialEffect) {
                switch (specialEffect.type) {
                    case 'burn':
                        // Apply burn effect
                        this.statusEffects.burn.active = true;
                        this.statusEffects.burn.damage = specialEffect.damage;
                        this.statusEffects.burn.endTime = Date.now() + specialEffect.duration;
                        this.statusEffects.burn.tickInterval = specialEffect.tickInterval;
                        this.statusEffects.burn.nextTickTime = Date.now() + specialEffect.tickInterval;

                        // Create fire visual effect
                        this.addBurnEffect();
                        break;

                    case 'slow':
                        // Apply slow effect
                        if (!this.statusEffects.slow.active) {
                            // Save original values if not already slowed
                            this.statusEffects.slow.originalSpeed = this.speed;
                            this.statusEffects.slow.originalAttackCooldown = this.attackCooldown;
                        }

                        // Apply slow
                        this.statusEffects.slow.active = true;
                        this.statusEffects.slow.endTime = Date.now() + specialEffect.duration;
                        this.speed = this.statusEffects.slow.originalSpeed * specialEffect.speedReduction;
                        this.attackCooldown = this.statusEffects.slow.originalAttackCooldown / specialEffect.attackSlowdown;

                        // Add frost visual effect
                        this.addFrostEffect();
                        break;

                    case 'lifesteal':
                        // Heal player
                        const healAmount = amount * specialEffect.healPercent;
                        player.heal(healAmount);

                        // Add soul drain visual effect
                        this.addSoulDrainEffect();
                        break;
                }
            }

            // Update boss health bar - ensure it's visible
            bossHealthBar.style.display = 'block';
            bossHealthFill.style.width = (this.health / this.maxHealth * 100) + '%';
            bossHealthText.textContent = `${Math.floor(this.health)}/${Math.floor(this.maxHealth)}`;

            if (this.health <= 0) {
                // Boss defeated
                this.alive = false;

                // Play boss defeat sound
                playSound('bossDefeat');

                // Change appearance
                const meshes = [];
                this.mesh.traverse(child => {
                    if (child instanceof THREE.Mesh) {
                        meshes.push(child);
                    }
                });

                meshes.forEach(mesh => {
                    if (mesh.material) {
                        mesh.material.color.set(0x333333);
                        if (mesh.material.emissive) {
                            mesh.material.emissive.set(0x000000);
                        }
                    }
                });

                // Show victory message
                messageEl.textContent = `${this.name} defeated!`;
                messageEl.style.display = 'block';
                messageEl.style.opacity = '1';

                // Hide boss UI
                setTimeout(() => {
                    bossHealthBar.style.display = 'none';
                    bossNameElement.style.display = 'none';
                }, 2000);

                // Spawn door to next level
                spawnNextLevelDoor();

                // Spawn weapon drops and pickups
                handleEnemyDeath();
            } else {
                // Play enemy hit sound
                playSound('enemyHit');

                // Flash on hit
                const meshes = [];
                this.mesh.traverse(child => {
                    if (child instanceof THREE.Mesh) {
                        meshes.push(child);
                    }
                });

                const originalColors = meshes.map(mesh =>
                    mesh.material ? mesh.material.color.clone() : null
                );

                meshes.forEach(mesh => {
                    if (mesh.material) {
                        mesh.material.color.set(0xffffff);
                    }
                });

                setTimeout(() => {
                    meshes.forEach((mesh, index) => {
                        if (mesh.material && originalColors[index]) {
                            mesh.material.color.copy(originalColors[index]);
                        }
                    });
                }, 100);
            }
        },

        showBossUI: function () {
            // Show boss UI
            bossHealthBar.style.display = 'block';
            bossHealthFill.style.width = (this.health / this.maxHealth * 100) + '%';
            bossHealthText.textContent = `${Math.floor(this.health)}/${Math.floor(this.maxHealth)}`;
            bossNameElement.style.display = 'block';
            bossNameElement.textContent = this.name;

            // Show introduction message
            messageEl.textContent = `${this.name} appears!`;
            messageEl.style.display = 'block';
            messageEl.style.opacity = '1';
            setTimeout(() => {
                messageEl.style.opacity = '0';
            }, 2000);
        }
    };

    return boss;
}

// Add special effect methods to boss when it's created
function addSpecialEffectMethodsToBoss(boss) {
    boss.addBurnEffect = function () {
        // Create more detailed burn particle effect
        const burnGroup = new THREE.Group();

        // Create fire particles with low-poly style
        for (let i = 0; i < 12; i++) {
            const particleGeo = new THREE.TetrahedronGeometry(0.1 + Math.random() * 0.1); // Use tetrahedron for low-poly
            const particleMat = new THREE.MeshBasicMaterial({
                color: i % 2 === 0 ? 0xff4500 : 0xffcc00, // Alternate colors
                transparent: true,
                opacity: 0.8,
                flatShading: true
            });
            const particle = new THREE.Mesh(particleGeo, particleMat);

            // Random position around enemy
            const radius = 0.8 * this.scale;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;

            particle.position.set(
                radius * Math.sin(phi) * Math.cos(theta),
                radius * Math.cos(phi) + 1.7 * this.scale,
                radius * Math.sin(phi) * Math.sin(theta)
            );

            // Add rising movement with some horizontal drift
            particle.userData.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.02,
                0.02 + Math.random() * 0.02,
                (Math.random() - 0.5) * 0.02
            );

            burnGroup.add(particle);
        }

        burnGroup.position.copy(this.mesh.position);
        scene.add(burnGroup);

        // Animate fire particles with more dramatic effects
        const startTime = Date.now();
        const effectDuration = 2000; // longer duration for more impact

        const animateFire = () => {
            const elapsed = Date.now() - startTime;
            if (elapsed < effectDuration) {
                // Move particles with acceleration
                burnGroup.children.forEach((particle, index) => {
                    // Accelerate upward over time
                    particle.userData.velocity.y += 0.0003;
                    particle.position.add(particle.userData.velocity);

                    // Random scale for flickering effect
                    const flicker = 0.8 + (Math.sin(elapsed * 0.01 * (index % 3 + 1)) * 0.4);
                    particle.scale.set(flicker, flicker, flicker);

                    // Random rotation for more dynamic look
                    particle.rotation.x += 0.02;
                    particle.rotation.y += 0.01;
                    particle.rotation.z += 0.015;

                    // Fade out with oscillation
                    const fade = 1 - (elapsed / effectDuration);
                    if (particle.material) {
                        particle.material.opacity = fade * 0.8 * (0.7 + Math.sin(elapsed * 0.01) * 0.3);
                    }
                });

                requestAnimationFrame(animateFire);
            } else {
                scene.remove(burnGroup);
            }
        };

        animateFire();
    };

    boss.addFrostEffect = function () {
        // Create frost effect around the enemy
        const frostGroup = new THREE.Group();

        // Create frost particles
        for (let i = 0; i < 12; i++) {
            const particleGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
            const particleMat = new THREE.MeshBasicMaterial({
                color: 0xaaddff,
                transparent: true,
                opacity: 0.7
            });
            const particle = new THREE.Mesh(particleGeo, particleMat);

            // Random position around enemy
            const radius = 1.0 * this.scale;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;

            particle.position.set(
                radius * Math.sin(phi) * Math.cos(theta),
                radius * Math.cos(phi) + 1.5 * this.scale,
                radius * Math.sin(phi) * Math.sin(theta)
            );

            // Random rotation
            particle.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );

            frostGroup.add(particle);
        }

        frostGroup.position.copy(this.mesh.position);
        scene.add(frostGroup);

        // Animate frost particles
        const startTime = Date.now();
        const effectDuration = 1000; // milliseconds

        const animateFrost = () => {
            const elapsed = Date.now() - startTime;
            if (elapsed < effectDuration) {
                // Rotate particles slowly
                frostGroup.children.forEach(particle => {
                    particle.rotation.x += 0.01;
                    particle.rotation.y += 0.01;

                    // Fade out
                    const fade = 1 - (elapsed / effectDuration);
                    if (particle.material) {
                        particle.material.opacity = fade * 0.7;
                    }
                });

                requestAnimationFrame(animateFrost);
            } else {
                scene.remove(frostGroup);
            }
        };

        animateFrost();
    };

    boss.addSoulDrainEffect = function () {
        // Create soul drain effect
        const drainGroup = new THREE.Group();

        // Create particles that flow from enemy to player
        for (let i = 0; i < 6; i++) {
            const particleGeo = new THREE.SphereGeometry(0.06, 4, 4);
            const particleMat = new THREE.MeshBasicMaterial({
                color: 0xcc66ff,
                transparent: true,
                opacity: 0.7
            });
            const particle = new THREE.Mesh(particleGeo, particleMat);

            // Start at random position on enemy
            const radius = 0.5 * this.scale;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;

            particle.position.set(
                radius * Math.sin(phi) * Math.cos(theta),
                radius * Math.cos(phi) + 1.5 * this.scale,
                radius * Math.sin(phi) * Math.sin(theta)
            );

            drainGroup.add(particle);
        }

        drainGroup.position.copy(this.mesh.position);
        scene.add(drainGroup);

        // Animate particles to flow toward player
        const startTime = Date.now();
        const effectDuration = 800; // milliseconds

        // Calculate vector from enemy to player
        const toPlayer = new THREE.Vector3();

        const animateDrain = () => {
            const elapsed = Date.now() - startTime;
            if (elapsed < effectDuration) {
                // Get current direction to player
                toPlayer.subVectors(player.position, this.mesh.position).normalize();

                // Move particles toward player
                drainGroup.children.forEach(particle => {
                    // Progress determines speed (accelerate as they get closer)
                    const progress = elapsed / effectDuration;
                    const speed = 0.05 + (progress * 0.1);

                    // Move toward player
                    particle.position.add(toPlayer.clone().multiplyScalar(speed));

                    // Fade out at the end
                    if (progress > 0.7) {
                        const fade = 1 - ((progress - 0.7) / 0.3);
                        if (particle.material) {
                            particle.material.opacity = fade * 0.7;
                        }
                    }
                });

                requestAnimationFrame(animateDrain);
            } else {
                scene.remove(drainGroup);
            }
        };

        animateDrain();
    };

    boss.updateStatusEffects = function (deltaTime) {
        const now = Date.now();

        // Update burn effect
        if (this.statusEffects.burn.active) {
            // Apply damage over time
            if (now >= this.statusEffects.burn.nextTickTime) {
                // Take burn damage
                this.health -= this.statusEffects.burn.damage;
                if (this.health < 0) this.health = 0;

                console.log(`Burn tick: ${this.statusEffects.burn.damage} damage applied, health now ${this.health}/${this.maxHealth}`);

                // Update boss health bar
                bossHealthFill.style.width = (this.health / this.maxHealth * 100) + '%';
                bossHealthText.textContent = `${Math.floor(this.health)}/${Math.floor(this.maxHealth)}`;

                // Add small fire visual
                this.addBurnEffect();

                // Schedule next tick
                this.statusEffects.burn.nextTickTime = now + this.statusEffects.burn.tickInterval;
            }

            // Check if effect has expired
            if (now > this.statusEffects.burn.endTime) {
                console.log('Burn effect expired');
                this.statusEffects.burn.active = false;
            }

            // Check if dead from burn
            if (this.health <= 0 && this.alive) {
                console.log('Boss killed by burn effect');
                this.takeDamage(0); // Call takeDamage with 0 to handle death
            }
        }

        // Update slow effect
        if (this.statusEffects.slow.active) {
            // Check if effect has expired
            if (now > this.statusEffects.slow.endTime) {
                console.log('Slow effect expired, restoring original speed and attack rate');
                // Restore original values
                this.speed = this.statusEffects.slow.originalSpeed;
                this.attackCooldown = this.statusEffects.slow.originalAttackCooldown;
                this.statusEffects.slow.active = false;
            }
        }
    };

    return boss;
}

// Update projectiles function (change to only handle boss projectiles)
function updateProjectiles(deltaTime, frustum) {
    // Since player no longer uses projectiles, this only handles boss projectiles
    const now = Date.now();

    for (let i = projectiles.length - 1; i >= 0; i--) {
        const projectile = projectiles[i];

        // Move projectile
        projectile.position.add(projectile.userData.direction.clone().multiplyScalar(projectile.userData.speed));

        // Check for lifetime
        if (now - projectile.userData.born > projectile.userData.lifetime) {
            scene.remove(projectile);
            projectiles.splice(i, 1);
            continue;
        }

        // Only perform collision detection if projectile is in view frustum or near player
        const isNearPlayer = player.mesh && projectile.position.distanceTo(player.position) < 2;
        const isInView = isInFrustum(frustum, projectile);

        if (isInView || isNearPlayer) {
            // Check for collision with player
            if (player.mesh && projectile.position.distanceTo(player.position) < 0.5) {
                player.takeDamage(projectile.userData.damage);
                scene.remove(projectile);
                projectiles.splice(i, 1);
            }
        }
    }
}

// Set up controls
function setupControls() {
    // Track pitch and yaw for camera rotation
    let pitch = 0;
    let yaw = 0;

    // Mobile control variables
    let joystickActive = false;
    let joystickTouchId = null;
    let joystickOrigin = { x: 0, y: 0 };
    let lookTouchId = null;
    let lastTouchX = 0;
    let lastTouchY = 0;

    // Function to adjust touch coordinates for UI scaling
    const adjustTouchForScaling = (touch) => {
        // Since we're using 0.75 scale, we need to adjust touch coordinates
        // This helps match touch coordinates with the scaled UI elements
        if (!isMobile) return touch;

        const scaleFactor = 0.75;
        const joystickRect = joystickContainer.getBoundingClientRect();
        const attackRect = attackButton.getBoundingClientRect();

        // Clone the touch to avoid modifying the original
        const adjustedTouch = {
            clientX: touch.clientX,
            clientY: touch.clientY,
            identifier: touch.identifier
        };

        // Only adjust if the touch is within or near the controls
        if (touch.clientX < window.innerWidth * 0.4 && touch.clientY > window.innerHeight * 0.6) {
            // Touch is in joystick area - adjust coordinates
            const centerX = joystickRect.left + joystickRect.width / 2;
            const centerY = joystickRect.top + joystickRect.height / 2;

            adjustedTouch.clientX = centerX + (touch.clientX - centerX) / scaleFactor;
            adjustedTouch.clientY = centerY + (touch.clientY - centerY) / scaleFactor;
        }
        else if (touch.clientX > window.innerWidth * 0.6 && touch.clientY > window.innerHeight * 0.6) {
            // Touch is in attack button area - adjust coordinates
            const centerX = attackRect.left + attackRect.width / 2;
            const centerY = attackRect.top + attackRect.height / 2;

            adjustedTouch.clientX = centerX + (touch.clientX - centerX) / scaleFactor;
            adjustedTouch.clientY = centerY + (touch.clientY - centerY) / scaleFactor;
        }

        return adjustedTouch;
    };

    // Show mobile controls if on a mobile device
    if (isMobile) {
        mobileControls.style.display = 'block';
        // Update the controls instructions text
        controls.innerHTML = "Virtual joystick: Move | Touch screen: Look | Red button: Attack";
    }

    // Mouse controls for looking
    const onMouseMove = (event) => {
        if (!isRunning) return;

        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;

        // Update yaw (horizontal rotation) and pitch (vertical rotation)
        const rotSpeed = 0.002;
        yaw -= movementX * rotSpeed;
        pitch -= movementY * rotSpeed;

        // Clamp pitch to prevent over-rotation
        pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));

        // Apply rotations to camera
        camera.rotation.x = pitch;
        camera.rotation.y = yaw;
    };

    // Keyboard controls
    const onKeyDown = (event) => {
        switch (event.code) {
            case 'KeyW':
                moveForward = true;
                break;
            case 'KeyS':
                moveBackward = true;
                break;
            case 'KeyA':
                moveLeft = true;
                break;
            case 'KeyD':
                moveRight = true;
                break;
        }
    };

    const onKeyUp = (event) => {
        switch (event.code) {
            case 'KeyW':
                moveForward = false;
                break;
            case 'KeyS':
                moveBackward = false;
                break;
            case 'KeyA':
                moveLeft = false;
                break;
            case 'KeyD':
                moveRight = false;
                break;
        }
    };

    // Touch controls for mobile
    const onJoystickStart = (event) => {
        if (!isRunning) return;

        // Prevent default to avoid browser handling of touch events
        event.preventDefault();

        // Only process if we don't already have an active touch
        if (!joystickActive) {
            joystickActive = true;
            joystickTouchId = event.changedTouches[0].identifier;
            const touch = adjustTouchForScaling(event.changedTouches[0]);

            // Calculate touch position relative to joystick container
            const rect = joystickContainer.getBoundingClientRect();
            joystickOrigin.x = rect.left + rect.width / 2;
            joystickOrigin.y = rect.top + rect.height / 2;

            // Update joystick position
            updateJoystickPosition(touch.clientX, touch.clientY);
        }
    };

    const onJoystickMove = (event) => {
        if (!isRunning || !joystickActive) return;

        // Prevent default to avoid browser handling of touch events
        event.preventDefault();

        // Find our touch
        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            if (touch.identifier === joystickTouchId) {
                // Apply scaling adjustment
                const adjustedTouch = adjustTouchForScaling(touch);
                // Update joystick position
                updateJoystickPosition(adjustedTouch.clientX, adjustedTouch.clientY);
                break;
            }
        }
    };

    const onJoystickEnd = (event) => {
        if (!isRunning) return;

        // Prevent default to avoid browser handling of touch events
        event.preventDefault();

        // Check if our touch ended
        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            if (touch.identifier === joystickTouchId) {
                // Reset joystick
                joystickActive = false;
                joystick.style.transform = 'translate(-50%, -50%)';

                // Reset movement flags
                moveForward = false;
                moveBackward = false;
                moveLeft = false;
                moveRight = false;
                break;
            }
        }
    };

    const updateJoystickPosition = (touchX, touchY) => {
        // Calculate delta from center of joystick container
        let deltaX = touchX - joystickOrigin.x;
        let deltaY = touchY - joystickOrigin.y;

        // Calculate distance from center
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Limit joystick movement to container bounds
        const maxDistance = joystickContainer.clientWidth / 2;
        if (distance > maxDistance) {
            deltaX = deltaX * maxDistance / distance;
            deltaY = deltaY * maxDistance / distance;
        }

        // Update joystick visual position
        joystick.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;

        // Update movement flags based on joystick position
        // Use a small dead zone for better control
        const deadZone = 10;
        const normalizedX = Math.abs(deltaX) < deadZone ? 0 : deltaX / maxDistance;
        const normalizedY = Math.abs(deltaY) < deadZone ? 0 : deltaY / maxDistance;

        moveForward = normalizedY < -0.3;
        moveBackward = normalizedY > 0.3;
        moveLeft = normalizedX < -0.3;
        moveRight = normalizedX > 0.3;
    };

    // Touch controls for looking around
    const onLookStart = (event) => {
        if (!isRunning) return;

        // Get the touch location
        const touch = event.changedTouches[0];

        // Skip if touch is within joystick container or attack button boundaries
        const joystickRect = joystickContainer.getBoundingClientRect();
        const attackRect = attackButton.getBoundingClientRect();

        if (
            // Check if touch is within joystick area
            (touch.clientX >= joystickRect.left &&
                touch.clientX <= joystickRect.right &&
                touch.clientY >= joystickRect.top &&
                touch.clientY <= joystickRect.bottom) ||
            // Check if touch is within attack button area
            (touch.clientX >= attackRect.left &&
                touch.clientX <= attackRect.right &&
                touch.clientY >= attackRect.top &&
                touch.clientY <= attackRect.bottom)
        ) {
            return;
        }

        // Prevent default to avoid browser handling of touch events
        event.preventDefault();

        // Only process if we don't already have an active look touch
        if (lookTouchId === null) {
            lookTouchId = touch.identifier;
            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
        }
    };

    const onLookMove = (event) => {
        if (!isRunning || lookTouchId === null) return;

        // Prevent default to avoid browser handling of touch events
        event.preventDefault();
        event.stopPropagation();

        // Find our touch
        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            if (touch.identifier === lookTouchId) {
                // Calculate movement
                const movementX = touch.clientX - lastTouchX;
                const movementY = touch.clientY - lastTouchY;

                // Update last position
                lastTouchX = touch.clientX;
                lastTouchY = touch.clientY;

                // Update yaw (horizontal rotation) and pitch (vertical rotation)
                // Adjust sensitivity for mobile (typically needs higher sensitivity)
                const rotSpeed = 0.006; // Increased from 0.005 for better mobile response with scaling
                yaw -= movementX * rotSpeed;
                pitch -= movementY * rotSpeed;

                // Clamp pitch to prevent over-rotation
                pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));

                // Apply rotations to camera
                camera.rotation.x = pitch;
                camera.rotation.y = yaw;

                break;
            }
        }
    };

    const onLookEnd = (event) => {
        if (!isRunning) return;

        // Prevent default to avoid browser handling of touch events
        event.preventDefault();

        // Check if our touch ended
        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            if (touch.identifier === lookTouchId) {
                lookTouchId = null;
                break;
            }
        }
    };

    // Attack button handler
    const onAttackButtonTap = (event) => {
        if (!isRunning) return;

        // Prevent default to avoid browser handling of touch events
        event.preventDefault();

        // Call player attack function
        player.shoot();
    };

    // Mouse click to shoot
    const onClick = () => {
        if (!isRunning) return;
        player.shoot();
    };

    // Add event listeners for desktop
    document.addEventListener('mousemove', onMouseMove, false);
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);
    document.addEventListener('click', onClick, false);

    // Add event listeners for mobile
    if (isMobile) {
        // Joystick controls - register with high priority for touch events
        joystickContainer.addEventListener('touchstart', onJoystickStart, { passive: false, capture: true });
        joystickContainer.addEventListener('touchmove', onJoystickMove, { passive: false, capture: true });
        joystickContainer.addEventListener('touchend', onJoystickEnd, { passive: false, capture: true });
        joystickContainer.addEventListener('touchcancel', onJoystickEnd, { passive: false, capture: true });

        // Attack button - also high priority
        attackButton.addEventListener('touchstart', onAttackButtonTap, { passive: false, capture: true });

        // Look controls - lower priority (bubbling phase)
        document.addEventListener('touchstart', onLookStart, { passive: false });
        document.addEventListener('touchmove', onLookMove, { passive: false });
        document.addEventListener('touchend', onLookEnd, { passive: false });
        document.addEventListener('touchcancel', onLookEnd, { passive: false });
    }

    // Request pointer lock when game starts (desktop only)
    if (!isMobile) {
        document.addEventListener('click', () => {
            if (isRunning && document.pointerLockElement !== document.body) {
                document.body.requestPointerLock();
            }
        });
    }
}

// Animation loop
function animate() {
    if (!isRunning) return;

    try {
        // Get delta time
        const deltaTime = clock.getDelta();
        const time = Date.now() * 0.001; // Current time in seconds
        const now = Date.now(); // Current time in milliseconds for throttling

        // Create a frustum for culling objects outside camera view
        const frustum = new THREE.Frustum();
        const projScreenMatrix = new THREE.Matrix4();
        projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projScreenMatrix);

        // Update player
        try {
            if (player && typeof player.update === 'function') {
                player.update(deltaTime);
            } else {
                console.warn("Player update skipped: player object or update method missing");
            }
        } catch (playerError) {
            console.error("Error updating player:", playerError);
        }

        // Update enemy/boss
        try {
            if (enemy && enemy.alive && typeof enemy.update === 'function') {
                enemy.update(deltaTime);

                // Update status effects on the enemy
                if (typeof enemy.updateStatusEffects === 'function') {
                    enemy.updateStatusEffects(deltaTime);
                }
            }
        } catch (enemyError) {
            console.error("Error updating enemy:", enemyError);
        }

        // Update projectiles
        try {
            updateProjectiles(deltaTime, frustum);
        } catch (projectileError) {
            console.error("Error updating projectiles:", projectileError);
        }

        // Update all animated objects
        try {
            for (let i = animatedObjects.length - 1; i >= 0; i--) {
                const obj = animatedObjects[i];

                // Skip if removed from scene
                if (!obj.parent) {
                    animatedObjects.splice(i, 1);
                    continue;
                }

                // Skip updating objects outside camera frustum
                if (!isInFrustum(frustum, obj)) {
                    // Object is outside view, skip expensive updates
                    continue;
                }

                // Calculate player distance for optimization if object and player have positions
                let skipUpdate = false;
                if (obj.position && player.position) {
                    const distanceToPlayer = player.position.distanceTo(obj.position);
                    if (distanceToPlayer > 20) {
                        // For very distant objects, update at reduced frequency
                        // This creates a progressive LOD system for animations
                        if (now % 200 !== 0) {  // Only update every 200ms
                            skipUpdate = true;
                        }
                    }
                }

                if (skipUpdate) continue;

                // Get animation parameters
                const animType = obj.userData.animationType;
                if (!animType) continue; // Skip if no animation type defined

                const speed = obj.userData.speed || 1;
                const offset = obj.userData.offset || 0;
                const baseY = obj.userData.baseY;

                // Update based on animation type
                switch (animType) {
                    case 'fire':
                        // Animate fire particles with enhanced effects
                        if (baseY !== undefined) {
                            // Improved vertical movement with more variance
                            obj.position.y = baseY + Math.sin(time * speed + offset) * 0.3;

                            // Dynamic scale with more natural variation
                            const scale = 0.8 + Math.sin(time * speed * 2 + offset) * 0.2;
                            obj.scale.set(scale, scale, scale);

                            // Add rotation animation for more dynamic movement
                            if (obj.userData.rotationSpeed) {
                                obj.rotation.y += obj.userData.rotationSpeed;
                                obj.rotation.x += obj.userData.rotationSpeed * 0.5;
                            }

                            // Enhanced opacity and color effects
                            if (obj.material) {
                                // More dynamic opacity for realistic flickering
                                obj.material.opacity = 0.5 + Math.sin(time * speed * 3 + offset) * 0.3;

                                // Improved color shifting for realistic fire
                                const r = 1.0;
                                const g = 0.3 + Math.sin(time * 2 + offset) * 0.3;
                                const b = 0.05 + Math.sin(time * 3 + offset) * 0.05;
                                obj.material.color.setRGB(r, g, b);
                            }
                        }
                        break;

                    case 'ember':
                        // Animate glowing embers in the fire pit
                        if (obj.material && obj.material.emissive) {
                            // Pulsating emissive intensity
                            const pulseIntensity = 0.5 + Math.sin(time * speed + offset) * 0.5;
                            obj.material.emissiveIntensity = pulseIntensity;

                            // Subtle color temperature shifts
                            const r = 0.5 + 0.5 * Math.sin(time * 0.5 + offset);
                            const g = 0.2 * Math.sin(time * 0.3 + offset);
                            obj.material.emissive.setRGB(r, g, 0);

                            // Very subtle scale changes
                            const emberScale = 1 + Math.sin(time * 0.7 + offset) * 0.05;
                            obj.scale.set(emberScale, emberScale, emberScale);
                        }
                        break;

                    case 'fireLight':
                        // Enhanced light flickering for fire
                        if (obj.intensity !== undefined) {
                            // More natural intensity variation
                            obj.intensity = 0.4 + Math.sin(time * 3 + offset) * 0.25;

                            // Enhanced color temperature variation
                            const r = 1.0;
                            const g = 0.4 + 0.3 * Math.sin(time * 2 + offset);
                            const b = 0.1 + 0.1 * Math.sin(time * 3 + offset);
                            obj.color.setRGB(r, g, b);
                        }
                        break;

                    case 'ice':
                        // Enhanced ice crystal animations
                        if (baseY !== undefined) {
                            // Subtle hovering motion
                            obj.position.y = baseY + Math.sin(time * 0.7 * speed + offset) * 0.1;

                            // Subtle size pulsing
                            const iceScale = 1 + Math.sin(time * speed + offset) * 0.05;
                            obj.scale.set(iceScale, iceScale, iceScale);

                            // Enhanced shimmer effect
                            if (obj.material) {
                                obj.material.opacity = 0.7 + Math.sin(time * speed * 2 + offset) * 0.2;

                                // More subtle and varied blue tones
                                const r = 0.5 + 0.2 * Math.sin(time + offset);
                                const g = 0.7 + 0.2 * Math.sin(time * 1.2 + offset);
                                const b = 0.9 + 0.1 * Math.sin(time * 1.5 + offset);
                                obj.material.color.setRGB(r, g, b);
                            }
                        }
                        break;

                    case 'iceLight':
                        // Enhanced ice light effects
                        if (obj.intensity !== undefined) {
                            // Subtle shimmer in light intensity
                            obj.intensity = 0.6 + Math.sin(time * 1.5 + offset) * 0.2;

                            // Enhanced blue-white color variation
                            const r = 0.6 + 0.2 * Math.sin(time * 1.2 + offset);
                            const g = 0.7 + 0.2 * Math.sin(time * 1.5 + offset);
                            const b = 1.0;
                            obj.color.setRGB(r, g, b);
                        }
                        break;

                    case 'poison':
                        // Enhanced poison cloud animations
                        if (baseY !== undefined) {
                            // More dramatic floating motion
                            obj.position.y = baseY + Math.sin(time * 0.5 * speed + offset) * 0.2;

                            // Pulsing size with more variance
                            const poisonScale = 0.9 + Math.sin(time * 0.8 * speed + offset) * 0.15;
                            obj.scale.set(poisonScale, poisonScale, poisonScale);

                            // Enhanced toxic effects
                            if (obj.material) {
                                // Dynamic opacity for toxic cloud effect
                                obj.material.opacity = 0.6 + Math.sin(time * speed + offset) * 0.3;

                                // More dynamic color shifting between green and purple
                                const phase = Math.sin(time + offset);
                                // Blend between green and purple based on phase
                                const r = 0.3 + phase * 0.3;
                                const g = 0.7 - phase * 0.4;
                                const b = 0.3 + phase * 0.4;
                                obj.material.color.setRGB(r, g, b);
                            }
                        }
                        break;

                    case 'poisonLight':
                        // Enhanced poison light effects
                        if (obj.intensity !== undefined) {
                            // More dynamic light pulsing
                            obj.intensity = 0.4 + Math.sin(time * 2 + offset) * 0.3;

                            // More gradual color shifting
                            const phase = Math.sin(time * 1.5 + offset);
                            const r = 0.2 + 0.2 * phase;
                            const g = 0.6 + 0.3 * (1 - Math.abs(phase));
                            const b = 0.2 + 0.5 * (phase > 0 ? 0 : -phase);
                            obj.color.setRGB(r, g, b);
                        }
                        break;

                    case 'gear':
                        // Rotate gears based on their speed
                        if (obj.userData.rotSpeed) {
                            obj.rotation.y += obj.userData.rotSpeed * deltaTime;
                        }
                        break;

                    case 'gearLight':
                        // Mechanical light flickering
                        if (obj.intensity !== undefined) {
                            // Subtle intensity fluctuations
                            obj.intensity = 0.6 + Math.sin(time * 1.5 + offset) * 0.1;

                            // Warm gold/copper color shifts
                            const r = 1.0;
                            const g = 0.7 + 0.1 * Math.sin(time + offset);
                            const b = 0.3 + 0.1 * Math.sin(time * 0.8 + offset);
                            obj.color.setRGB(r, g, b);
                        }
                        break;

                    case 'undeadLight':
                        // Eerie pulsing light for undead decorations
                        if (obj.intensity !== undefined) {
                            // Dramatic pulsing
                            obj.intensity = 0.4 + Math.sin(time * 0.8 + offset) * 0.3;

                            // Shift between green and purple tints
                            const phase = Math.sin(time * 0.5 + offset);
                            const r = 0.1 + 0.2 * Math.max(0, -phase);
                            const g = 0.6 + 0.3 * Math.max(0, phase);
                            const b = 0.1 + 0.4 * Math.max(0, -phase);
                            obj.color.setRGB(r, g, b);
                        }
                        break;

                    // Add a default case for unhandled animation types
                    default:
                        // No animation for unhandled types
                        break;
                }
            }
        } catch (animError) {
            console.error("Error updating animations:", animError);
        }

        // Check for pickups
        try {
            checkPickups();
        } catch (pickupError) {
            console.error("Error checking pickup collisions:", pickupError);
        }

        // Check for door collision
        try {
            checkDoorCollision();
        } catch (doorError) {
            console.error("Error checking door collision:", doorError);
        }

        // Ensure boss UI is visible during combat
        try {
            ensureBossUIVisible();
        } catch (uiError) {
            console.error("Error ensuring boss UI visibility:", uiError);
        }

        // Render scene
        renderer.render(scene, camera);
    } catch (error) {
        console.error("Error in animation loop:", error);
        messageEl.textContent = "Game error: " + error.message;
        messageEl.style.display = 'block';
        messageEl.style.opacity = '1';

        // Don't immediately stop the game for minor errors
        if (error.fatal) {
            isRunning = false;
            console.error("Fatal error - stopping game loop");
        }
    }
}

// Handle window resize
function onWindowResize() {
    if (!camera || !renderer) return;

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Game over
function gameOver() {
    isRunning = false;

    // Update game over screen with final stats
    document.getElementById('finalRoomStat').textContent = (currentRoomIndex + 1);
    document.getElementById('finalStrengthStat').textContent = player.strength.toFixed(1);
    document.getElementById('finalWeaponStat').textContent = player.weapon;

    // Show game over screen with animation
    const gameOverScreen = document.getElementById('gameOverScreen');
    gameOverScreen.style.display = 'flex';
    gameOverScreen.style.opacity = '0';

    // Fade in animation
    setTimeout(() => {
        gameOverScreen.style.opacity = '1';
        gameOverScreen.style.transition = 'opacity 1s';
    }, 10);

    // Hide game UI
    crosshair.style.display = 'none';
    controls.style.display = 'none';
    statsPanel.style.display = 'none';
    weaponDisplay.style.display = 'none';

    // Release pointer lock
    document.exitPointerLock();
}

// Restart game function
function restartGame() {
    // Hide game over screen
    document.getElementById('gameOverScreen').style.display = 'none';

    // Reset game state
    currentRoomIndex = 0;

    // Clear scene
    clearScene();

    // Make sure we stop any ongoing animation loops
    isRunning = false;

    // Reset clock to ensure consistent timing on restart
    if (clock) {
        clock.stop();
        clock.start();
    }

    // Handle stats properly - stats doesn't have a reset method
    if (stats && stats.dom && stats.dom.parentNode) {
        // Remove the stats DOM element
        stats.dom.parentNode.removeChild(stats.dom);
        stats = null; // Let init() create a new stats instance
    }

    // Clean up renderer
    if (renderer) {
        // Remove renderer from DOM
        if (renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        renderer.dispose();
        renderer = null;
    }

    // Small delay to ensure proper cleanup before restarting
    setTimeout(() => {
        // Reinitialize
        init();

        // Request pointer lock
        document.body.requestPointerLock();
    }, 200); // Increased delay to 200ms for more thorough cleanup
}

// Clear scene and reset game state
function clearScene() {
    // Clear all game objects
    while (scene && scene.children.length > 0) {
        scene.remove(scene.children[0]);
    }

    // Clear arrays
    if (projectilePool && typeof projectilePool.releaseAll === 'function') {
        projectilePool.releaseAll();
    }

    projectiles.length = 0;
    animatedObjects.length = 0;
    pickups.length = 0;
    rooms.length = 0;

    // Reset player
    player = null;
    enemy = null;
    exitDoor = null;

    // Reset light count
    lightCount = 0;

    // Show UI elements
    crosshair.style.display = 'block';
    controls.style.display = 'block';
    statsPanel.style.display = 'block';
    weaponDisplay.style.display = 'block';
    healthBar.style.display = 'block';

    // Hide boss UI
    bossHealthBar.style.display = 'none';
    bossNameElement.style.display = 'none';

    // Clear any ongoing intervals or timeouts
    clearBossAttackInterval();
}

// Add start button event
startButton.addEventListener('click', () => {
    // Hide start button
    startButton.style.display = 'none';

    // Hide title elements
    document.getElementById('gameTitle').style.display = 'none';
    document.getElementById('titleBackground').style.display = 'none';

    // Initialize game
    init();

    // Request pointer lock (only on desktop)
    if (!isMobile) {
        document.body.requestPointerLock();
    }
});

// Add restart button event listener
document.getElementById('restartButton').addEventListener('click', restartGame);

// Log that script loaded
console.log("Script loaded successfully");

function createWeaponPickup(position, weaponType) {
    console.log(`Creating weapon pickup: ${weaponType} at position ${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}`);

    const pickup = new THREE.Group();

    // Create either a sword pickup
    let pickupMesh;
    let pickupColor = 0xffffff;

    // Different visuals based on weapon type
    switch (weaponType) {
        case 'Fire Blade':
            pickupColor = 0xff5500;
            break;
        case 'Ice Saber':
            pickupColor = 0x00ccff;
            break;
        case 'Soul Reaver':
            pickupColor = 0x9933ff;
            break;
        default: // Basic Sword
            pickupColor = 0xcccccc;
    }

    // Create sword-shaped pickup
    const bladeGeo = new THREE.BoxGeometry(0.1, 0.4, 0.05);
    const bladeMat = new THREE.MeshBasicMaterial({ color: pickupColor });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.y = 0.1;
    pickup.add(blade);

    // Create handle
    const handleGeo = new THREE.BoxGeometry(0.05, 0.15, 0.05);
    const handleMat = new THREE.MeshBasicMaterial({ color: 0x8B4513 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.y = -0.15;
    pickup.add(handle);

    // Set position
    pickup.position.copy(position);
    pickup.position.y = 0.5; // Slightly above ground

    // Store weapon type
    pickup.userData.type = 'weapon';
    pickup.userData.weaponType = weaponType;

    // Add to scene and pickups array
    scene.add(pickup);
    pickups.push(pickup);
    console.log(`Pickup added to scene. Total pickups: ${pickups.length}`);

    // Make it float and rotate
    pickup.userData.rotationSpeed = 0.02;
    pickup.userData.floatOffset = Math.random() * Math.PI * 2;
}

// When player collects a weapon, update the weapon logic
function checkPickups() {
    // Debug - log number of pickups
    if (pickups.length > 0) {
        console.log(`Checking ${pickups.length} pickups`);
    }

    for (let i = pickups.length - 1; i >= 0; i--) {
        const pickup = pickups[i];

        // Float and rotate animation
        pickup.rotation.y += pickup.userData.rotationSpeed;
        pickup.position.y = 0.5 + Math.sin(Date.now() / 500 + pickup.userData.floatOffset) * 0.1;

        const distance = player.position.distanceTo(pickup.position);
        // Debug - log close pickups
        if (distance < 3) {
            console.log(`Close to pickup: ${pickup.userData.type}, distance: ${distance.toFixed(2)}`);
        }

        if (distance < 1.5) {
            console.log(`Collecting pickup: ${pickup.userData.type}`);
            // Handle pickup based on type
            if (pickup.userData.type === 'weapon') {
                console.log(`Setting weapon to: ${pickup.userData.weaponType}`);
                player.weapon = pickup.userData.weaponType;
                updateWeaponDisplay();
                playSound('powerup');
            } else if (pickup.userData.type === 'health') {
                player.health = Math.min(player.maxHealth, player.health + pickup.userData.amount);
                updateHealthDisplay();
                playSound('healthPickup');
            } else if (pickup.userData.type === 'strength') {
                player.strength += 0.1;
                updateStrengthDisplay();
                playSound('powerup');
            }

            // Remove pickup
            scene.remove(pickup);
            pickups.splice(i, 1);
        }
    }
}

// Function to update health display
function updateHealthDisplay() {
    if (healthFill && player) {
        healthFill.style.width = (player.health / player.maxHealth * 100) + '%';
    }
}

// Function to update weapon display
function updateWeaponDisplay() {
    if (currentWeapon && player) {
        currentWeapon.textContent = player.weapon;

        // Set color based on weapon type
        let color = '#cccccc';
        switch (player.weapon) {
            case 'Fire Blade':
                color = '#ff5500';
                break;
            case 'Ice Saber':
                color = '#00ccff';
                break;
            case 'Soul Reaver':
                color = '#9933ff';
                break;
        }
        currentWeapon.style.color = color;
    }
}

// Function to update level display
function updateLevelDisplay() {
    if (roomStat) {
        roomStat.textContent = currentRoomIndex + 1;
    }
}

// Function to update strength display
function updateStrengthDisplay() {
    if (strengthStat && player) {
        strengthStat.textContent = player.strength.toFixed(1);
    }
}

// Create player mesh function
function createPlayerMesh() {
    // Player mesh is simple since this is a first-person game
    // and player won't see themselves
    const playerGroup = new THREE.Group();

    // Simple collision cylinder for the player
    const bodyGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1.5, 8);
    const bodyMaterial = new THREE.MeshBasicMaterial({
        color: 0x0000ff,
        wireframe: true,
        visible: false // Invisible in first-person
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.75; // Half height
    playerGroup.add(body);

    return playerGroup;
}

// Initialize the player with default setup
function initPlayer() {
    // Create player mesh
    player = createPlayer();

    // Override the default weapon with a sword
    player.weapon = 'Basic Sword';

    // Make sure the player has the attackWithSword method
    if (!player.attackWithSword) {
        player.attackWithSword = function () {
            return this.shoot();
        };
    }

    // Set initial position
    player.position = new THREE.Vector3(0, 1, 0);
    player.mesh.position.copy(player.position);

    updateHealthDisplay();
    updateWeaponDisplay();
}

// In enemy class or functions
function handleEnemyDeath() {
    console.log("handleEnemyDeath called - dropping weapons");

    // Drop item based on boss level
    const dropPosition = enemy.mesh.position.clone();
    console.log(`Boss position: ${dropPosition.x.toFixed(1)}, ${dropPosition.y.toFixed(1)}, ${dropPosition.z.toFixed(1)}`);

    // Different drops based on level
    if (currentRoomIndex === 1) {
        // Level 1 boss drops Fire Blade
        console.log("Creating Fire Blade");
        createWeaponPickup(dropPosition, 'Fire Blade');
    } else if (currentRoomIndex === 2) {
        // Level 2 boss drops Ice Saber
        console.log("Creating Ice Saber");
        createWeaponPickup(dropPosition, 'Ice Saber');
    } else if (currentRoomIndex === 3) {
        // Level 3 boss drops Soul Reaver
        console.log("Creating Soul Reaver");
        createWeaponPickup(dropPosition, 'Soul Reaver');
    } else {
        // Random drops for higher levels
        const weapons = ['Fire Blade', 'Ice Saber', 'Soul Reaver'];
        const weaponType = weapons[Math.floor(Math.random() * weapons.length)];
        console.log(`Creating random weapon: ${weaponType}`);
        createWeaponPickup(dropPosition, weaponType);
    }

    // Also drop health or strength
    if (Math.random() < 0.5) {
        console.log("Creating health pickup");
        createHealthPickup(dropPosition.clone().add(new THREE.Vector3(1, 0, 1)));
    } else {
        console.log("Creating strength pickup");
        createStrengthPickup(dropPosition.clone().add(new THREE.Vector3(-1, 0, 1)));
    }
}

// Function to create health pickup
function createHealthPickup(position) {
    const pickup = new THREE.Group();

    // Create health pack visual
    const baseGeo = new THREE.BoxGeometry(0.4, 0.1, 0.4);
    const baseMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const base = new THREE.Mesh(baseGeo, baseMat);
    pickup.add(base);

    const crossGeo = new THREE.BoxGeometry(0.1, 0.15, 0.3);
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const crossV = new THREE.Mesh(crossGeo, crossMat);
    crossV.position.y = 0.1;
    pickup.add(crossV);

    const crossHGeo = new THREE.BoxGeometry(0.3, 0.15, 0.1);
    const crossH = new THREE.Mesh(crossHGeo, crossMat);
    crossH.position.y = 0.1;
    pickup.add(crossH);

    // Set position
    pickup.position.copy(position);
    pickup.position.y = 0.5; // Slightly above ground

    // Store health pack info
    pickup.userData.type = 'health';
    pickup.userData.amount = 25; // Amount to heal

    // Add to scene and pickups array
    scene.add(pickup);
    pickups.push(pickup);

    // Make it float and rotate
    pickup.userData.rotationSpeed = 0.02;
    pickup.userData.floatOffset = Math.random() * Math.PI * 2;

    return pickup;
}

// Function to create strength pickup
function createStrengthPickup(position) {
    const pickup = new THREE.Group();

    // Create strength boost visual
    const baseGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8);
    const baseMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
    const base = new THREE.Mesh(baseGeo, baseMat);
    pickup.add(base);

    const sphereGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.y = 0.15;
    pickup.add(sphere);

    // Set position
    pickup.position.copy(position);
    pickup.position.y = 0.5; // Slightly above ground

    // Store strength boost info
    pickup.userData.type = 'strength';
    pickup.userData.amount = 0.1; // Amount to boost strength

    // Add to scene and pickups array
    scene.add(pickup);
    pickups.push(pickup);

    // Make it float and rotate
    pickup.userData.rotationSpeed = 0.02;
    pickup.userData.floatOffset = Math.random() * Math.PI * 2;

    return pickup;
}

// Function for boss attack interval clearing
function clearBossAttackInterval() {
    // If we have any interval timers for boss attacks, clear them
    if (window.bossAttackInterval) {
        clearInterval(window.bossAttackInterval);
        window.bossAttackInterval = null;
    }
}

// Function to generate a new room
function generateRoom() {
    // Determine new room theme
    const themes = ['fire', 'ice', 'undead', 'mechanical'];
    const nextTheme = themes[currentRoomIndex % themes.length];

    // Create new room
    createRoom(nextTheme, currentRoomIndex + 1);

    // Reset player position
    camera.position.set(0, 1.7, 8);
    player.position.copy(camera.position);

    // Small health recovery
    player.health = Math.min(player.maxHealth, player.health + 20);
    updateHealthDisplay();

    // Show level transition message
    player.showPickupMessage(`Entered Room ${currentRoomIndex + 1}`);
}

// Function to spawn a new boss
function spawnBoss() {
    // Calculate difficulty increase
    const difficulty = 1 + currentRoomIndex * 0.3;

    // Determine theme based on current room
    const themes = ['fire', 'ice', 'undead', 'mechanical'];
    const theme = themes[currentRoomIndex % themes.length];

    // Create new boss
    enemy = createBoss(theme, difficulty);
    enemy = addSpecialEffectMethodsToBoss(enemy);

    // Show boss UI
    enemy.showBossUI();
}

// Function to ensure boss health UI is visible
function ensureBossUIVisible() {
    if (enemy && enemy.alive) {
        bossHealthBar.style.display = 'block';
        bossNameElement.style.display = 'block';
        // Update health percentage
        bossHealthFill.style.width = (enemy.health / enemy.maxHealth * 100) + '%';
        bossHealthText.textContent = `${Math.floor(enemy.health)}/${Math.floor(enemy.maxHealth)}`;
    }
}

// Web Audio API Sound System - No external files needed
let audioContext = null;
let audioInitialized = false;

function initAudio() {
    try {
        // Create audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioInitialized = true;
        console.log("Audio system initialized");
    } catch (e) {
        console.warn("Web Audio API not supported:", e);
    }
}

// Sound generation without external files
function playSound(soundType) {
    if (!audioInitialized || !audioContext) {
        // Try to initialize on first sound play (needed due to browser autoplay policies)
        try {
            initAudio();
        } catch (e) {
            console.warn("Could not initialize audio:", e);
            return;
        }
    }

    // If still not initialized, exit
    if (!audioInitialized || !audioContext) return;

    try {
        switch (soundType) {
            case 'powerup':
                playPowerupSound();
                break;
            case 'healthPickup':
                playHealthSound();
                break;
            case 'playerHit':
                playPlayerHitSound();
                break;
            case 'enemyHit':
                playEnemyHitSound();
                break;
            case 'weaponSwing':
                playWeaponSwingSound();
                break;
            case 'bossDefeat':
                playBossDefeatSound();
                break;
            case 'doorOpen':
                playDoorSound();
                break;
            default:
                console.log(`Sound type not implemented: ${soundType}`);
        }
    } catch (e) {
        console.warn(`Error playing sound ${soundType}:`, e);
    }
}

// Synthesize a power-up sound
function playPowerupSound() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.2);

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.3);
}

// Synthesize a health pickup sound
function playHealthSound() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(330, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(660, audioContext.currentTime + 0.1);
    oscillator.frequency.exponentialRampToValueAtTime(990, audioContext.currentTime + 0.2);

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.3);
}

// Synthesize player damage sound
function playPlayerHitSound() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(110, audioContext.currentTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, audioContext.currentTime);

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.2);
}

// Synthesize enemy hit sound
function playEnemyHitSound() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(220, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(110, audioContext.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.1);
}

// Synthesize weapon swing sound
function playWeaponSwingSound() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(220, audioContext.currentTime + 0.15);

    gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.15);
}

// Synthesize boss defeat sound
function playBossDefeatSound() {
    // Create multiple oscillators for richer sound
    const oscillator1 = audioContext.createOscillator();
    const oscillator2 = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator1.type = 'sine';
    oscillator1.frequency.setValueAtTime(440, audioContext.currentTime);
    oscillator1.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.3);
    oscillator1.frequency.exponentialRampToValueAtTime(220, audioContext.currentTime + 0.6);

    oscillator2.type = 'triangle';
    oscillator2.frequency.setValueAtTime(220, audioContext.currentTime);
    oscillator2.frequency.exponentialRampToValueAtTime(440, audioContext.currentTime + 0.6);

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + 0.3);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);

    oscillator1.connect(gainNode);
    oscillator2.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator1.start();
    oscillator2.start();
    oscillator1.stop(audioContext.currentTime + 0.8);
    oscillator2.stop(audioContext.currentTime + 0.8);
}

// Synthesize door opening sound
function playDoorSound() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(110, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(220, audioContext.currentTime + 0.5);

    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.5);
}

// Initialize audio when game starts
function initGame() {
    // Only init if not already initialized
    if (!isRunning) {
        // Initialize game
        init();
    } else {
        // If already running, make sure animation frame is active
        if (!window.animationFrameId) {
            // Restart animation loop
            let lastFrameTime = 0;
            const targetFrameRate = 60;
            const frameInterval = 1000 / targetFrameRate;

            function animateWithFrameLimit(currentTime) {
                if (!isRunning) return;

                window.animationFrameId = requestAnimationFrame(animateWithFrameLimit);

                // Begin stats measurement
                if (stats) stats.begin();

                // Calculate elapsed time since last frame
                const elapsed = currentTime - lastFrameTime;

                // Only update if enough time has passed
                if (elapsed > frameInterval) {
                    // Adjust time to maintain consistent timing
                    lastFrameTime = currentTime - (elapsed % frameInterval);
                    animate();
                }

                // End stats measurement
                if (stats) stats.end();
            }

            window.animationFrameId = requestAnimationFrame(animateWithFrameLimit);
        }
    }

    // Initialize audio (safe to call multiple times)
    initAudio();
}

function setupGame() {
    // Create player
    player = createPlayer();

    // Create enemy boss for first room
    enemy = createBoss('fire', 1);
    enemy = addSpecialEffectMethodsToBoss(enemy);
    enemy.showBossUI();

    // Position player and camera
    // ... existing code ...
}

// Helper function to safely check if an object is in frustum
function isInFrustum(frustum, object) {
    // If no frustum, assume object is visible
    if (!frustum) return true;

    // If no object or incomplete object, assume visible
    if (!object || !object.geometry) return true;

    // Ensure geometry has a boundingSphere
    if (!object.geometry.boundingSphere && object.geometry.computeBoundingSphere) {
        object.geometry.computeBoundingSphere();
    }

    // If still no boundingSphere, assume visible
    if (!object.geometry.boundingSphere) return true;

    // Now safely check
    return frustum.intersectsObject(object);
}

// Add undead decoration (gravestone/bones)
function addUndeadDecoration(room, x, z) {
    // Gravestone group
    const graveGroup = new THREE.Group();

    // Gravestone - simpler geometry
    const stoneGeo = new THREE.BoxGeometry(1.5, 2, 0.3);
    stoneGeo.translate(0, 1, 0); // Center at bottom
    const stoneMat = new THREE.MeshStandardMaterial({
        color: 0x777777,
        roughness: 0.8,
        metalness: 0.2
    });
    const stone = new THREE.Mesh(stoneGeo, stoneMat);

    // Random rotation
    stone.rotation.y = (Math.random() - 0.5) * 0.5;
    stone.rotation.x = (Math.random() - 0.5) * 0.1;
    stone.rotation.z = (Math.random() - 0.5) * 0.1;

    graveGroup.add(stone);

    // Add some bones around the grave
    const boneCount = 3;
    for (let i = 0; i < boneCount; i++) {
        const boneGeometry = new THREE.BoxGeometry(0.2, 0.8, 0.2);
        const boneMaterial = new THREE.MeshStandardMaterial({
            color: 0xdddddd,
            roughness: 0.5,
            metalness: 0.1
        });
        const bone = new THREE.Mesh(boneGeometry, boneMaterial);

        // Random position around the gravestone
        const radius = 0.8 + Math.random() * 0.5;
        const angle = Math.random() * Math.PI * 2;
        bone.position.x = radius * Math.cos(angle);
        bone.position.z = radius * Math.sin(angle);
        bone.position.y = 0.2;

        // Random rotation
        bone.rotation.x = Math.random() * Math.PI;
        bone.rotation.y = Math.random() * Math.PI;
        bone.rotation.z = Math.random() * Math.PI;

        graveGroup.add(bone);
    }

    // Only add light if we haven't reached the maximum
    if (lightCount < maxLights) {
        // Add eerie green glow
        const graveLight = new THREE.PointLight(0x22ff00, 0.5, 4);
        graveLight.position.set(0, 0.5, 0.3);
        graveGroup.add(graveLight);
        lightCount++;

        // Add to animation tracking for light pulsing
        graveLight.userData.offset = Math.random() * Math.PI * 2;
        graveLight.userData.animationType = 'undeadLight';
        animatedObjects.push(graveLight);
    }

    // Position grave group
    graveGroup.position.set(x, 0, z);
    room.addObject(graveGroup);

    return graveGroup;
}

// Add mechanical decoration (gear assembly)
function addMechanicalDecoration(room, x, z) {
    // Gear group
    const gearGroup = new THREE.Group();

    // Create base
    const baseGeo = new THREE.CylinderGeometry(1, 1, 0.3, 8);
    const baseMat = new THREE.MeshStandardMaterial({
        color: 0x444444,
        roughness: 0.7,
        metalness: 0.8
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.15;
    gearGroup.add(base);

    // Create main gear
    const mainGearGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 8);
    const mainGearMat = new THREE.MeshStandardMaterial({
        color: 0xaa8844,
        roughness: 0.4,
        metalness: 0.9
    });
    const mainGear = new THREE.Mesh(mainGearGeo, mainGearMat);
    mainGear.position.y = 0.4;
    mainGear.rotation.y = Math.random() * Math.PI;
    gearGroup.add(mainGear);

    // Add teeth to main gear
    for (let i = 0; i < 8; i++) {
        const toothGeo = new THREE.BoxGeometry(0.2, 0.2, 0.3);
        const tooth = new THREE.Mesh(toothGeo, mainGearMat);

        const angle = (i / 8) * Math.PI * 2;
        tooth.position.x = 0.8 * Math.cos(angle);
        tooth.position.z = 0.8 * Math.sin(angle);
        tooth.position.y = 0.4;
        tooth.rotation.y = angle;

        gearGroup.add(tooth);
    }

    // Add smaller gear
    const smallGearGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.15, 8);
    const smallGear = new THREE.Mesh(smallGearGeo, mainGearMat);
    smallGear.position.set(0.9, 0.7, 0);
    smallGear.rotation.y = Math.random() * Math.PI;
    gearGroup.add(smallGear);

    // Add teeth to small gear
    for (let i = 0; i < 6; i++) {
        const toothGeo = new THREE.BoxGeometry(0.1, 0.15, 0.2);
        const tooth = new THREE.Mesh(toothGeo, mainGearMat);

        const angle = (i / 6) * Math.PI * 2;
        tooth.position.x = 0.9 + 0.4 * Math.cos(angle);
        tooth.position.z = 0.4 * Math.sin(angle);
        tooth.position.y = 0.7;
        tooth.rotation.y = angle;

        gearGroup.add(tooth);
    }

    // Only add light if we haven't reached the maximum
    if (lightCount < maxLights) {
        // Add gear light
        const gearLight = new THREE.PointLight(0xffcc33, 0.6, 5);
        gearLight.position.y = 0.8;
        gearGroup.add(gearLight);
        lightCount++;

        // Add light animation
        gearLight.userData.offset = Math.random() * Math.PI * 2;
        gearLight.userData.animationType = 'gearLight';
        animatedObjects.push(gearLight);
    }

    // Position gear group
    gearGroup.position.set(x, 0, z);
    room.addObject(gearGroup);

    // Add gears to animation tracking
    mainGear.userData.animationType = 'gear';
    mainGear.userData.rotSpeed = 0.3 + Math.random() * 0.3;
    mainGear.userData.offset = Math.random() * Math.PI * 2;
    animatedObjects.push(mainGear);

    smallGear.userData.animationType = 'gear';
    smallGear.userData.rotSpeed = -mainGear.userData.rotSpeed * 2;
    smallGear.userData.offset = Math.random() * Math.PI * 2;
    animatedObjects.push(smallGear);

    return gearGroup;
}

// Helper function to create fire boss
function createFireBoss(bossGroup, bossType) {
    // ------------------------------------
    // BODY - Change to a more stocky, rounded shape
    // ------------------------------------
    // Main body - low-poly
    const bodyGeometry = new THREE.DodecahedronGeometry(1.2, 1); // Use dodecahedron for low-poly look
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0xff5500, // Brighter orange-red
        emissive: 0xff3300,
        emissiveIntensity: 0.7,
        roughness: 0.3,
        metalness: 0.5,
        flatShading: true // Important for low-poly look
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1.2; // Lower position
    body.scale.set(1.3, 1.1, 1); // Wider, shorter body
    bossGroup.add(body);

    // ------------------------------------
    // HEAD - Create skull-like face
    // ------------------------------------
    // Head - use icosahedron for low-poly look
    const headGeometry = new THREE.IcosahedronGeometry(0.9, 0);
    const headMaterial = new THREE.MeshStandardMaterial({
        color: 0xff6600,
        emissive: 0xff5500,
        emissiveIntensity: 0.9,
        roughness: 0.2,
        metalness: 0.7,
        flatShading: true
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 2.5;
    head.scale.set(0.9, 1.1, 0.9);
    bossGroup.add(head);

    // Eyes - create black oval eyes
    const eyeGeometry = new THREE.PlaneGeometry(0.25, 0.12);
    const eyeMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.DoubleSide
    });
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.25, 2.6, 0.85);
    leftEye.lookAt(0, 2.6, 2); // Make it face forward
    bossGroup.add(leftEye);

    const rightEye = leftEye.clone();
    rightEye.position.set(0.25, 2.6, 0.85);
    rightEye.lookAt(0, 2.6, 2);
    bossGroup.add(rightEye);

    // Nose/mouth - Create triangular nose cavity
    const noseGeometry = new THREE.ConeGeometry(0.15, 0.25, 3);
    const noseMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
    });
    const nose = new THREE.Mesh(noseGeometry, noseMaterial);
    nose.position.set(0, 2.4, 0.9);
    nose.rotation.x = Math.PI; // Flip the cone
    nose.rotation.y = Math.PI; // Rotate to face forward
    bossGroup.add(nose);

    // ------------------------------------
    // FLAME CROWN - Add larger flame shape on top
    // ------------------------------------
    // Main flame shape on top
    const flameGroup = new THREE.Group();

    // Center tall flame
    const centerFlameGeo = new THREE.ConeGeometry(0.4, 1.2, 5);
    const flameMaterial = new THREE.MeshStandardMaterial({
        color: 0xff7700,
        emissive: 0xff5500,
        emissiveIntensity: 1,
        transparent: true,
        opacity: 0.9,
        flatShading: true
    });

    const centerFlame = new THREE.Mesh(centerFlameGeo, flameMaterial);
    centerFlame.position.y = 3.3;
    flameGroup.add(centerFlame);

    // Add side flames in varying sizes
    const flameColors = [0xff9900, 0xffcc00, 0xff5500];
    const flameSizes = [
        { height: 0.9, width: 0.3, x: -0.3, y: 3.1, z: 0.1 },
        { height: 0.7, width: 0.25, x: 0.35, y: 3.0, z: 0.2 },
        { height: 0.65, width: 0.2, x: -0.5, y: 3.0, z: -0.2 },
        { height: 0.8, width: 0.25, x: 0.5, y: 3.1, z: -0.1 }
    ];

    flameSizes.forEach((size, index) => {
        const flameGeo = new THREE.ConeGeometry(size.width, size.height, 4);
        const flameMat = new THREE.MeshStandardMaterial({
            color: flameColors[index % flameColors.length],
            emissive: 0xff5500,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.9,
            flatShading: true
        });

        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.set(size.x, size.y, size.z);
        flame.rotation.x = Math.random() * 0.2 - 0.1;
        flame.rotation.z = Math.random() * 0.3 - 0.15;

        // Store animation parameters
        flame.userData.baseY = flame.position.y;
        flame.userData.speed = 1 + Math.random() * 2;
        flame.userData.offset = Math.random() * Math.PI * 2;
        flame.userData.animationType = 'fire';

        flameGroup.add(flame);
        animatedObjects.push(flame);
    });

    bossGroup.add(flameGroup);

    // ------------------------------------
    // ARMS - Create large flame hands
    // ------------------------------------
    // Shoulders - small connections
    const shoulderGeo = new THREE.SphereGeometry(0.3, 8, 8);
    const shoulderMat = new THREE.MeshStandardMaterial({
        color: 0xff6600,
        emissive: 0xff4400,
        emissiveIntensity: 0.6,
        flatShading: true
    });

    // Left shoulder
    const leftShoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
    leftShoulder.position.set(-1.0, 1.8, 0);
    bossGroup.add(leftShoulder);

    // Right shoulder
    const rightShoulder = leftShoulder.clone();
    rightShoulder.position.set(1.0, 1.8, 0);
    bossGroup.add(rightShoulder);

    // Create flame hands
    createFlameHand(bossGroup, -1.4, 1.5, 0.3, 0xffcc00); // Left hand
    createFlameHand(bossGroup, 1.4, 1.5, 0.3, 0xffcc00);  // Right hand

    // Add light
    const light = new THREE.PointLight(0xff5500, 1.5, 10);
    light.position.set(0, 2, 0);
    bossGroup.add(light);

    // Add smaller ambient lights for better illumination
    const ambientLight = new THREE.PointLight(0xff9900, 0.7, 5);
    ambientLight.position.set(0, 1, 0);
    bossGroup.add(ambientLight);
}

// Helper function to create flame hand
function createFlameHand(parent, x, y, z, color) {
    const handGroup = new THREE.Group();
    handGroup.position.set(x, y, z);

    // Base of hand
    const baseGeo = new THREE.SphereGeometry(0.5, 6, 6);
    const baseMat = new THREE.MeshStandardMaterial({
        color: 0xff5500,
        emissive: 0xff3300,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.9,
        flatShading: true
    });

    const base = new THREE.Mesh(baseGeo, baseMat);
    handGroup.add(base);

    // Add flame shapes
    const flameCount = 5;
    const flameColors = [0xff9900, 0xffaa00, 0xffcc00];

    for (let i = 0; i < flameCount; i++) {
        const height = 0.5 + Math.random() * 0.4;
        const width = 0.2 + Math.random() * 0.15;

        const flameGeo = new THREE.ConeGeometry(width, height, 4);
        const flameMat = new THREE.MeshStandardMaterial({
            color: flameColors[i % flameColors.length],
            emissive: 0xff5500,
            emissiveIntensity: 0.9,
            transparent: true,
            opacity: 0.9,
            flatShading: true
        });

        const flame = new THREE.Mesh(flameGeo, flameMat);

        // Position flames in a circular pattern
        const angle = (i / flameCount) * Math.PI * 2;
        const radius = 0.2;
        flame.position.set(
            Math.cos(angle) * radius,
            0.3 + Math.random() * 0.2,
            Math.sin(angle) * radius
        );

        // Random rotation
        flame.rotation.x = (Math.random() - 0.5) * 0.3;
        flame.rotation.z = (Math.random() - 0.5) * 0.3;

        // Add animation data
        flame.userData.baseY = flame.position.y;
        flame.userData.speed = 1 + Math.random() * 2;
        flame.userData.offset = Math.random() * Math.PI * 2;
        flame.userData.animationType = 'fire';

        handGroup.add(flame);
        animatedObjects.push(flame);
    }

    // Add light to hand
    if (lightCount < maxLights) {
        const handLight = new THREE.PointLight(0xff9900, 0.8, 3);
        handLight.position.y = 0.2;
        handGroup.add(handLight);
        lightCount++;

        // Add to animation tracking for fire flickering
        handLight.userData.offset = Math.random() * Math.PI * 2;
        handLight.userData.animationType = 'fireLight';
        animatedObjects.push(handLight);
    }

    parent.add(handGroup);
    return handGroup;
}

// Helper function to create ice boss
function createIceBoss(bossGroup, bossType) {
    // ------------------------------------
    // BODY - Stocky low-poly ice body
    // ------------------------------------
    const bodyGeometry = new THREE.IcosahedronGeometry(1.2, 0); // Low-poly base shape
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0x66ccff, // Medium blue
        emissive: 0x3399ff,
        emissiveIntensity: 0.3,
        roughness: 0.1,
        metalness: 0.9,
        transparent: true,
        opacity: 0.95,
        flatShading: true // Important for low-poly look
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1.5;
    body.scale.set(1.4, 1.1, 1.0); // Wide, stocky body
    bossGroup.add(body);

    // ------------------------------------
    // HEAD - Angry ice face with spikes
    // ------------------------------------
    // Base head
    const headGeometry = new THREE.DodecahedronGeometry(0.9, 0);
    const headMaterial = new THREE.MeshStandardMaterial({
        color: 0x77ddff, // Slightly lighter blue for head
        emissive: 0x3399ff,
        emissiveIntensity: 0.3,
        roughness: 0.2,
        metalness: 0.8,
        transparent: true,
        opacity: 0.95,
        flatShading: true
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 2.7;
    head.scale.set(1.1, 1.0, 1.0);
    bossGroup.add(head);

    // ------------------------------------
    // EYES - Dark, angry eyes
    // ------------------------------------
    const eyeGeometry = new THREE.SphereGeometry(0.15, 6, 6);
    const eyeMaterial = new THREE.MeshBasicMaterial({
        color: 0x000066 // Dark blue
    });
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.3, 2.8, 0.7);
    leftEye.scale.set(1, 0.6, 0.5); // Squint the eyes slightly
    bossGroup.add(leftEye);

    // Add white glint to eyes
    const glintGeometry = new THREE.SphereGeometry(0.05, 4, 4);
    const glintMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const leftGlint = new THREE.Mesh(glintGeometry, glintMaterial);
    leftGlint.position.set(-0.25, 2.85, 0.8);
    bossGroup.add(leftGlint);

    // Right eye with glint
    const rightEye = leftEye.clone();
    rightEye.position.set(0.3, 2.8, 0.7);
    bossGroup.add(rightEye);

    const rightGlint = leftGlint.clone();
    rightGlint.position.set(0.25, 2.85, 0.8);
    bossGroup.add(rightGlint);

    // ------------------------------------
    // MOUTH - Grumpy frown
    // ------------------------------------
    const mouthGeometry = new THREE.BoxGeometry(0.5, 0.1, 0.2);
    const mouthMaterial = new THREE.MeshBasicMaterial({
        color: 0x000055 // Dark blue
    });
    const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
    mouth.position.set(0, 2.5, 0.8);
    mouth.rotation.z = Math.PI * 0.1; // Slight tilt for angry look
    bossGroup.add(mouth);

    // ------------------------------------
    // ICE SPIKES - Add spikes around head
    // ------------------------------------
    createIceSpikes(bossGroup, 3.0); // Add ice spikes to head

    // ------------------------------------
    // ARMS - Create large chunky ice arms
    // ------------------------------------
    // Shoulders - connecting geometry
    const shoulderGeometry = new THREE.OctahedronGeometry(0.4, 0);
    const shoulderMaterial = new THREE.MeshStandardMaterial({
        color: 0x55aaff,
        emissive: 0x3388ff,
        emissiveIntensity: 0.2,
        flatShading: true,
        transparent: true,
        opacity: 0.95
    });

    // Left shoulder
    const leftShoulder = new THREE.Mesh(shoulderGeometry, shoulderMaterial);
    leftShoulder.position.set(-0.9, 2.0, 0);
    bossGroup.add(leftShoulder);

    // Left upper arm
    const leftUpperArmGeo = new THREE.BoxGeometry(0.5, 0.8, 0.5);
    const armMaterial = new THREE.MeshStandardMaterial({
        color: 0x55aaff,
        flatShading: true,
        transparent: true,
        opacity: 0.95
    });
    const leftUpperArm = new THREE.Mesh(leftUpperArmGeo, armMaterial);
    leftUpperArm.position.set(-1.3, 1.7, 0);
    leftUpperArm.rotation.z = Math.PI * 0.15; // Angle the arm
    bossGroup.add(leftUpperArm);

    // Right shoulder and arm (mirror of left)
    const rightShoulder = leftShoulder.clone();
    rightShoulder.position.set(0.9, 2.0, 0);
    bossGroup.add(rightShoulder);

    const rightUpperArm = leftUpperArm.clone();
    rightUpperArm.position.set(1.3, 1.7, 0);
    rightUpperArm.rotation.z = -Math.PI * 0.15; // Mirror angle
    bossGroup.add(rightUpperArm);

    // Create large chunky fists
    createIceFist(bossGroup, -1.9, 1.4, 0.2, 1); // Left fist
    createIceFist(bossGroup, 1.9, 1.4, 0.2, -1); // Right fist (mirrored)

    // ------------------------------------
    // LEGS - Thick ice legs
    // ------------------------------------
    // Left leg
    const legGeometry = new THREE.CylinderGeometry(0.35, 0.3, 1.0, 5);
    const legMaterial = new THREE.MeshStandardMaterial({
        color: 0x3399ff,
        flatShading: true,
        transparent: true,
        opacity: 0.95
    });
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.5, 0.6, 0);
    bossGroup.add(leftLeg);

    // Left foot
    const footGeometry = new THREE.BoxGeometry(0.5, 0.2, 0.7);
    const leftFoot = new THREE.Mesh(footGeometry, legMaterial);
    leftFoot.position.set(-0.5, 0.1, 0.2);
    bossGroup.add(leftFoot);

    // Right leg and foot
    const rightLeg = leftLeg.clone();
    rightLeg.position.set(0.5, 0.6, 0);
    bossGroup.add(rightLeg);

    const rightFoot = leftFoot.clone();
    rightFoot.position.set(0.5, 0.1, 0.2);
    bossGroup.add(rightFoot);

    // Add ice light
    const light = new THREE.PointLight(0xaaddff, 1.2, 8);
    light.position.set(0, 2, 0);
    bossGroup.add(light);

    // Add frost particle effect
    if (lightCount < maxLights) {
        const frostLight = new THREE.PointLight(0xccffff, 0.6, 4);
        frostLight.position.set(0, 1.5, 0);
        bossGroup.add(frostLight);

        frostLight.userData.offset = Math.random() * Math.PI * 2;
        frostLight.userData.animationType = 'iceLight';
        animatedObjects.push(frostLight);
        lightCount++;
    }
}

// Helper function to create undead boss
function createUndeadBoss(bossGroup, bossType) {
    // ------------------------------------
    // SKULL - Create detailed skull head
    // ------------------------------------
    const skullGroup = new THREE.Group();
    skullGroup.position.y = 2.7;

    // Base skull - using low-poly approach
    const skullGeo = new THREE.DodecahedronGeometry(0.6, 0);
    const skullMat = new THREE.MeshStandardMaterial({
        color: 0xf8f8f8, // Off-white
        emissive: 0x555555,
        emissiveIntensity: 0.1,
        roughness: 0.7,
        metalness: 0.1,
        flatShading: true
    });
    const skull = new THREE.Mesh(skullGeo, skullMat);
    skull.scale.set(1, 1.3, 1.1); // Elongate slightly
    skullGroup.add(skull);

    // Eye sockets - large black holes
    const socketGeo = new THREE.SphereGeometry(0.18, 8, 8);
    const socketMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.DoubleSide
    });

    const leftSocket = new THREE.Mesh(socketGeo, socketMat);
    leftSocket.position.set(-0.2, 0, 0.4);
    leftSocket.scale.set(1, 1.2, 0.5); // Flatten into oval
    skullGroup.add(leftSocket);

    const rightSocket = leftSocket.clone();
    rightSocket.position.set(0.2, 0, 0.4);
    skullGroup.add(rightSocket);

    // Nasal cavity
    const nasalGeo = new THREE.ConeGeometry(0.1, 0.15, 3);
    const nasalMat = new THREE.MeshBasicMaterial({
        color: 0x000000
    });
    const nasal = new THREE.Mesh(nasalGeo, nasalMat);
    nasal.rotation.x = Math.PI; // Flip
    nasal.position.set(0, -0.1, 0.4);
    skullGroup.add(nasal);

    // Grinning teeth - row of small white boxes
    const teethCount = 8;
    for (let i = 0; i < teethCount; i++) {
        const toothGeo = new THREE.BoxGeometry(0.06, 0.08, 0.05);
        const toothMat = new THREE.MeshBasicMaterial({
            color: 0xffffff
        });
        const tooth = new THREE.Mesh(toothGeo, toothMat);

        // Position in a curved row for a smile
        const angle = ((i / (teethCount - 1)) - 0.5) * Math.PI * 0.5; // -PI/4 to PI/4
        const radius = 0.25;
        tooth.position.set(
            Math.sin(angle) * radius,
            -0.25,
            Math.cos(angle) * radius + 0.3
        );

        // Angle teeth to follow jaw curve
        tooth.rotation.y = -angle;

        skullGroup.add(tooth);
    }

    // Add fire effect on top of skull
    createFlameEffect(skullGroup, 0, 0.5, 0, 0.5, 0.8);

    bossGroup.add(skullGroup);

    // ------------------------------------
    // ROBE/CLOAK - Dramatic flowing robe
    // ------------------------------------
    // Main body - torso under the robe
    const bodyGeo = new THREE.CylinderGeometry(0.5, 0.4, 2, 6);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x330011, // Very dark red/purple
        roughness: 0.7,
        metalness: 0.1,
        flatShading: true,
        transparent: true,
        opacity: 0.85
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.5;
    // Make the body slightly more visible
    body.scale.set(1.1, 1.0, 1.1);
    bossGroup.add(body);

    // Add separate neck piece with higher transparency
    const neckGeo = new THREE.CylinderGeometry(0.25, 0.4, 0.5, 6);
    const neckMat = new THREE.MeshStandardMaterial({
        color: 0x330011, // Match body color
        roughness: 0.7,
        metalness: 0.1,
        flatShading: true,
        transparent: true,
        opacity: 0.4 // Much more transparent than the body
    });
    const neck = new THREE.Mesh(neckGeo, neckMat);
    neck.position.y = 2.45; // Position between head and body
    bossGroup.add(neck);

    // Robe - main part
    const robeGroup = new THREE.Group();

    // Upper robe/coat
    const upperRobeGeo = new THREE.ConeGeometry(1.2, 2.5, 6, 1, true); // Open cone
    const robeMat = new THREE.MeshStandardMaterial({
        color: 0x880022, // Deep red
        side: THREE.DoubleSide,
        roughness: 0.8,
        metalness: 0.1,
        flatShading: true,
        transparent: true, // Enable transparency
        opacity: 0.5 // Reduced opacity to show skeletal parts
    });
    // Add depth to the material to improve rendering order
    robeMat.depthWrite = false;
    const upperRobe = new THREE.Mesh(upperRobeGeo, robeMat);
    upperRobe.position.y = 1.8;
    upperRobe.rotation.x = Math.PI; // Flip it
    robeGroup.add(upperRobe);

    // High collar - iconic necromancer look
    const collarGroup = new THREE.Group();
    collarGroup.position.y = 2.4;

    // Create collar pieces
    const collarSegments = 5;
    for (let i = 0; i < collarSegments; i++) {
        const collarGeo = new THREE.BoxGeometry(0.2, 0.5, 0.05);
        const collar = new THREE.Mesh(collarGeo, robeMat);

        // Position around back of neck
        const angle = ((i / (collarSegments - 1)) - 0.5) * Math.PI * 0.8; // Only back half
        const radius = 0.4;
        collar.position.set(
            Math.sin(angle) * radius,
            0.2,
            -Math.cos(angle) * radius + 0.1
        );

        // Angle pieces outward
        collar.rotation.y = -angle;
        collar.rotation.x = -Math.PI / 6; // Tilt up

        collarGroup.add(collar);
    }

    robeGroup.add(collarGroup);

    // Lower robe/skirt
    const lowerRobeGeo = new THREE.CylinderGeometry(0.8, 1.2, 1.5, 8, 1, true); // Open cylinder
    const lowerRobe = new THREE.Mesh(lowerRobeGeo, robeMat);
    lowerRobe.position.y = 0.8;
    // Ensure the lower robe has the same transparency as the upper robe
    lowerRobe.material.opacity = 0.5;
    lowerRobe.material.depthWrite = false;
    robeGroup.add(lowerRobe);

    // Jagged edges on robe
    const edgeCount = 8;
    for (let i = 0; i < edgeCount; i++) {
        const edgeGeo = new THREE.BoxGeometry(0.4, 0.2, 0.1);
        const edge = new THREE.Mesh(edgeGeo, robeMat);

        // Position at bottom of robe
        const angle = (i / edgeCount) * Math.PI * 2;
        const radius = 1.1;
        edge.position.set(
            Math.sin(angle) * radius,
            0.15,
            Math.cos(angle) * radius
        );

        // Point outward
        edge.rotation.y = -angle;
        edge.rotation.x = Math.PI / 6; // Slight downward angle

        robeGroup.add(edge);
    }

    bossGroup.add(robeGroup);

    // Waist sash/belt
    const sashGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.3, 8);
    const sashMat = new THREE.MeshStandardMaterial({
        color: 0x553322, // Brown leather
        roughness: 0.9,
        metalness: 0.1,
        flatShading: true
    });
    const sash = new THREE.Mesh(sashGeo, sashMat);
    sash.position.y = 1.2;
    bossGroup.add(sash);

    // Dangling rope/cord
    const ropeGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 4);
    const rope = new THREE.Mesh(ropeGeo, sashMat);
    rope.position.set(0.3, 0.8, 0.2);
    rope.rotation.x = Math.PI / 12; // Slight angle
    bossGroup.add(rope);

    // ------------------------------------
    // ARMS - Skeletal arms with fire
    // ------------------------------------
    // Upper arms - thin bones
    const armMat = new THREE.MeshStandardMaterial({
        color: 0x222222, // Dark gray/black
        roughness: 0.7,
        metalness: 0.2,
        flatShading: true
    });

    // Left arm
    const leftArmGroup = new THREE.Group();

    const leftUpperArmGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.8, 4);
    const leftUpperArm = new THREE.Mesh(leftUpperArmGeo, armMat);
    leftUpperArm.position.set(0, -0.4, 0);
    leftUpperArm.rotation.z = Math.PI / 6; // Angle outward
    leftArmGroup.add(leftUpperArm);

    // Left forearm
    const leftForearmGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.7, 4);
    const leftForearm = new THREE.Mesh(leftForearmGeo, armMat);
    leftForearm.position.set(0.2, -0.8, 0);
    leftForearm.rotation.z = -Math.PI / 4; // Bend elbow
    leftArmGroup.add(leftForearm);

    // Left hand - create skeletal hand
    const leftHandGroup = new THREE.Group();
    leftHandGroup.position.set(0.5, -1, 0);

    // Palm
    const palmGeo = new THREE.BoxGeometry(0.12, 0.15, 0.05);
    const palm = new THREE.Mesh(palmGeo, armMat);
    leftHandGroup.add(palm);

    // Fingers - create thin bones
    const fingerCount = 4;
    for (let i = 0; i < fingerCount; i++) {
        const fingerGeo = new THREE.BoxGeometry(0.03, 0.12, 0.02);
        const finger = new THREE.Mesh(fingerGeo, armMat);

        // Position fingers in a fan
        const spread = ((i / (fingerCount - 1)) - 0.5) * 0.25;
        finger.position.set(
            spread,
            0.12,
            0
        );
        // Rotate fingers slightly
        finger.rotation.z = -Math.PI / 15 + (spread * Math.PI / 2);

        leftHandGroup.add(finger);
    }

    leftArmGroup.add(leftHandGroup);

    // Flame in left hand
    createFlameEffect(leftHandGroup, 0, 0.2, 0, 0.6, 1);

    // Position the entire arm
    leftArmGroup.position.set(-0.7, 2, 0);
    bossGroup.add(leftArmGroup);

    // Right arm (mirror of left)
    const rightArmGroup = leftArmGroup.clone();
    rightArmGroup.position.set(0.7, 2, 0);
    rightArmGroup.rotation.z = -rightArmGroup.rotation.z; // Mirror rotation
    rightArmGroup.scale.x = -1; // Flip X to mirror geometry
    bossGroup.add(rightArmGroup);

    // ------------------------------------
    // LEGS - Simple dark legs
    // ------------------------------------
    // Left leg
    const legGeo = new THREE.CylinderGeometry(0.12, 0.08, 1, 4);
    const leftLeg = new THREE.Mesh(legGeo, armMat);
    leftLeg.position.set(-0.3, 0.5, 0);
    bossGroup.add(leftLeg);

    // Left foot
    const footGeo = new THREE.BoxGeometry(0.15, 0.1, 0.25);
    const leftFoot = new THREE.Mesh(footGeo, armMat);
    leftFoot.position.set(-0.3, 0, 0.05);
    bossGroup.add(leftFoot);

    // Right leg and foot
    const rightLeg = leftLeg.clone();
    rightLeg.position.set(0.3, 0.5, 0);
    bossGroup.add(rightLeg);

    const rightFoot = leftFoot.clone();
    rightFoot.position.set(0.3, 0, 0.05);
    bossGroup.add(rightFoot);

    // ------------------------------------
    // LIGHTING - Eerie lighting effects
    // ------------------------------------
    // Add main light
    const mainLight = new THREE.PointLight(0xff3300, 1.0, 8);
    mainLight.position.set(0, 2, 0);
    bossGroup.add(mainLight);

    // Add additional ambient light for better visibility
    if (lightCount < maxLights) {
        const ambientLight = new THREE.PointLight(0x330022, 0.5, 5);
        ambientLight.position.set(0, 1, 0);
        bossGroup.add(ambientLight);
        lightCount++;

        // Add animation
        ambientLight.userData.offset = Math.random() * Math.PI * 2;
        ambientLight.userData.animationType = 'undeadLight';
        animatedObjects.push(ambientLight);
    }
}

// Helper function to create mechanical boss
function createMechanicalBoss(bossGroup, bossType) {
    // Core body - metallic torso
    const bodyGeometry = new THREE.CylinderGeometry(0.8, 1, 2, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0x887755,
        emissive: 0x553311,
        emissiveIntensity: 0.2,
        roughness: 0.3,
        metalness: 0.8
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1.5;
    bossGroup.add(body);

    // Body details - panels and gears
    for (let i = 0; i < 3; i++) {
        // Front panel
        const panelGeo = new THREE.BoxGeometry(0.5, 0.3, 0.05);
        const panelMat = new THREE.MeshStandardMaterial({
            color: 0xccaa66,
            roughness: 0.2,
            metalness: 0.9
        });

        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(0, 1 + i * 0.6, 0.8);
        bossGroup.add(panel);

        // Gears on sides
        const gearGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8);
        const gearMat = new THREE.MeshStandardMaterial({
            color: 0xaa8844,
            roughness: 0.3,
            metalness: 0.8
        });

        const leftGear = new THREE.Mesh(gearGeo, gearMat);
        leftGear.position.set(-0.8, 1.3 + i * 0.4, 0.2);
        leftGear.rotation.z = Math.PI / 2;
        bossGroup.add(leftGear);

        const rightGear = leftGear.clone();
        rightGear.position.set(0.8, 1.3 + i * 0.4, 0.2);
        bossGroup.add(rightGear);

        // Rotating animations for gears
        animatedObjects.push({
            mesh: leftGear,
            update: function (time) {
                this.mesh.rotation.x = time * 0.5;
            }
        });

        animatedObjects.push({
            mesh: rightGear,
            update: function (time) {
                this.mesh.rotation.x = -time * 0.5;
            }
        });
    }

    // Head - mechanical construct
    const headGeometry = new THREE.BoxGeometry(0.8, 0.7, 0.9);
    const headMaterial = new THREE.MeshStandardMaterial({
        color: bossType.color,
        emissive: bossType.color,
        emissiveIntensity: 0.2,
        roughness: 0.4,
        metalness: 0.7
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 2.9;
    bossGroup.add(head);

    // Eyes - glowing lens
    const eyeGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.05, 16);
    const eyeMaterial = new THREE.MeshBasicMaterial({
        color: 0xff3300,
        transparent: true,
        opacity: 0.9
    });

    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.2, 2.9, 0.45);
    leftEye.rotation.x = Math.PI / 2;
    bossGroup.add(leftEye);

    const rightEye = leftEye.clone();
    rightEye.position.set(0.2, 2.9, 0.45);
    bossGroup.add(rightEye);

    // Antenna
    const antennaGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4);
    const antennaMat = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.3,
        metalness: 0.8
    });

    const antenna = new THREE.Mesh(antennaGeo, antennaMat);
    antenna.position.set(0, 3.5, 0);
    bossGroup.add(antenna);

    // Antenna ball tip
    const antennaTipGeo = new THREE.SphereGeometry(0.1, 8, 8);
    const antennaTipMat = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 1.0
    });

    const antennaTip = new THREE.Mesh(antennaTipGeo, antennaTipMat);
    antennaTip.position.set(0, 3.8, 0);

    // Pulse animation for antenna tip
    animatedObjects.push({
        mesh: antennaTip,
        update: function (time) {
            // Pulsate the emissive intensity
            this.mesh.material.emissiveIntensity = 0.7 + Math.sin(time * 2) * 0.3;
        }
    });

    bossGroup.add(antennaTip);

    // Mechanical arms
    const armMaterial = new THREE.MeshStandardMaterial({
        color: 0x665544,
        roughness: 0.4,
        metalness: 0.7
    });

    // Left arm - multi-segment
    const leftUpperArmGeo = new THREE.BoxGeometry(0.3, 0.8, 0.3);
    const leftUpperArm = new THREE.Mesh(leftUpperArmGeo, armMaterial);
    leftUpperArm.position.set(-1, 2, 0);
    bossGroup.add(leftUpperArm);

    const leftLowerArmGeo = new THREE.BoxGeometry(0.25, 0.9, 0.25);
    const leftLowerArm = new THREE.Mesh(leftLowerArmGeo, armMaterial);
    leftLowerArm.position.set(-1.2, 1.2, 0.2);
    leftLowerArm.rotation.z = Math.PI / 6;
    bossGroup.add(leftLowerArm);

    // Right arm - multi-segment
    const rightUpperArm = leftUpperArm.clone();
    rightUpperArm.position.set(1, 2, 0);
    bossGroup.add(rightUpperArm);

    const rightLowerArm = leftLowerArm.clone();
    rightLowerArm.position.set(1.2, 1.2, 0.2);
    rightLowerArm.rotation.z = -Math.PI / 6;
    bossGroup.add(rightLowerArm);

    // Mechanical hands/claws
    const clawMaterial = new THREE.MeshStandardMaterial({
        color: 0xaa8844,
        roughness: 0.3,
        metalness: 0.8
    });

    // Left claw
    const leftClawGeo = new THREE.BoxGeometry(0.4, 0.15, 0.25);
    const leftClaw = new THREE.Mesh(leftClawGeo, clawMaterial);
    leftClaw.position.set(-1.3, 0.7, 0.3);
    bossGroup.add(leftClaw);

    // Right claw
    const rightClaw = leftClaw.clone();
    rightClaw.position.set(1.3, 0.7, 0.3);
    bossGroup.add(rightClaw);

    // Steam vents
    for (let i = 0; i < 2; i++) {
        const ventGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.1, 6);
        const ventMat = new THREE.MeshStandardMaterial({
            color: 0x333333,
            roughness: 0.8,
            metalness: 0.2
        });

        const vent = new THREE.Mesh(ventGeo, ventMat);
        vent.position.set(-0.5 + i * 1, 2.2, -0.3);
        vent.rotation.x = Math.PI / 2;
        bossGroup.add(vent);

        // Add steam particle effect
        const steamInterval = 2000 + i * 500; // ms
        const steamDuration = 500; // ms

        // Setup animation timing
        vent.userData = {
            lastSteamTime: Date.now() + i * 1000, // Stagger initial timing
            steamInterval: steamInterval,
            steamDuration: steamDuration
        };

        // Add to animated objects for steam effect
        animatedObjects.push({
            mesh: vent,
            update: function (time) {
                const now = Date.now();
                const lastTime = this.mesh.userData.lastSteamTime;

                // Time to emit steam?
                if (now - lastTime > this.mesh.userData.steamInterval) {
                    // Create steam particle
                    createSteamParticle(this.mesh.position.clone());

                    // Reset timer
                    this.mesh.userData.lastSteamTime = now;
                }
            }
        });
    }

    // Add glowing core light
    const light = new THREE.PointLight(0xffaa00, 1.2, 6);
    light.position.set(0, 1.5, 0);
    bossGroup.add(light);
}

// Helper function to create steam particles for mechanical boss
function createSteamParticle(position) {
    // Create particle
    const steamGeo = new THREE.SphereGeometry(0.1, 4, 4);
    const steamMat = new THREE.MeshBasicMaterial({
        color: 0xdddddd,
        transparent: true,
        opacity: 0.7
    });

    const steam = new THREE.Mesh(steamGeo, steamMat);
    steam.position.copy(position);
    steam.userData = {
        velocity: new THREE.Vector3(0, 0.03, 0),
        lifetime: 1000, // ms
        born: Date.now()
    };

    scene.add(steam);

    // Add to animated objects for fading
    animatedObjects.push({
        mesh: steam,
        update: function (time) {
            const now = Date.now();
            const age = now - this.mesh.userData.born;

            // Move upward
            this.mesh.position.add(this.mesh.userData.velocity);

            // Expand slowly
            this.mesh.scale.addScalar(0.01);

            // Fade out based on age
            this.mesh.material.opacity = 0.7 * (1 - age / this.mesh.userData.lifetime);

            // Remove when lifetime is over
            if (age > this.mesh.userData.lifetime) {
                scene.remove(this.mesh);
                const index = animatedObjects.indexOf(this);
                if (index !== -1) {
                    animatedObjects.splice(index, 1);
                }
            }
        }
    });
}

// Helper function to create large ice fist
function createIceFist(parent, x, y, z, mirrorFactor) {
    const fistGroup = new THREE.Group();
    fistGroup.position.set(x, y, z);

    // Main fist chunk
    const fistGeometry = new THREE.DodecahedronGeometry(0.6, 0);
    const fistMaterial = new THREE.MeshStandardMaterial({
        color: 0x55aaff,
        emissive: 0x3388ff,
        emissiveIntensity: 0.2,
        flatShading: true,
        transparent: true,
        opacity: 0.95
    });

    const fist = new THREE.Mesh(fistGeometry, fistMaterial);
    fist.scale.set(1.1, 1.0, 1.2); // Make it more fist-shaped
    fistGroup.add(fist);

    // Knuckle details
    const knuckleCount = 4;
    for (let i = 0; i < knuckleCount; i++) {
        const knuckleGeo = new THREE.BoxGeometry(0.2, 0.15, 0.2);
        const knuckleMat = new THREE.MeshStandardMaterial({
            color: 0x77ccff,
            flatShading: true,
            transparent: true,
            opacity: 0.95
        });

        const knuckle = new THREE.Mesh(knuckleGeo, knuckleMat);

        // Position knuckles across the fist
        knuckle.position.set(
            mirrorFactor * -0.2, // Adjust based on mirror factor
            0.2,
            0.3 + (i * 0.15) - ((knuckleCount - 1) * 0.075) // Spread them out
        );

        fistGroup.add(knuckle);
    }

    // Add ice spikes to fist
    const spikeCount = 3;
    for (let i = 0; i < spikeCount; i++) {
        const spikeGeo = new THREE.ConeGeometry(0.15, 0.3, 4);
        const spikeMat = new THREE.MeshStandardMaterial({
            color: 0xaaddff,
            flatShading: true,
            transparent: true,
            opacity: 0.9
        });

        const spike = new THREE.Mesh(spikeGeo, spikeMat);

        // Position spikes on outside of fist
        const angle = i * Math.PI / 2 + Math.PI / 4;
        spike.position.set(
            mirrorFactor * -0.4, // Outside edge of fist
            0.1 + i * 0.2,
            0.3 * Math.sin(angle)
        );

        // Angle spike outward
        spike.rotation.z = mirrorFactor * Math.PI / 2;

        fistGroup.add(spike);
    }

    // Add shine effect
    if (lightCount < maxLights) {
        const fistLight = new THREE.PointLight(0xaaddff, 0.3, 2);
        fistLight.position.set(0, 0, 0);
        fistGroup.add(fistLight);
        lightCount++;
    }

    parent.add(fistGroup);
    return fistGroup;
}

// Helper function to create ice spikes around the head
function createIceSpikes(parent, yPosition) {
    const spikeGroup = new THREE.Group();
    spikeGroup.position.y = yPosition - 0.5; // Position at top of head

    // Create a crown of ice spikes
    const spikeCount = 14; // More spikes for fuller appearance
    const baseRadius = 0.6; // Radius around head
    const heightVariation = 0.4; // Variation in spike heights

    for (let i = 0; i < spikeCount; i++) {
        // Vary spike properties
        const height = 0.4 + Math.random() * heightVariation;
        const width = 0.1 + Math.random() * 0.1;

        // Create spike
        const spikeGeometry = new THREE.ConeGeometry(width, height, 4);
        const spikeMaterial = new THREE.MeshStandardMaterial({
            color: 0xccffff, // Brighter white-blue
            emissive: 0xaaddff,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.9,
            flatShading: true
        });

        const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);

        // Position in a circle with some randomness
        const angle = (i / spikeCount) * Math.PI * 2;
        const radiusVariation = Math.random() * 0.2;
        const radius = baseRadius + radiusVariation;

        spike.position.set(
            Math.sin(angle) * radius,
            0.2 + Math.random() * 0.3, // Vary height
            Math.cos(angle) * radius
        );

        // Point outward from center
        spike.lookAt(0, spike.position.y - 2, 0);

        // Randomly skew spike a bit
        spike.rotation.x += (Math.random() - 0.5) * 0.5;
        spike.rotation.z += (Math.random() - 0.5) * 0.5;

        spikeGroup.add(spike);
    }

    // Add extra large spikes on top
    const topSpikeCount = 5;
    for (let i = 0; i < topSpikeCount; i++) {
        const height = 0.7 + Math.random() * 0.3;
        const width = 0.15 + Math.random() * 0.1;

        const topSpikeGeometry = new THREE.ConeGeometry(width, height, 4);
        const topSpikeMaterial = new THREE.MeshStandardMaterial({
            color: 0xddffff,
            emissive: 0xaaddff,
            emissiveIntensity: 0.4,
            transparent: true,
            opacity: 0.95,
            flatShading: true
        });

        const topSpike = new THREE.Mesh(topSpikeGeometry, topSpikeMaterial);

        // Position more centrally on top
        const angle = (i / topSpikeCount) * Math.PI * 2;
        const smallerRadius = 0.2 + Math.random() * 0.2;

        topSpike.position.set(
            Math.sin(angle) * smallerRadius,
            0.6 + Math.random() * 0.2, // Higher on head
            Math.cos(angle) * smallerRadius
        );

        // Make spikes point more upward
        topSpike.rotation.x = (Math.random() - 0.5) * 0.3;
        topSpike.rotation.z = (Math.random() - 0.5) * 0.3;

        spikeGroup.add(topSpike);
    }

    // Add light effect in spikes
    if (lightCount < maxLights) {
        const spikeLight = new THREE.PointLight(0xccffff, 0.7, 3);
        spikeLight.position.set(0, 0.5, 0);
        spikeGroup.add(spikeLight);
        lightCount++;

        spikeLight.userData.offset = Math.random() * Math.PI * 2;
        spikeLight.userData.animationType = 'iceLight';
        animatedObjects.push(spikeLight);
    }

    parent.add(spikeGroup);
    return spikeGroup;
}

// Helper function to create flame effect for hands and head
function createFlameEffect(parent, x, y, z, scale, intensity) {
    const flameGroup = new THREE.Group();
    flameGroup.position.set(x, y, z);
    flameGroup.scale.set(scale, scale, scale);

    // Core of the flame - bright yellow/white
    const coreGeo = new THREE.DodecahedronGeometry(0.3, 0);
    const coreMat = new THREE.MeshBasicMaterial({
        color: 0xffffaa,
        transparent: true,
        opacity: 0.9
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.scale.set(0.7, 1, 0.7); // Make it taller
    flameGroup.add(core);

    // Add animated core light if possible
    if (lightCount < maxLights) {
        const coreLight = new THREE.PointLight(0xffcc00, 0.8 * intensity, 3);
        coreLight.position.set(0, 0, 0);
        flameGroup.add(coreLight);
        lightCount++;

        // Add flame animation
        coreLight.userData.offset = Math.random() * Math.PI * 2;
        coreLight.userData.animationType = 'fireLight';
        animatedObjects.push(coreLight);
    }

    // Outer flame - red/orange
    const flameCount = 6;
    const flameColors = [0xff3300, 0xff5500, 0xff7700];

    for (let i = 0; i < flameCount; i++) {
        // Create flame shape - use low-poly geometry
        const shape = Math.floor(Math.random() * 3);
        let flameGeo;

        if (shape === 0) {
            flameGeo = new THREE.ConeGeometry(0.2, 0.6, 4);
        } else if (shape === 1) {
            flameGeo = new THREE.TetrahedronGeometry(0.3, 0);
        } else {
            flameGeo = new THREE.DodecahedronGeometry(0.25, 0);
        }

        const flameMat = new THREE.MeshStandardMaterial({
            color: flameColors[i % flameColors.length],
            emissive: 0xff5500,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.8,
            flatShading: true
        });

        const flame = new THREE.Mesh(flameGeo, flameMat);

        // Position flames around core with some randomness
        const angle = (i / flameCount) * Math.PI * 2;
        const radius = 0.2 + Math.random() * 0.1;
        flame.position.set(
            Math.sin(angle) * radius,
            0.1 + Math.random() * 0.3,
            Math.cos(angle) * radius
        );

        // Scale and rotate randomly for more natural look
        flame.scale.set(
            0.8 + Math.random() * 0.4,
            1 + Math.random() * 0.5,
            0.8 + Math.random() * 0.4
        );

        flame.rotation.x = Math.random() * Math.PI;
        flame.rotation.z = Math.random() * Math.PI;

        // Add animation data
        flame.userData.baseY = flame.position.y;
        flame.userData.speed = 1 + Math.random() * 2;
        flame.userData.offset = Math.random() * Math.PI * 2;
        flame.userData.animationType = 'fire';

        flameGroup.add(flame);
        animatedObjects.push(flame);
    }

    parent.add(flameGroup);
    return flameGroup;
}

// Enhanced soul drain effect for necromancer's special attacks
function enhancedSoulDrainEffect(enemy) {
    // Create soul drain particle effect
    const soulGroup = new THREE.Group();

    // Create distinct skull-shaped particles
    for (let i = 0; i < 10; i++) {
        // Use tetrahedron for small skull-like shapes
        const particleGeo = new THREE.TetrahedronGeometry(0.08, 0);
        const particleMat = new THREE.MeshBasicMaterial({
            color: 0xcc66ff,
            transparent: true,
            opacity: 0.7
        });
        const particle = new THREE.Mesh(particleGeo, particleMat);

        // Start at random position on enemy
        const radius = 0.6 * enemy.scale;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;

        particle.position.set(
            radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.cos(phi) + 1.5 * enemy.scale,
            radius * Math.sin(phi) * Math.sin(theta)
        );

        // Store initial position and target (player position)
        particle.userData = {
            initialPos: particle.position.clone(),
            initialTime: Date.now(),
            speed: 0.5 + Math.random() * 0.5
        };

        soulGroup.add(particle);
    }

    soulGroup.position.copy(enemy.mesh.position);
    scene.add(soulGroup);

    // Add eerie light
    let soulLight = null;
    if (lightCount < maxLights) {
        soulLight = new THREE.PointLight(0xcc33ff, 0.6, 6);
        soulLight.position.set(0, 1.5, 0);
        soulGroup.add(soulLight);
        lightCount++;
    }

    // Animate particles to flow toward player
    const startTime = Date.now();
    const effectDuration = 1200; // milliseconds

    // Calculate vector from enemy to player
    const toPlayer = new THREE.Vector3();

    const animateDrain = () => {
        const elapsed = Date.now() - startTime;
        if (elapsed < effectDuration) {
            // Get current direction to player
            toPlayer.subVectors(player.position, enemy.mesh.position).normalize();

            // Move particles toward player
            soulGroup.children.forEach((particle, index) => {
                if (particle.isLight) return; // Skip light

                // Progress determines speed (accelerate as they get closer)
                const progress = elapsed / effectDuration;
                const particleTime = Date.now() - particle.userData.initialTime;
                const particleProgress = Math.min(1, particleTime / (effectDuration * 0.8));

                // Apply curved path with acceleration
                const curveStrength = 0.3;
                const speedFactor = 0.05 + (particleProgress * 0.15); // Accelerate

                // Create curved path using sin function
                const curve = Math.sin(particleProgress * Math.PI) * curveStrength;
                const upVector = new THREE.Vector3(0, 1, 0);
                const sideVector = new THREE.Vector3().crossVectors(toPlayer, upVector).normalize();

                // Apply curved path offset
                const offset = sideVector.clone().multiplyScalar(curve * (index % 2 === 0 ? 1 : -1));

                // Move toward player on curve
                const newPos = new THREE.Vector3().addVectors(
                    particle.userData.initialPos,
                    new THREE.Vector3().addVectors(
                        toPlayer.clone().multiplyScalar(particleProgress * 4),
                        offset
                    )
                );

                particle.position.lerp(newPos, speedFactor);

                // Rotate particles
                particle.rotation.x += 0.05;
                particle.rotation.y += 0.05;

                // Fade out at the end
                if (progress > 0.7) {
                    const fade = 1 - ((progress - 0.7) / 0.3);
                    if (particle.material) {
                        particle.material.opacity = fade * 0.7;
                    }
                }

                // Scale down as they get closer to player
                const scale = 1 - (particleProgress * 0.7);
                particle.scale.set(scale, scale, scale);
            });

            // Animate light intensity
            if (soulLight) {
                soulLight.intensity = 0.6 * (1 - (elapsed / effectDuration) * 0.8);
            }

            requestAnimationFrame(animateDrain);
        } else {
            // Clean up when done
            if (soulLight) {
                lightCount = Math.max(0, lightCount - 1);
            }
            scene.remove(soulGroup);
        }
    };

    animateDrain();
}

// Helper function to create steam particles for mechanical boss

// Add orientation check function near the top of the script
function checkOrientation() {
    if (!isMobile) return;

    const rotateMessage = document.getElementById('rotateDevice');
    if (window.innerHeight > window.innerWidth) {
        // Portrait mode
        rotateMessage.style.display = 'flex';
        if (isRunning) {
            // Pause game if it's running
            isRunning = false;
        }
    } else {
        // Landscape mode
        rotateMessage.style.display = 'none';
        if (!isRunning && document.getElementById('gameTitle').style.display === 'none') {
            // Resume game if it was started (title is hidden)
            isRunning = true;
            if (!window.animationFrameId) {
                requestAnimationFrame(animate);
            }
        }
    }
}

// Remove all fullscreen-related event listeners and functions
if (isMobile) {
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    // Initial check
    checkOrientation();
}
