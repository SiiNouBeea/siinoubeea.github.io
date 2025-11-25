// UI管理器
class UIManager {
    constructor(sceneManager, modelLoader, interactionManager) {
        this.sceneManager = sceneManager;
        this.modelLoader = modelLoader;
        this.interactionManager = interactionManager;

        this.init();
    }

    // 初始化UI
    init() {
        this.setupEventListeners();
        this.updateAllInfo();
        console.log('UI管理器初始化完成');
    }

    // 设置事件监听器
    setupEventListeners() {
        // 安全检查函数
        const getElement = (id) => {
            const element = document.getElementById(id);
            if (!element) {
                console.warn(`元素未找到: ${id}`);
            }
            return element;
        };

        // 光源控制
        const lightIntensity = getElement('light-intensity');
        const lightColor = getElement('light-color');
        const ambientLight = getElement('ambient-light');
        const addLight = getElement('add-light');
        const removeLight = getElement('remove-light');

        if (lightIntensity) {
            lightIntensity.addEventListener('input', (e) => {
                const colorElem = getElement('light-color');
                this.sceneManager.updateMainLight(
                    parseFloat(e.target.value),
                    colorElem ? colorElem.value : '#FFFFFF'
                );
            });
        }

        if (lightColor) {
            lightColor.addEventListener('input', (e) => {
                const intensityElem = getElement('light-intensity');
                this.sceneManager.updateMainLight(
                    intensityElem ? parseFloat(intensityElem.value) : 1.0,
                    e.target.value
                );
            });
        }

        if (ambientLight) {
            ambientLight.addEventListener('input', (e) => {
                this.sceneManager.updateAmbientLight(parseFloat(e.target.value));
            });
        }

        if (addLight) {
            addLight.addEventListener('click', () => {
                this.sceneManager.addLight();
                this.updateLightInfo();
            });
        }

        if (removeLight) {
            removeLight.addEventListener('click', () => {
                this.sceneManager.removeLight();
                this.updateLightInfo();
            });
        }

        // 相机控制
        const resetCamera = getElement('reset-camera');
        const toggleRotation = getElement('toggle-rotation');
        const firstPersonToggle = getElement('first-person-toggle');
        const rotationSpeed = getElement('rotation-speed');
        const cameraDistance = getElement('camera-distance');

        if (resetCamera) {
            resetCamera.addEventListener('click', () => {
                this.sceneManager.controls.reset();
            });
        }

        if (toggleRotation) {
            toggleRotation.addEventListener('click', () => {
                const isRotating = this.sceneManager.setAutoRotate(!this.sceneManager.autoRotate);
                toggleRotation.textContent = isRotating ? '停止旋转' : '自动旋转';
            });
        }

        // 第一人称模式按钮
        if (firstPersonToggle) {
            firstPersonToggle.addEventListener('click', () => {
                this.toggleFirstPersonMode();
            });
        }

        if (rotationSpeed) {
            rotationSpeed.addEventListener('input', (e) => {
                this.sceneManager.setRotationSpeed(parseFloat(e.target.value));
            });
        }

        if (cameraDistance) {
            cameraDistance.addEventListener('input', (e) => {
                const distance = parseFloat(e.target.value);
                const direction = new THREE.Vector3();
                this.sceneManager.camera.getWorldDirection(direction);
                this.sceneManager.camera.position.copy(this.sceneManager.controls.target)
                    .sub(direction.multiplyScalar(distance));
            });
        }

        // 模型控制
        const loadModel = getElement('load-model');
        const clearModels = getElement('clear-models');
        const modelScale = getElement('model-scale');
        const fileInput = getElement('file-input');

        if (loadModel) {
            loadModel.addEventListener('click', () => {
                if (fileInput) {
                    fileInput.click();
                }
            });
        }

        if (clearModels) {
            clearModels.addEventListener('click', () => {
                this.sceneManager.clearCustomModels();
                this.updateModelInfo();
            });
        }

        if (modelScale) {
            modelScale.addEventListener('input', (e) => {
                const scale = parseFloat(e.target.value);
                const selectedModel = this.sceneManager.getSelectedModel();
                if (selectedModel) {
                    selectedModel.scale.setScalar(scale);
                }
            });
        }

        // 文件输入处理
        if (fileInput) {
            fileInput.addEventListener('change', (event) => {
                const files = Array.from(event.target.files).filter(file =>
                    file.name.toLowerCase().endsWith('.obj')
                );

                if (files.length > 0) {
                    this.loadModelFiles(files);
                }

                // 清空文件输入
                event.target.value = '';
            });
        }

        // 光照算法选择
        const lightingAlgorithm = getElement('lighting-algorithm');
        if (lightingAlgorithm) {
            lightingAlgorithm.addEventListener('change', (e) => {
                const algorithm = e.target.value;
                this.sceneManager.setLightingAlgorithm(algorithm);
            });
        }
    }

    // 切换第一人称模式
    toggleFirstPersonMode() {
        if (this.sceneManager.firstPersonMode) {
            this.sceneManager.disableFirstPersonMode();
            const button = document.getElementById('first-person-toggle');
            if (button) {
                button.textContent = '第一人称模式';
                button.style.background = '#2196f3';
            }
        } else {
            this.sceneManager.enableFirstPersonMode();
            const button = document.getElementById('first-person-toggle');
            if (button) {
                button.textContent = '退出第一人称 (ESC)';
                button.style.background = '#f44336';
            }
        }
    }

    // 加载模型文件
    async loadModelFiles(files) {
        try {
            this.updateModelStatus(`正在加载 ${files.length} 个模型...`);

            const results = await this.interactionManager.loadModelFiles(files);

            if (results.success.length > 0) {
                this.updateModelStatus(`成功加载 ${results.success.length} 个模型`);
            }

            if (results.failed.length > 0) {
                this.updateModelStatus(`加载完成 (${results.failed.length} 个失败)`);
            }

            this.updateModelInfo();

        } catch (error) {
            console.error('加载模型文件时出错:', error);
            this.updateModelStatus('加载失败: ' + error.message);
        }
    }

    // 更新模型信息
    updateModelInfo() {
        const modelInfo = document.getElementById('model-info');
        if (modelInfo) {
            const modelCount = this.sceneManager.getModelCount();
            const selectedModel = this.sceneManager.getSelectedModel();

            modelInfo.innerHTML = `
                <p>已加载模型: ${modelCount}</p>
                <p>当前选中: ${selectedModel ? selectedModel.name : '无'}</p>
            `;
        }
    }

    // 更新光源信息
    updateLightInfo() {
        const lightInfo = document.getElementById('light-info');
        if (lightInfo) {
            lightInfo.textContent = `光源数量: ${this.sceneManager.getLightCount()}`;
        }
    }

    // 更新相机信息
    updateCameraInfo() {
        const cameraInfo = document.getElementById('camera-info');
        if (cameraInfo) {
            const pos = this.sceneManager.camera.position;
            cameraInfo.textContent = `相机位置: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`;
        }
    }

    // 更新FPS显示
    updateFPS(fps) {
        const fpsCounter = document.getElementById('fps-counter');
        if (fpsCounter) {
            fpsCounter.textContent = `FPS: ${fps}`;
        }
    }

    // 更新模型状态
    updateModelStatus(status) {
        const modelStatus = document.getElementById('model-status');
        if (modelStatus) {
            modelStatus.textContent = `模型状态: ${status}`;
        }
    }

    // 更新所有信息
    updateAllInfo() {
        this.updateModelInfo();
        this.updateLightInfo();
        this.updateCameraInfo();
    }
}
