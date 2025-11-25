// 场景管理器
class SceneManager {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        // 光源
        this.ambientLight = null;
        this.directionalLights = [];

        // 场景状态
        this.autoRotate = false;
        this.rotationSpeed = 0.01;

        // 模型集合
        this.models = [];
        this.selectedModel = null;

        // 第一人称控制相关
        this.firstPersonMode = false;
        this.firstPersonControls = null;
        this.flashlight = null;
        this.moveSpeed = 0.1;
        this.lookSpeed = 0.002; // 鼠标灵敏度

        // 鼠标控制相关
        this.mouseX = 0;
        this.mouseY = 0;
        this.previousMouseX = 0;
        this.previousMouseY = 0;
        this.isMouseDown = false;
        this.currentLightingAlgorithm = 'standard';
    }

    // 初始化场景
    async init() {
        // 创建场景
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        this.scene.fog = new THREE.Fog(0x1a1a2e, 10, 50);

        // 创建相机
        this.camera = new THREE.PerspectiveCamera(
            45,
            this.canvas.clientWidth / this.canvas.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 5, 15);
        this.camera.lookAt(0, 0, 0);

        // 创建渲染器
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // 创建轨道控制器
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 50;
        this.controls.maxPolarAngle = Math.PI;

        this.firstPersonMode = false;
        this.firstPersonControls = null;
        this.flashlight = null;
        this.moveSpeed = 0.1;
        this.rotationSpeed = 0.002;

        // 设置光源
        this.setupLights();

        // 设置地面
        this.setupGround();
        // 设置天空盒
        this.setupSkybox();

        // 处理窗口大小变化
        window.addEventListener('resize', () => this.onWindowResize());

        console.log('Three.js场景初始化完成');
    }

    // 设置光源
    setupLights() {
        // 环境光
        this.ambientLight = new THREE.AmbientLight(0x404040, 0.3);
        this.scene.add(this.ambientLight);

        // 主方向光
        const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
        mainLight.position.set(5, 10, 7);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        mainLight.shadow.camera.near = 0.5;
        mainLight.shadow.camera.far = 50;
        mainLight.shadow.camera.left = -20;
        mainLight.shadow.camera.right = 20;
        mainLight.shadow.camera.top = 20;
        mainLight.shadow.camera.bottom = -20;

        this.scene.add(mainLight);
        this.directionalLights.push(mainLight);

        // 辅助光源
        const fillLight = new THREE.DirectionalLight(0x7fbfff, 0.5);
        fillLight.position.set(-5, 3, -5);
        this.scene.add(fillLight);
        this.directionalLights.push(fillLight);
    }

    // 设置地面
    setupGround() {
        // 创建带纹理的地面
        const groundGeometry = new THREE.PlaneGeometry(500, 500);

        // 加载地面纹理
        const textureLoader = new THREE.TextureLoader();
        const groundTexture = textureLoader.load('textures/ground.jpg',
            (texture) => {
                // 设置纹理重复和包装
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(20, 20); // 重复次数
            },
            undefined,
            (err) => {
                console.error('地面纹理加载失败:', err);
                // 如果纹理加载失败，使用原有颜色
                groundMaterial.color = new THREE.Color(0x3d3d3d);
            }
        );

        const groundMaterial = new THREE.MeshLambertMaterial({
            map: groundTexture,
            side: THREE.DoubleSide
        });

        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -2;
        ground.receiveShadow = true;

        this.scene.add(ground);
    }

    // 设置天空盒
    setupSkybox() {
        // 加载天空纹理
        const textureLoader = new THREE.TextureLoader();

        textureLoader.load('textures/sky.jpeg',
            (texture) => {
                // 成功加载后设置背景
                this.scene.background = texture;
            },
            undefined,
            (err) => {
                console.error('天空纹理加载失败:', err);
                // 如果纹理加载失败，使用原有背景色
                this.scene.background = new THREE.Color(0x1a1a2e);
            }
        );
    }

    // 添加模型到场景
    addModel(model, name = 'CustomModel') {
        if (!model) return null;

        // 确保模型有名称和用户数据
        model.name = name;
        if (!model.userData) model.userData = {};
        model.userData.type = 'customModel';
        model.userData.originalName = name;

        // 设置随机位置
        const groundLevel = -2; // 与地面网格相同的高度
        model.position.set(
            (Math.random() - 0.5) * 10,
            groundLevel, // 放在地面上
            (Math.random() - 0.5) * 10
        );

        model.rotation.y = -Math.PI / 2;

        // 启用阴影
        model.traverse(child => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // 添加到场景和模型列表
        this.scene.add(model);
        this.models.push(model);

        // 应用当前光照算法
        if (this.currentLightingAlgorithm) {
            this.updateModelMaterial(model, this.currentLightingAlgorithm);
        } else {
            model.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    // 如果模型没有材质，则创建默认材质
                    if (!child.material) {
                        const hue = Math.random();
                        const color = new THREE.Color().setHSL(hue, 0.7, 0.6);
                        child.material = new THREE.MeshPhongMaterial({
                            color: color,
                            shininess: 30,
                            specular: 0x222222
                        });
                    }
                    // 如果已有材质，则保留原样
                }
            });
        }

        console.log(`添加模型: ${name}`);
        return model;
    }

    // 移除模型
    removeModel(model) {
        if (!model) return;

        // 从场景中移除
        this.scene.remove(model);

        // 从模型列表中移除
        const index = this.models.indexOf(model);
        if (index > -1) {
            this.models.splice(index, 1);
        }

        // 如果移除的是选中的模型，清除选中状态
        if (this.selectedModel === model) {
            this.selectedModel = null;
        }

        console.log(`移除模型: ${model.name}`);
    }

    // 清除所有自定义模型
    clearCustomModels() {
        // 只移除自定义模型，保留原始模型
        this.models.forEach(model => {
            if (model.userData.type === 'customModel') {
                this.scene.remove(model);
            }
        });

        // 更新模型列表
        this.models = this.models.filter(model => model.userData.type !== 'customModel');
        this.selectedModel = null;

        console.log('已清除所有自定义模型');
    }

    // 选择模型
    selectModel(model) {
        // 清除之前选中模型的高亮
        if (this.selectedModel && this.selectedModel.userData.originalMaterial) {
            if (Array.isArray(this.selectedModel.material)) {
                this.selectedModel.material.forEach((mat, index) => {
                    if (this.selectedModel.userData.originalMaterial[index]) {
                        mat.emissive = this.selectedModel.userData.originalMaterial[index].emissive;
                    }
                });
            } else {
                this.selectedModel.material.emissive = this.selectedModel.userData.originalMaterial.emissive;
            }
        }

        // 设置新选中模型
        this.selectedModel = model;

        // 高亮显示选中模型
        if (model) {
            // 保存原始材质
            if (!model.userData.originalMaterial) {
                if (Array.isArray(model.material)) {
                    model.userData.originalMaterial = model.material.map(mat => ({
                        emissive: mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000)
                    }));
                } else {
                    model.userData.originalMaterial = {
                        emissive: model.material.emissive ? model.material.emissive.clone() : new THREE.Color(0x000000)
                    };
                }
            }

            // 设置高亮
            if (Array.isArray(model.material)) {
                model.material.forEach(mat => {
                    mat.emissive = new THREE.Color(0x444400);
                });
            } else {
                model.material.emissive = new THREE.Color(0x444400);
            }

            console.log(`选中模型: ${model.name}`);
        } else {
            console.log('取消选择模型');
        }
    }

    // 添加光源
    addLight() {
        const light = new THREE.PointLight(
            new THREE.Color().setHSL(Math.random(), 0.8, 0.8),
            Math.random() * 0.5 + 0.5,
            10,
            2
        );

        light.position.set(
            (Math.random() - 0.5) * 15,
            Math.random() * 5 + 2,
            (Math.random() - 0.5) * 15
        );

        light.castShadow = true;
        light.shadow.mapSize.width = 512;
        light.shadow.mapSize.height = 512;

        this.scene.add(light);
        this.directionalLights.push(light);

        console.log(`添加点光源: 位置(${light.position.x.toFixed(2)}, ${light.position.y.toFixed(2)}, ${light.position.z.toFixed(2)})`);

        return light;
    }

    // 移除光源
    removeLight() {
        if (this.directionalLights.length > 2) { // 保留至少2个光源
            const light = this.directionalLights.pop();
            this.scene.remove(light);
            console.log('移除光源');
        } else {
            console.log('至少需要保留2个光源');
        }
    }

    // 更新环境光强度
    updateAmbientLight(intensity) {
        if (this.ambientLight) {
            this.ambientLight.intensity = intensity;
        }
    }

    // 更新主光源
    updateMainLight(intensity, color) {
        if (this.directionalLights.length > 0) {
            const mainLight = this.directionalLights[0];
            mainLight.intensity = intensity;
            mainLight.color = new THREE.Color(color);
        }
    }

    // 设置光照算法
    setLightingAlgorithm(algorithm) {
        this.currentLightingAlgorithm = algorithm;

        // 更新所有模型的材质
        this.models.forEach(model => {
            this.updateModelMaterial(model, algorithm);
        });

        console.log(`光照算法已切换为: ${algorithm}`);
    }

    // 更新模型材质以适应不同的光照算法
    updateModelMaterial(model, algorithm) {
        const self = this; // 保存this引用
        model.traverse(child => {
            if (child instanceof THREE.Mesh) {
                // 获取原始材质属性
                let originalColor = new THREE.Color(0xffffff);
                let originalEmissive = new THREE.Color(0x000000);
                let originalShininess = 30;

                // 安全地获取原始材质属性
                if (child.material) {
                    if (child.material.color) originalColor = child.material.color.clone();
                    if (child.material.emissive) originalEmissive = child.material.emissive.clone();
                    if (child.material.shininess !== undefined) originalShininess = child.material.shininess;
                }

                try {
                    switch (algorithm) {
                        case 'phong':
                            child.material = new THREE.MeshPhongMaterial({
                                color: originalColor,
                                emissive: originalEmissive,
                                shininess: originalShininess,
                                specular: new THREE.Color(0x111111)
                            });
                            break;

                        case 'lambert':
                            child.material = new THREE.MeshLambertMaterial({
                                color: originalColor,
                                emissive: originalEmissive
                            });
                            break;

                        case 'toon':
                            child.material = new THREE.MeshToonMaterial({
                                color: originalColor,
                                emissive: originalEmissive,
                                gradientMap: self.createToonGradient()
                            });
                            break;

                        case 'standard':
                            child.material = new THREE.MeshStandardMaterial({
                                color: originalColor,
                                emissive: originalEmissive,
                                roughness: 0.5,
                                metalness: 0.2
                            });
                            break;

                        default:
                            // 默认使用Phong材质
                            child.material = new THREE.MeshPhongMaterial({
                                color: originalColor,
                                emissive: originalEmissive,
                                shininess: originalShininess,
                                specular: new THREE.Color(0x111111)
                            });
                    }

                    // 保持阴影设置
                    child.castShadow = true;
                    child.receiveShadow = true;
                } catch (error) {
                    console.error('材质更新失败:', error);
                    // 出错时使用默认Phong材质
                    child.material = new THREE.MeshPhongMaterial({
                        color: originalColor
                    });
                }
            }
        });
    }

    // 创建卡通光照的渐变贴图
    createToonGradient() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext('2d');
        const gradient = context.createLinearGradient(0, 0, 32, 32);

        gradient.addColorStop(0, '#000000');  // 暗部
        gradient.addColorStop(0.2, '#222222');
        gradient.addColorStop(0.4, '#444444');
        gradient.addColorStop(0.6, '#888888');
        gradient.addColorStop(0.8, '#cccccc');
        gradient.addColorStop(1, '#ffffff');  // 亮部

        context.fillStyle = gradient;
        context.fillRect(0, 0, 32, 32);

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    // 获取光源数量
    getLightCount() {
        return this.directionalLights.length;
    }

    // 获取模型数量
    getModelCount() {
        return this.models.length;
    }

    // 获取选中模型
    getSelectedModel() {
        return this.selectedModel;
    }

    // 窗口大小变化处理
    onWindowResize() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }

    // 更新场景
    update(deltaTime) {
        // 更新控制器
        if (this.controls) {
            this.controls.update();
        }

        // 自动旋转
        if (this.autoRotate && this.controls) {
            this.controls.autoRotate = true;
            this.controls.autoRotateSpeed = this.rotationSpeed * 10;
        } else {
            this.controls.autoRotate = false;
        }
    }

    // 渲染场景
    render() {
        this.renderer.render(this.scene, this.camera);
    }

    // 设置自动旋转
    setAutoRotate(enabled) {
        this.autoRotate = enabled;
        return this.autoRotate;
    }

    // 设置旋转速度
    setRotationSpeed(speed) {
        this.rotationSpeed = speed;
    }

    // 添加第一人称模式方法（简化版本，避免复杂错误）
    enableFirstPersonMode() {
        console.log('启用第一人称模式');
        this.firstPersonMode = true;
        this.autoRotate = false;

        // 禁用轨道控制器
        this.controls.enabled = false;

        // 设置第一人称相机位置，保持当前朝向
        this.camera.position.set(0, 1.6, 0);
        // 移除这行: this.camera.lookAt(0, 1.6, -1);
        // 保持相机当前的旋转方向，不强制设置朝向

        // 创建简单的手电筒效果
        if (!this.flashlight) {
            this.flashlight = new THREE.SpotLight(0xffffff, 1);
            this.flashlight.position.set(0, 0, 0);
            this.flashlight.angle = Math.PI / 6;
            this.flashlight.penumbra = 0.2;
            this.flashlight.decay = 2;
            this.flashlight.distance = 20;
            this.camera.add(this.flashlight);
            this.scene.add(this.flashlight);
        }

        // 初始化第一人称控制状态
        this.firstPersonControls = {
            moveForward: false,
            moveBackward: false,
            moveLeft: false,
            moveRight: false
        };

        this.setupFirstPersonControls();
    }

    // 禁用第一人称模式
    disableFirstPersonMode() {
        console.log('禁用第一人称模式');
        this.firstPersonMode = false;

        // 移除手电筒
        if (this.flashlight) {
            this.camera.remove(this.flashlight);
            this.flashlight = null;
        }

        // 重新启用轨道控制器
        this.controls.enabled = true;

        // 重置相机到默认位置
        this.camera.position.set(0, 5, 15);
        this.controls.reset();

        this.cleanupFirstPersonControls();
    }

    // 设置第一人称控制（简化版本）
    setupFirstPersonControls() {
        // 使用箭头函数确保this绑定正确
        this.keyDownHandler = (event) => this.onFirstPersonKeyDown(event);
        this.keyUpHandler = (event) => this.onFirstPersonKeyUp(event);
        this.mouseMoveHandler = (event) => this.onFirstPersonMouseMove(event);
        this.mouseDownHandler = (event) => this.onFirstPersonMouseDown(event);

        document.addEventListener('keydown', this.keyDownHandler, false);
        document.addEventListener('keyup', this.keyUpHandler, false);

        // 添加鼠标按下事件监听器后再添加鼠标移动监听器
        this.renderer.domElement.addEventListener('mousedown', this.mouseDownHandler, false);
        // 注意：mousemove事件将在指针锁定成功后添加
        document.addEventListener('pointerlockchange', this.onPointerLockChange.bind(this), false);

        // 请求指针锁定
        if (this.renderer.domElement.requestPointerLock) {
            this.renderer.domElement.requestPointerLock();
        }
    }

    // 指针锁定状态改变处理
    onPointerLockChange() {
        if (document.pointerLockElement === this.renderer.domElement) {
            // 指针锁定成功，添加鼠标移动监听器
            document.addEventListener('mousemove', this.mouseMoveHandler, false);
        } else {
            // 指针锁定解除，移除鼠标移动监听器
            document.removeEventListener('mousemove', this.mouseMoveHandler, false);
        }
    }

    // 第一人称键盘按下事件
    onFirstPersonKeyDown(event) {
        if (!this.firstPersonMode) return;

        switch (event.code) {
            case 'KeyW':
                this.firstPersonControls.moveForward = true;
                break;
            case 'KeyS':
                this.firstPersonControls.moveBackward = true;
                break;
            case 'KeyA':
                this.firstPersonControls.moveLeft = true;
                break;
            case 'KeyD':
                this.firstPersonControls.moveRight = true;
                break;
            case 'KeyE':
                console.log('E键按下 - 显示菜单');
                break;
            case 'Escape':
                this.disableFirstPersonMode();
                // 更新UI按钮状态
                const button = document.getElementById('first-person-toggle');
                if (button) {
                    button.textContent = '第一人称模式';
                    button.style.background = '#2196f3';
                }
                break;
        }
    }

    // 第一人称键盘释放事件
    onFirstPersonKeyUp(event) {
        if (!this.firstPersonMode) return;

        switch (event.code) {
            case 'KeyW':
                this.firstPersonControls.moveForward = false;
                break;
            case 'KeyS':
                this.firstPersonControls.moveBackward = false;
                break;
            case 'KeyA':
                this.firstPersonControls.moveLeft = false;
                break;
            case 'KeyD':
                this.firstPersonControls.moveRight = false;
                break;
        }
    }

    // 第一人称移动更新
    updateFirstPersonMovement(deltaTime) {
        if (!this.firstPersonMode || !this.firstPersonControls) return;

        const moveSpeed = this.moveSpeed * (deltaTime * 60);

        // 获取相机的前向和右向向量
        const camera = this.camera;
        const forward = new THREE.Vector3();
        const right = new THREE.Vector3();

        // 获取相机的前向方向
        camera.getWorldDirection(forward);

        // 严格保持在水平面上移动（平行于地面）
        forward.y = 0;
        forward.normalize();

        // 计算右向方向（基于世界坐标的上向量和前向向量）
        right.crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();

        // 根据按键状态进行平移
        const movement = new THREE.Vector3();

        if (this.firstPersonControls.moveForward) {
            movement.add(forward);
        }
        if (this.firstPersonControls.moveBackward) {
            movement.sub(forward);
        }
        if (this.firstPersonControls.moveLeft) {
            movement.sub(right);
        }
        if (this.firstPersonControls.moveRight) {
            movement.add(right);
        }

        // 应用移动
        if (movement.length() > 0) {
            movement.normalize().multiplyScalar(moveSpeed);
            camera.position.add(movement);
        }

        // 严格保持相机高度不变（始终与地面平行）
        camera.position.y = 1.6;
    }

    // 在update方法中添加第一人称更新
    update(deltaTime) {
        // 更新控制器
        if (this.controls) {
            this.controls.update();
        }

        // 自动旋转
        if (this.autoRotate && this.controls) {
            this.controls.autoRotate = true;
            this.controls.autoRotateSpeed = this.rotationSpeed * 10;
        } else {
            this.controls.autoRotate = false;
        }

        // 第一人称移动更新
        if (this.firstPersonMode) {
            this.updateFirstPersonMovement(deltaTime);
        }
    }

    // 清理第一人称控制
    cleanupFirstPersonControls() {
        document.removeEventListener('keydown', this.keyDownHandler);
        document.removeEventListener('keyup', this.keyUpHandler);
        document.removeEventListener('mousemove', this.mouseMoveHandler);
        document.removeEventListener('pointerlockchange', this.onPointerLockChange);

        if (this.renderer.domElement && this.mouseDownHandler) {
            this.renderer.domElement.removeEventListener('mousedown', this.mouseDownHandler);
        }

        // 退出指针锁定
        if (document.exitPointerLock) {
            document.exitPointerLock();
        }
    }

    // 添加鼠标移动处理方法
    onFirstPersonMouseMove(event) {
        if (!this.firstPersonMode) return;

        // 获取鼠标移动量
        const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

        // 水平旋转（绕Y轴）
        this.camera.rotation.y -= movementX * this.lookSpeed;

        // 垂直旋转（绕X轴），限制在一定角度内
        this.camera.rotation.x -= movementY * this.lookSpeed;
        this.camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.camera.rotation.x));
    }

    // 鼠标按下处理
    onFirstPersonMouseDown(event) {
        if (!this.firstPersonMode) return;

        // 请求指针锁定
        if (this.renderer.domElement.requestPointerLock) {
            this.renderer.domElement.requestPointerLock();
        }
    }

    // 鼠标释放处理
    onFirstPersonMouseUp(event) {
        // 可以在这里处理鼠标释放事件
    }
}
