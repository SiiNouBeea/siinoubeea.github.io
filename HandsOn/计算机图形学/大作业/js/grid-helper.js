// 网格辅助器 - 显示网格和坐标轴
class GridHelper {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.gridHelper = null;
        this.axesHelper = null;
        this.isVisible = false;
        
        this.init();
    }

    init() {
        // 创建网格辅助器
        this.gridHelper = new THREE.GridHelper(100, 100, 0x444444, 0x888888);
        this.gridHelper.position.y = -2; // 设置在地面上
        
        // 创建坐标轴辅助器
        this.axesHelper = new THREE.AxesHelper(5);
        
        console.log('网格辅助器初始化完成');
    }

    // 切换网格显示
    toggleGrid() {
        if (this.isVisible) {
            this.hideGrid();
        } else {
            this.showGrid();
        }
    }

    // 显示网格
    showGrid() {
        if (!this.isVisible) {
            this.sceneManager.addToScene(this.gridHelper);
            this.sceneManager.addToScene(this.axesHelper);
            this.isVisible = true;
            console.log('网格已显示');
        }
    }

    // 隐藏网格
    hideGrid() {
        if (this.isVisible) {
            this.sceneManager.removeFromScene(this.gridHelper);
            this.sceneManager.removeFromScene(this.axesHelper);
            this.isVisible = false;
            console.log('网格已隐藏');
        }
    }

    // 检查网格是否可见
    isGridVisible() {
        return this.isVisible;
    }
}

// 导出网格辅助器
window.GridHelper = GridHelper;