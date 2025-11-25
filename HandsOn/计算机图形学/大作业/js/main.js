// 主程序入口
class FamilyScene {
    constructor() {
        this.sceneManager = null;
        this.modelLoader = null;
        this.interactionManager = null;
        this.uiManager = null;
        this.appInstance = this;

        this.clock = new THREE.Clock();
        this.frameCount = 0;
        this.lastTime = 0;
        this.fps = 0;

        this.init();
    }

    // 初始化应用
    async init() {
        try {
            // 显示加载界面
            this.showLoadingOverlay('初始化场景...');

            // 初始化场景管理器
            this.sceneManager = new SceneManager('webgl-canvas');
            await this.sceneManager.init();

            // 初始化模型加载器
            this.modelLoader = new ModelLoader(this.sceneManager);

            // 初始化交互管理器
            this.interactionManager = new InteractionManager(
                this.sceneManager,
                this.modelLoader
            );

            // 初始化UI管理器
            this.uiManager = new UIManager(
                this.sceneManager,
                this.modelLoader,
                this.interactionManager
            );

            // 加载初始模型
            await this.loadInitialModel();

            // 隐藏加载界面
            this.hideLoadingOverlay();

            // 开始渲染循环
            this.render();

        } catch (error) {
            console.error('初始化失败:', error);
            this.showError('初始化失败: ' + error.message);
        }

        window.app = {
            sceneManager: this.sceneManager,
            modelLoader: this.modelLoader,
            interactionManager: this.interactionManager,
            uiManager: this.uiManager,
            appInstance: this
        };

        console.log('FamilyScene应用初始化完成');
    }

    // 显示加载界面
    showLoadingOverlay(message = '加载中...') {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.querySelector('p').textContent = message;
        }
    }

    // 隐藏加载界面
    hideLoadingOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    // 显示错误信息
    showError(message) {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.querySelector('p').textContent = message;
            overlay.querySelector('p').style.color = '#ff6b6b';
        }
    }

    // 加载初始模型
    async loadInitialModel() {

    }

    // 渲染循环
    render() {
        requestAnimationFrame(() => this.render());

        // 计算FPS
        this.frameCount++;
        const currentTime = performance.now();
        if (currentTime - this.lastTime >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
            this.frameCount = 0;
            this.lastTime = currentTime;

            // 更新FPS显示
            this.uiManager.updateFPS(this.fps);
        }

        // 更新场景
        const deltaTime = this.clock.getDelta();
        this.sceneManager.update(deltaTime);

        // 更新交互
        this.interactionManager.update();

        // 更新UI
        this.uiManager.updateCameraInfo();
        this.uiManager.updateLightInfo();

        // 渲染场景
        this.sceneManager.render();
    }
}

// 页面加载完成后启动应用
window.addEventListener('DOMContentLoaded', () => {
    new FamilyScene();
});