// 相机管理器 - 处理所有相机控制模式和切换
class CameraManager {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.currentMode = 'orbit';
        
        // 相机状态
        this.cameraStates = {
            orbit: {
                position: { x: 0, y: 5, z: 15 },
                target: { x: 0, y: 0, z: 0 }
            },
            drone: {
                position: { x: 0, y: 5, z: 15 },
                rotation: { x: 0, y: 0 }
            }
        };

        // 穿梭无人机控制
        this.droneControls = {
            moveSpeed: 0.5,
            lookSpeed: 0.002,
            keys: {
                forward: false,
                backward: false,
                left: false,
                right: false,
                up: false,
                down: false
            },
            mouse: {
                x: 0,
                y: 0,
                isDown: false
            },
            horizonIndicator: true // 水平仪指示器
        };

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.saveInitialState();
    }

    setupEventListeners() {
        // 键盘事件
        document.addEventListener('keydown', (event) => this.onKeyDown(event));
        document.addEventListener('keyup', (event) => this.onKeyUp(event));
        
        // 鼠标事件
        document.addEventListener('mousedown', (event) => this.onMouseDown(event));
        document.addEventListener('mouseup', (event) => this.onMouseUp(event));
        document.addEventListener('mousemove', (event) => this.onMouseMove(event));
        
        // 鼠标滚轮事件
        document.addEventListener('wheel', (event) => this.onWheel(event));
    }

    saveInitialState() {
        const camera = this.sceneManager.camera;
        this.cameraStates.orbit.position = {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z
        };
        this.cameraStates.orbit.target = {
            x: this.sceneManager.controls.target.x,
            y: this.sceneManager.controls.target.y,
            z: this.sceneManager.controls.target.z
        };
    }

    // 切换相机模式
    switchMode(mode) {
        if (this.currentMode === mode) return;

        const oldMode = this.currentMode;
        this.currentMode = mode;

        // 保存当前状态
        this.saveCurrentState(oldMode);

        // 禁用旧模式的控制
        this.disableControls(oldMode);

        // 启用新模式的控制
        this.enableControls(mode);

        // 恢复新模式的状态
        this.restoreState(mode);

        console.log(`相机模式切换: ${oldMode} -> ${mode}`);
        
        // 更新UI
        if (window.webglEditor && window.webglEditor.uiManager) {
            window.webglEditor.uiManager.updateCameraControls();
        }

        // 设置第一人称模式的初始状态
        if (mode === 'firstPerson') {
            this.setupFirstPersonMode();
        }
    }

    saveCurrentState(mode) {
        const camera = this.sceneManager.camera;
        
        switch (mode) {
            case 'orbit':
                this.cameraStates.orbit.position = {
                    x: camera.position.x,
                    y: camera.position.y,
                    z: camera.position.z
                };
                this.cameraStates.orbit.target = {
                    x: this.sceneManager.controls.target.x,
                    y: this.sceneManager.controls.target.y,
                    z: this.sceneManager.controls.target.z
                };
                break;
                
            case 'firstPerson':
                this.cameraStates.firstPerson.position = {
                    x: camera.position.x,
                    y: camera.position.y,
                    z: camera.position.z
                };
                this.cameraStates.firstPerson.rotation = {
                    x: camera.rotation.x,
                    y: camera.rotation.y
                };
                break;
                
            case 'free':
                this.cameraStates.free.position = {
                    x: camera.position.x,
                    y: camera.position.y,
                    z: camera.position.z
                };
                this.cameraStates.free.rotation = {
                    x: camera.rotation.x,
                    y: camera.rotation.y
                };
                break;
        }
    }

    restoreState(mode) {
        const camera = this.sceneManager.camera;
        const state = this.cameraStates[mode];
        
        switch (mode) {
            case 'orbit':
                camera.position.set(state.position.x, state.position.y, state.position.z);
                this.sceneManager.controls.target.set(state.target.x, state.target.y, state.target.z);
                this.sceneManager.controls.enabled = true;
                break;
                
            case 'firstPerson':
                camera.position.set(state.position.x, state.position.y, state.position.z);
                camera.rotation.x = state.rotation.x;
                camera.rotation.y = state.rotation.y;
                camera.lookAt(
                    camera.position.x + Math.sin(camera.rotation.y),
                    camera.position.y + Math.sin(camera.rotation.x),
                    camera.position.z - Math.cos(camera.rotation.y)
                );
                break;
                
            case 'free':
                camera.position.set(state.position.x, state.position.y, state.position.z);
                camera.rotation.x = state.rotation.x;
                camera.rotation.y = state.rotation.y;
                break;
        }
    }

    disableControls(mode) {
        switch (mode) {
            case 'orbit':
                this.sceneManager.controls.enabled = false;
                break;
        }
    }

    enableControls(mode) {
        // 控制器的启用在各个模式的update方法中处理
    }

    // 设置第一人称模式
    setupFirstPersonMode() {
        // 锁定鼠标指针
        this.sceneManager.renderer.domElement.requestPointerLock();
        
        // 设置初始相机位置
        const camera = this.sceneManager.camera;
        camera.position.set(0, 2, 5); // 人眼高度
        camera.rotation.set(0, 0, 0);
        
        // 重置控制状态
        this.firstPersonControls.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            up: false,
            down: false
        };
        
        console.log('第一人称模式已设置');
    }

    // 更新相机
    update(deltaTime) {
        switch (this.currentMode) {
            case 'orbit':
                this.updateOrbitControls(deltaTime);
                break;
            case 'drone':
                this.updateDroneControls(deltaTime);
                break;
        }
    }

    updateOrbitControls(deltaTime) {
        if (this.sceneManager.controls.enabled) {
            this.sceneManager.controls.update();
        }
    }

    updateDroneControls(deltaTime) {
        const camera = this.sceneManager.camera;
        const controls = this.droneControls;
        const moveSpeed = controls.moveSpeed * deltaTime * 60; // 基于60fps标准化
        
        // 计算前进方向
        const forward = new THREE.Vector3(
            -Math.sin(camera.rotation.y),
            0,
            -Math.cos(camera.rotation.y)
        );
        
        // 计算右方向
        const right = new THREE.Vector3(
            Math.cos(camera.rotation.y),
            0,
            -Math.sin(camera.rotation.y)
        );
        
        // 处理移动
        if (controls.keys.forward) {
            camera.position.add(forward.multiplyScalar(moveSpeed));
        }
        if (controls.keys.backward) {
            camera.position.sub(forward.multiplyScalar(moveSpeed));
        }
        if (controls.keys.left) {
            camera.position.sub(right.multiplyScalar(moveSpeed));
        }
        if (controls.keys.right) {
            camera.position.add(right.multiplyScalar(moveSpeed));
        }
        if (controls.keys.up) {
            camera.position.y += moveSpeed;
        }
        if (controls.keys.down) {
            camera.position.y -= moveSpeed;
        }
        
        // 保持水平仪功能 - 限制垂直旋转角度
        camera.rotation.x = Math.max(-Math.PI/3, Math.min(Math.PI/3, camera.rotation.x));
    }

    updateFreeCameraControls(deltaTime) {
        const camera = this.sceneManager.camera;
        const controls = this.freeCameraControls;
        const moveSpeed = controls.moveSpeed * deltaTime * 60;
        
        // 计算方向向量
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        
        const right = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        right.crossVectors(direction, up).normalize();
        
        // 处理移动
        if (controls.keys.forward) {
            camera.position.add(direction.multiplyScalar(moveSpeed));
        }
        if (controls.keys.backward) {
            camera.position.sub(direction.multiplyScalar(moveSpeed));
        }
        if (controls.keys.left) {
            camera.position.sub(right.multiplyScalar(moveSpeed));
        }
        if (controls.keys.right) {
            camera.position.add(right.multiplyScalar(moveSpeed));
        }
        if (controls.keys.up) {
            camera.position.y += moveSpeed;
        }
        if (controls.keys.down) {
            camera.position.y -= moveSpeed;
        }
    }

    // 键盘事件处理
    onKeyDown(event) {
        if (this.currentMode === 'drone') {
            this.handleDroneKeyDown(event);
        }
    }

    onKeyUp(event) {
        if (this.currentMode === 'drone') {
            this.handleDroneKeyUp(event);
        }
    }

    handleDroneKeyDown(event) {
        const controls = this.droneControls;
        switch (event.code) {
            case 'KeyW':
                controls.keys.forward = true;
                break;
            case 'KeyS':
                controls.keys.backward = true;
                break;
            case 'KeyA':
                controls.keys.left = true;
                break;
            case 'KeyD':
                controls.keys.right = true;
                break;
            case 'KeyQ':
                controls.keys.down = true;
                break;
            case 'KeyE':
                controls.keys.up = true;
                break;
        }
    }

    handleDroneKeyUp(event) {
        const controls = this.droneControls;
        switch (event.code) {
            case 'KeyW':
                controls.keys.forward = false;
                break;
            case 'KeyS':
                controls.keys.backward = false;
                break;
            case 'KeyA':
                controls.keys.left = false;
                break;
            case 'KeyD':
                controls.keys.right = false;
                break;
            case 'KeyQ':
                controls.keys.down = false;
                break;
            case 'KeyE':
                controls.keys.up = false;
                break;
        }
    }

    handleFreeCameraKeyDown(event) {
        const controls = this.freeCameraControls;
        switch (event.code) {
            case 'KeyW':
                controls.keys.forward = true;
                break;
            case 'KeyS':
                controls.keys.backward = true;
                break;
            case 'KeyA':
                controls.keys.left = true;
                break;
            case 'KeyD':
                controls.keys.right = true;
                break;
            case 'KeyQ':
                controls.keys.down = true;
                break;
            case 'KeyE':
                controls.keys.up = true;
                break;
        }
    }

    handleFreeCameraKeyUp(event) {
        const controls = this.freeCameraControls;
        switch (event.code) {
            case 'KeyW':
                controls.keys.forward = false;
                break;
            case 'KeyS':
                controls.keys.backward = false;
                break;
            case 'KeyA':
                controls.keys.left = false;
                break;
            case 'KeyD':
                controls.keys.right = false;
                break;
            case 'KeyQ':
                controls.keys.down = false;
                break;
            case 'KeyE':
                controls.keys.up = false;
                break;
        }
    }

    // 鼠标事件处理
    onMouseDown(event) {
        if (this.currentMode === 'firstPerson' || this.currentMode === 'free') {
            if (event.button === 0) { // 左键
                if (this.currentMode === 'firstPerson') {
                    this.firstPersonControls.mouse.isDown = true;
                } else {
                    this.freeCameraControls.mouse.isDown = true;
                }
                document.body.style.cursor = 'none';
            }
        }
    }

    onMouseUp(event) {
        if (this.currentMode === 'firstPerson') {
            this.firstPersonControls.mouse.isDown = false;
        } else if (this.currentMode === 'free') {
            this.freeCameraControls.mouse.isDown = false;
        }
        document.body.style.cursor = 'default';
    }

    onMouseMove(event) {
        if (this.currentMode === 'firstPerson' && this.firstPersonControls.mouse.isDown) {
            this.handleFirstPersonMouseMove(event);
        } else if (this.currentMode === 'free' && this.freeCameraControls.mouse.isDown) {
            this.handleFreeCameraMouseMove(event);
        }
    }

    handleFirstPersonMouseMove(event) {
        const camera = this.sceneManager.camera;
        const controls = this.firstPersonControls;
        
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;
        
        // 水平旋转
        camera.rotation.y -= movementX * controls.lookSpeed;
        
        // 垂直旋转（限制角度）
        camera.rotation.x -= movementY * controls.lookSpeed;
        camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
        
        // 更新相机朝向
        camera.lookAt(
            camera.position.x + Math.sin(camera.rotation.y),
            camera.position.y + Math.sin(camera.rotation.x),
            camera.position.z - Math.cos(camera.rotation.y)
        );
    }

    handleFreeCameraMouseMove(event) {
        const camera = this.sceneManager.camera;
        const controls = this.freeCameraControls;
        
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;
        
        // 水平旋转
        camera.rotation.y -= movementX * controls.lookSpeed;
        
        // 垂直旋转
        camera.rotation.x -= movementY * controls.lookSpeed;
        camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
    }

    onWheel(event) {
        if (this.currentMode === 'orbit') {
            // 轨道控制器的缩放由OrbitControls处理
            return;
        }
        
        const camera = this.sceneManager.camera;
        const delta = event.deltaY * 0.01;
        
        if (this.currentMode === 'firstPerson') {
            // 第一人称模式下滚轮控制速度
            this.firstPersonControls.moveSpeed = Math.max(0.01, Math.min(1.0, this.firstPersonControls.moveSpeed + delta * 0.01));
        } else if (this.currentMode === 'free') {
            // 自由相机模式下滚轮控制速度
            this.freeCameraControls.moveSpeed = Math.max(0.1, Math.min(5.0, this.freeCameraControls.moveSpeed + delta * 0.1));
        }
    }

    // 重置相机
    resetCamera() {
        this.switchMode('orbit');
        this.restoreState('orbit');
        console.log('相机已重置');
    }

    // 居中视图
    centerView() {
        const models = window.webglEditor.modelManager.getAllModels();
        if (models.length === 0) return;

        // 计算所有模型的边界框
        const box = new THREE.Box3();
        models.forEach(model => {
            model.updateMatrixWorld();
            box.expandByObject(model);
        });

        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        // 设置相机位置
        const distance = maxDim * 2;
        this.sceneManager.camera.position.set(
            center.x + distance,
            center.y + distance * 0.5,
            center.z + distance
        );

        this.sceneManager.controls.target.copy(center);
        this.saveCurrentState('orbit');
    }

    // 设置移动速度
    setMoveSpeed(speed) {
        this.firstPersonControls.moveSpeed = speed;
        this.freeCameraControls.moveSpeed = speed * 2; // 自由相机移动速度更快
    }

    // 获取当前模式
    getCurrentMode() {
        const modeNames = {
            'orbit': '轨道控制',
            'drone': '穿梭无人机'
        };
        return modeNames[this.currentMode] || this.currentMode;
    }

    // 获取相机数据（用于场景保存）
    getCameraData() {
        const camera = this.sceneManager.camera;
        return {
            mode: this.currentMode,
            position: {
                x: camera.position.x,
                y: camera.position.y,
                z: camera.position.z
            },
            rotation: {
                x: camera.rotation.x,
                y: camera.rotation.y,
                z: camera.rotation.z
            },
            states: this.cameraStates
        };
    }

    // 从数据加载相机配置
    loadCameraData(cameraData) {
        if (cameraData.states) {
            this.cameraStates = { ...this.cameraStates, ...cameraData.states };
        }
        
        if (cameraData.mode) {
            this.switchMode(cameraData.mode);
        }
        
        if (cameraData.position) {
            const pos = cameraData.position;
            this.sceneManager.camera.position.set(pos.x, pos.y, pos.z);
        }
        
        console.log('已从数据加载相机配置');
    }
}