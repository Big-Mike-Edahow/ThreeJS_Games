// script.js

import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Create SceneManager.
const canvas = document.getElementById("canvas");
const sceneManager = new SceneManager(canvas);

// Handle DOM events.
bindEventListeners();

// Render Loop.
render();

function SceneManager(canvas) {
    const screenDimensions = {
        width: canvas.width,
        height: canvas.height
    };

    const scene = buildScene();
    const renderer = buildRender(screenDimensions);
    const camera = buildCamera(screenDimensions);
    var theSpaceship, theBackground, theCoins, theEnemies;

    const ambientLight = new THREE.AmbientLight('#ffffff', 1.5);
    scene.add(ambientLight);

    const dynamicSubjects = [];
    createSceneSubjects();
    let theMissiles = [];

    let keyMap = [];

    let score = 0;
    let health = 3;
    let gameEnded = false;

    function buildScene() {
        const scene = new THREE.Scene();
        return scene;
    }

    function buildRender({ width, height }) {
        const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
        renderer.setClearColor("#222222");
        renderer.setSize(width, height);

        return renderer;
    }

    function buildCamera({ width, height }) {
        const nearPlane = 1;
        const farPlane = 1000;
        const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, nearPlane, farPlane);
        camera.position.z = 10;

        return camera;
    }

    function createSceneSubjects() {
        theBackground = new Background(scene);
        theSpaceship = new Spaceship(scene);
        theCoins = placeCoins(scene);
        theEnemies = placeEnemies(scene);

        dynamicSubjects.push(theSpaceship);
    }

    this.update = function () {
        if (camera.position.y < 2000 && health > 0) {
            camera.position.y += 1;

            for (let i = 0; i < dynamicSubjects.length; i++)
                dynamicSubjects[i].update();

            [theCoins, theEnemies, theMissiles, score, health] = checkCollisions(scene, theSpaceship, theCoins, theEnemies, theMissiles, score, health);

            theMissiles = destroyMissiles(scene, theMissiles);

            // Handling Inputs
            // ========================================
            theSpaceship.handleInput(keyMap, camera);
            if (keyMap[32]) {

                var x = theSpaceship.model.position.x;
                var y = theSpaceship.model.position.y + theSpaceship.height / 2;

                const m = new Missile(scene, x, y);

                dynamicSubjects.push(m);
                theMissiles.push(m);
                keyMap[32] = false;
            }

            renderer.render(scene, camera);

        }
        else if (!gameEnded) {
            gameEnded = true;
            if (health > 0)
                document.getElementById("gameover").innerHTML = "GAME OVER";
            else
                document.getElementById("gameover").innerHTML = "YOU LOST";
        }
    }

    this.onWindowResize = function () {
        const { width, height } = canvas;

        screenDimensions.width = width;
        screenDimensions.height = height;

        renderer.setSize(width, height);

        camera.left = -width / 2;
        camera.right = width / 2;
        camera.top = height / 2;
        camera.bottom = -height / 2;
        camera.updateProjectionMatrix();
    }

    this.handleInput = function (keyCode, isDown) {
        keyMap[keyCode] = isDown;
    }
}

function bindEventListeners() {
    window.onresize = resizeCanvas;
    resizeCanvas();

    window.onkeydown = handleKeyDown;
    window.onkeyup = handleKeyUp;
}

function resizeCanvas() {
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    sceneManager.onWindowResize();
}

function handleKeyDown(event) {
    var keyCode = event.which;
    sceneManager.handleInput(keyCode, true);
}

function handleKeyUp(event) {
    var keyCode = event.which;
    sceneManager.handleInput(keyCode, false);
}

function render() {
    requestAnimationFrame(render);
    sceneManager.update();
}

// Create a plane, add texture to it, position it and then add to the scene
function Background(scene, height) {
    var geometry = new THREE.PlaneGeometry(3000, 3000);
    const textureLoader = new THREE.TextureLoader();
    var material = new THREE.MeshBasicMaterial({ map: textureLoader.load("static/textures/bg.png") });
    var bg = new THREE.Mesh(geometry, material);

    bg.rotation.z = -Math.PI / 2;
    bg.position.z = -900;
    bg.position.y = 1000;

    scene.add(bg);

    this.update = function () {
    }
}

function Spaceship(scene) {
    const modelLoader = new OBJLoader();
    const textureLoader = new THREE.TextureLoader();
    const texMap = textureLoader.load("static/textures/spaceship.png");
    const modelMaterial = new THREE.MeshBasicMaterial({ map: texMap });

    this.model;
    this.height;
    this.width;

    modelLoader.load
        (
            "static/models/spaceship.obj",
            (function (obj) {

                this.model = obj;
                this.model.traverse(function (child) {
                    if (child.isMesh) {
                        child.material = modelMaterial;
                    }
                }
                )

                this.model.rotation.x = -Math.PI / 2;

                scene.add(this.model);

                var planeBndBox = new THREE.Box3().setFromObject(this.model);
                this.height = planeBndBox.getSize().y;
                this.width = planeBndBox.getSize().x;

            }).bind(this)
        );

    this.update = function () {
        if (this.model)
            this.model.position.y += 1;
    }

    this.handleInput = function (keyMap, camera) {

        if (keyMap[87] && (this.model.position.y + this.height / 2 < camera.position.y + camera.top)) {
            this.model.position.y += 5;
        }
        if (keyMap[83] && (this.model.position.y - this.height / 2 > camera.position.y + camera.bottom)) {
            this.model.position.y -= 5;
        }
        if (keyMap[68] && (this.model.position.x + this.width / 2 < camera.right)) {
            this.model.position.x += 5;
        }
        if (keyMap[65] && (this.model.position.x - this.width / 2 > camera.left)) {
            this.model.position.x -= 5;
        }
    }
}

function Enemy(scene, x, y) {
    const modelLoader = new GLTFLoader();
    this.model;
    this.height;
    this.width;

    modelLoader.load
        (
            "static/models/enemy/enemy.gltf",
            (function (obj) {
                this.model = obj.scene;

                this.model.rotation.x = Math.PI / 2;
                this.model.rotation.y = -Math.PI / 2;

                this.model.position.set(x, y, -100);
                this.model.scale.set(0.2, 0.2, 0.2);

                scene.add(this.model);
                var enemyBndBox = new THREE.Box3().setFromObject(this.model);
                this.height = enemyBndBox.getSize().y;
                this.width = enemyBndBox.getSize().x;
            }).bind(this)
        )

    this.destroy = function () {
        scene.remove(this.model);
    }
}

function placeEnemies(scene) {

    const theEnemies = [];

    [...Array(5).keys()].map(y => {

        getRandomPositions().map(x => {
            const e = new Enemy(scene, 200 * (x - 4), 400 * (y + 1));
            theEnemies.push(e);
        });
    });

    return theEnemies;

    function getRandomPositions() {
        var noEnemies = Math.floor((Math.random() * 4));
        var arr = [...Array(9).keys()];

        for (let i = arr.length - 1; i > 0; i--) {

            const j = Math.floor(Math.random() * i);
            const temp = arr[i];
            arr[i] = arr[j];
            arr[j] = temp;
        }
        return arr.slice(0, noEnemies);
    }
}

function Missile(scene, x, y) {
    const modelLoader = new GLTFLoader();
    this.model;
    this.height;
    this.width;

    modelLoader.load
        (
            "static/models/missile/missile.gltf",
            (function (obj) {
                this.model = obj.scene;

                this.model.rotation.y = -Math.PI;

                this.model.position.set(x, y, -100);
                this.model.scale.set(0.5, 0.5, 0.5);

                scene.add(this.model);

                var missileBndBox = new THREE.Box3().setFromObject(this.model);
                this.height = missileBndBox.getSize().y;
                this.width = missileBndBox.getSize().x;

            }).bind(this)
        )

    this.update = function () {
        if (this.model)
            this.model.position.y += 10;
    }
}

function Coin(scene, x, y) {
    const radius = 20;
    const geometry = new THREE.CircleGeometry(radius, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xfbb000 });
    this.model = new THREE.Mesh(geometry, material);
    this.model.position.set(x, y, -500);

    scene.add(this.model);

    this.height = 2 * radius;
    this.width = 2 * radius;
}


function placeCoins(scene) {

    const theCoins = [];
    [...Array(10).keys()].map(y => {
        getRandomPositions().map(x => {
            const c = new Coin(scene, 100 * (x - 7), 200 * (y + 1));
            theCoins.push(c);
        });

    });

    return theCoins;

    function getRandomPositions() {
        var noCoins = Math.floor((Math.random() * 6));
        var arr = [...Array(15).keys()];

        for (let i = arr.length - 1; i > 0; i--) {

            const j = Math.floor(Math.random() * i);
            const temp = arr[i];
            arr[i] = arr[j];
            arr[j] = temp;
        }
        return arr.slice(0, noCoins);
    }
}

function checkCollisions(scene, theSpaceship, theCoins, theEnemies, theMissiles, score, health) {
    var i = theCoins.length;
    while (i--) {
        if (isCollision(theSpaceship, theCoins[i])) {
            score += 1;
            scene.remove(theCoins[i].model);
            theCoins.splice(i, 1);
            document.getElementById("scoreboard").innerHTML = "HEALTH: " + health + " &emsp; SCORE: " + score;
        }
    }

    var i = theEnemies.length;
    while (i--) {
        if (isCollision(theSpaceship, theEnemies[i])) {
            health -= 1;
            scene.remove(theEnemies[i].model);
            theEnemies.splice(i, 1);
            document.getElementById("scoreboard").innerHTML = "HEALTH: " + health + " &emsp; SCORE: " + score;
        }

        var j = theMissiles.length;
        while (j--) {
            if (isCollision(theMissiles[j], theEnemies[i])) {
                score += 2;
                scene.remove(theEnemies[i].model);
                theEnemies.splice(i, 1);
                scene.remove(theMissiles[j].model);
                theMissiles.splice(j, 1);
                document.getElementById("scoreboard").innerHTML = "HEALTH: " + health + " &emsp; SCORE: " + score;
            }
        }
    }
    return [theCoins, theEnemies, theMissiles, score, health];
}

function isCollision(m1, m2) {
    let minX1, minX2, maxX1, maxX2;
    let minY1, minY2, maxY1, maxY2;

    if (m1.model && m2.model) {
        minX1 = m1.model.position.x - (m1.width / 2);
        maxX1 = m1.model.position.x + (m1.width / 2);
        minY1 = m1.model.position.y - (m1.height / 2);
        maxY1 = m1.model.position.y + (m1.height / 2);

        minX2 = m2.model.position.x - (m2.width / 2);
        maxX2 = m2.model.position.x + (m2.width / 2);
        minY2 = m2.model.position.y - (m2.height / 2);
        maxY2 = m2.model.position.y + (m2.height / 2);

        if (minX1 <= maxX2 && maxX1 >= minX2 && minY1 <= maxY2 && maxY1 >= minY2)
            return true;
        else
            return false;
    }
    else
        return false;
}

function destroyMissiles(scene, theMissiles) {

    var j = theMissiles.length;
    while (j--) {
        if (theMissiles[j].model && theMissiles[j].model.position.z < -2400) {
            scene.remove(theMissiles[j].model);
            theMissiles.splice(j, 1);
        }
    }
    return theMissiles;
}
