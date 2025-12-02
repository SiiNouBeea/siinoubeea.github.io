// WebGL三维场景编辑器 - 主程序
class WebGLEditor {
    constructor() {
        this.sceneManager = null;
        this.modelManager = null;
        this.lightManager = null;
        this.cameraManager = null;
        this.uiManager = null;
        this.interactionManager = null;
        this.fileManager = null;
        
        this.clock = new THREE.Clock();
        this.frameCount = 0;
        this.lastTime = 0;
        this.fps = 0;
        
        this.isInitialized = false;
        this.selectedModel = null;
        this.scenePath = [];
        
        this.init();
    }

    async init() {
        try {
            this.showLoadingOverlay('正在初始化WebGL引擎...');
            
            // 初始化核心管理器
            this.sceneManager = new SceneManager('webgl-canvas');
            await this.sceneManager.init();
            
            this.lightManager = new LightManager(this.sceneManager);
            this.cameraManager = new CameraManager(this.sceneManager);
            this.modelManager = new ModelManager(this.sceneManager);
            this.interactionManager = new InteractionManager(this.sceneManager, this);
            this.fileManager = new FileManager(this);
            this.uiManager = new UIManager(this);
            
            // 初始化场景生成器
            this.sceneGenerator = new SceneGenerator(this);
            
            // 初始化环境管理器
            this.environmentManager = new EnvironmentManager(this.sceneManager);
            
            // 设置默认场景
            await this.setupDefaultScene();
            
            this.isInitialized = true;
            this.hideLoadingOverlay();
            
            // 启动渲染循环
            this.animate();
            
            console.log('WebGL三维场景编辑器初始化完成');
            
        } catch (error) {
            console.error('初始化失败:', error);
            this.showError('初始化失败: ' + error.message);
        }
    }

    async setupDefaultScene() {
        // 设置环境
        await this.environmentManager.createDefaultEnvironment();
        
        // 添加默认光源
        this.lightManager.addAmbientLight(0.3, 0xffffff);
        this.lightManager.addDirectionalLight(1.0, 0xffffff, { x: 10, y: 10, z: 5 });
        
        // 添加默认几何体
        await this.modelManager.addPrimitive('cube', {
            position: { x: -3, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            color: 0xff6b6b
        });
        
        await this.modelManager.addPrimitive('sphere', {
            position: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            color: 0x4ecdc4
        });
        
        await this.modelManager.addPrimitive('cylinder', {
            position: { x: 3, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            color: 0x45b7d1
        });
        
        this.updateSceneInfo();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        const delta = this.clock.getDelta();
        this.frameCount++;
        
        // 计算FPS
        const currentTime = performance.now();
        if (currentTime - this.lastTime >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
            this.frameCount = 0;
            this.lastTime = currentTime;
            this.updateStatusBar();
        }
        
        // 更新控制器
        if (this.cameraManager) {
            this.cameraManager.update(delta);
        }
        
        if (this.interactionManager) {
            this.interactionManager.update(delta);
        }
        
        // 渲染场景
        if (this.sceneManager) {
            this.sceneManager.render();
        }
    }

    updateStatusBar() {
        const fpsElement = document.getElementById('fps-counter');
        const modelCountElement = document.getElementById('model-count');
        const lightCountElement = document.getElementById('light-count');
        const cameraModeElement = document.getElementById('camera-mode');
        const areaLightCount = this.lightManager.getAreaLightCount();
        const areaLightEl = document.getElementById('area-light-count');
        if (fpsElement) fpsElement.textContent = `FPS: ${this.fps}`;
        if (modelCountElement) modelCountElement.textContent = `模型: ${this.modelManager.getModelCount()}`;
        if (lightCountElement) lightCountElement.textContent = `光源: ${this.lightManager.getTotalLightCount()}`;
        if (cameraModeElement) cameraModeElement.textContent = `模式: ${this.cameraManager.getCurrentMode()}`;

        if(areaLightEl) areaLightEl.textContent = `面光源: ${areaLightCount}`;
    }

    updateSceneInfo() {
        const loadedModelsElement = document.getElementById('loaded-models');
        const selectedModelElement = document.getElementById('selected-model');
        const pointLightsElement = document.getElementById('point-lights');
        const directionalLightsElement = document.getElementById('directional-lights');
        const cameraPositionElement = document.getElementById('camera-position');
        
        if (loadedModelsElement) loadedModelsElement.textContent = this.modelManager.getModelCount();
        if (selectedModelElement) selectedModelElement.textContent = this.selectedModel ? this.selectedModel.userData.name : '无';
        if (pointLightsElement) pointLightsElement.textContent = this.lightManager.getPointLightCount();
        if (directionalLightsElement) directionalLightsElement.textContent = this.lightManager.getDirectionalLightCount();
        if (cameraPositionElement && this.sceneManager) {
            const pos = this.sceneManager.camera.position;
            cameraPositionElement.textContent = `(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`;
        }
    }

    showLoadingOverlay(message = '加载中...') {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.querySelector('p').textContent = message;
        }
    }

    hideLoadingOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    showError(message) {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.querySelector('p').textContent = message;
            overlay.querySelector('p').style.color = '#ff6b6b';
        }
    }

    // 场景管理方法
    async newScene() {
        this.showLoadingOverlay('正在创建新场景...');
        await this.modelManager.clearAllModels();
        await this.lightManager.clearAllLights();
        this.setupDefaultScene();
        this.hideLoadingOverlay();
    }

    async clearScene() {
        const confirmed = confirm('确定要清空整个场景吗？此操作不可撤销。');
        if (confirmed) {
            this.showLoadingOverlay('正在清空场景...');
            await this.modelManager.clearAllModels();
            await this.lightManager.resetToDefault();
            this.selectedModel = null;
            this.updateSceneInfo();
            this.hideLoadingOverlay();
        }
    }

    selectModel(model) {
        // 取消之前选中的模型
        if (this.selectedModel && this.selectedModel !== model) {
            this.selectedModel.userData.isSelected = false;
            this.updateModelAppearance(this.selectedModel);
        }
        
        this.selectedModel = model;
        if (model) {
            model.userData.isSelected = true;
            this.updateModelAppearance(model);
            console.log(`选中模型: ${model.userData.name}`);
            this.showSelectedModelInfo(model);
        } else {
            this.hideSelectedModelInfo();
        }
        
        this.updateSceneInfo();
        this.uiManager.updateModelControls();
    }

    // 显示选中模型信息
    showSelectedModelInfo(model) {
        const infoPanel = document.getElementById('model-info-panel');
        const nameElement = document.getElementById('selected-model-name');
        const xElement = document.getElementById('selected-model-x');
        const yElement = document.getElementById('selected-model-y');
        const zElement = document.getElementById('selected-model-z');

        if (infoPanel && nameElement && xElement && yElement && zElement) {
            nameElement.textContent = model.userData.name || '未命名';
            xElement.textContent = model.position.x.toFixed(2);
            yElement.textContent = model.position.y.toFixed(2);
            zElement.textContent = model.position.z.toFixed(2);

            infoPanel.style.display = 'block';
        }
    }

    // 隐藏选中模型信息
    hideSelectedModelInfo() {
        const infoPanel = document.getElementById('model-info-panel');
        if (infoPanel) {
            infoPanel.style.display = 'none';
        }
    }

    // 更新模型外观（选中状态）
    updateModelAppearance(model) {
        if (!model) return;

        model.traverse((child) => {
            if (child.isMesh && child.material) {
                if (model.userData.isSelected) {
                    // 选中的模型添加高亮效果
                    if (!child.userData.originalMaterial) {
                        child.userData.originalMaterial = child.material.clone();
                    }
                    
                    const highlightMaterial = child.material.clone();
                    highlightMaterial.emissive = new THREE.Color(0x4ecdc4);
                    highlightMaterial.emissiveIntensity = 0.2;
                    child.material = highlightMaterial;
                } else {
                    // 恢复原始材质
                    if (child.userData.originalMaterial) {
                        child.material = child.userData.originalMaterial.clone();
                        delete child.userData.originalMaterial;
                    }
                }
            }
        });
    }

    // 获取当前选中的模型
    getSelectedModel() {
        return this.selectedModel;
    }

    // 导出场景为图像
    exportImage() {
        if (this.sceneManager) {
            this.sceneManager.exportToImage();
        }
    }
}

// 场景管理器
class SceneManager {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
    }

    async init() {
        // 创建场景
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        this.scene.fog = new THREE.Fog(0x1a1a2e, 10, 100);

        // 创建相机
        this.camera = new THREE.PerspectiveCamera(
            75,
            this.canvas.clientWidth / this.canvas.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 5, 15);

        // 创建渲染器
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            preserveDrawingBuffer: true
        });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.physicallyCorrectLights = true;

        // 创建控制器
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;
        this.controls.minDistance = 1;
        this.controls.maxDistance = 100;

        // 添加地面
        this.createGround();

        // 设置窗口大小调整
        window.addEventListener('resize', () => this.onWindowResize());
    }

    createGround() {
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x2d3561,
            transparent: true,
            opacity: 0.8
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -2;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    onWindowResize() {
        this.camera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    addToScene(object) {
        this.scene.add(object);
    }

    removeFromScene(object) {
        this.scene.remove(object);
    }

    // 在 main.js 的 SceneManager 类中修改 exportToImage 方法
    exportToImage() {
        // 保存当前灯光辅助线状态
        const lightHelpersVisible = this.getLightHelpersVisibility();

        // 隐藏灯光辅助线
        if (window.webglEditor && window.webglEditor.lightManager) {
            window.webglEditor.lightManager.toggleLightHelpers(false);
        }

        // 渲染一帧确保场景更新
        this.renderer.render(this.scene, this.camera);

        // 导出图像
        const dataURL = this.renderer.domElement.toDataURL('image/png');

        // 恢复灯光辅助线状态
        if (window.webglEditor && window.webglEditor.lightManager) {
            window.webglEditor.lightManager.toggleLightHelpers(lightHelpersVisible);
        }

        // 下载图像
        const link = document.createElement('a');
        link.download = `scene-${Date.now()}.png`;
        link.href = dataURL;
        link.click();
    }

    // 添加获取灯光辅助线可见性的方法
    getLightHelpersVisibility() {
        // 默认认为辅助线是可见的，除非有明确隐藏
        if (window.webglEditor && window.webglEditor.lightManager) {
            const lightManager = window.webglEditor.lightManager;
            // 检查任意一个辅助线是否可见来判断整体状态
            if (lightManager.directionalLights.length > 0 &&
                lightManager.directionalLights[0].userData.helper) {
                return lightManager.directionalLights[0].userData.helper.visible;
            }
            if (lightManager.pointLights.length > 0 &&
                lightManager.pointLights[0].userData.helper) {
                return lightManager.pointLights[0].userData.helper.visible;
            }
        }
        return true; // 默认可见
    }

}

// 当页面加载完成后初始化应用
window.addEventListener('DOMContentLoaded', () => {
    window.webglEditor = new WebGLEditor();
});