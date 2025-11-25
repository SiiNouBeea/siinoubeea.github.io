// 交互管理器
class InteractionManager {
    constructor(sceneManager, modelLoader) {
        this.sceneManager = sceneManager;
        this.modelLoader = modelLoader;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.isDraggingModel = false;
        this.dragPlane = new THREE.Plane();
        this.dragOffset = new THREE.Vector3();
        this.intersectionPoint = new THREE.Vector3();

        this.init();
    }

    // 初始化交互
    init() {
        this.setupEventListeners();
        console.log('交互管理器初始化完成');
    }

    // 设置事件监听器
    setupEventListeners() {
        const canvas = this.sceneManager.renderer.domElement;

        // 鼠标移动事件
        canvas.addEventListener('mousemove', (event) => this.onMouseMove(event));

        // 鼠标按下事件
        canvas.addEventListener('mousedown', (event) => this.onMouseDown(event));

        // 鼠标释放事件
        canvas.addEventListener('mouseup', (event) => this.onMouseUp(event));

        // 右键菜单阻止
        canvas.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            return false;
        });

        // 键盘事件
        document.addEventListener('keydown', (event) => this.onKeyDown(event));

        // 文件拖放事件
        canvas.addEventListener('dragover', (event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        });

        canvas.addEventListener('drop', (event) => this.onFileDrop(event));
    }

    // 鼠标移动处理
    onMouseMove(event) {
        this.updateMousePosition(event);

        // 模型拖动
        if (this.isDraggingModel) {
            this.dragModel();
        }
    }

    // 鼠标按下处理
    onMouseDown(event) {
        this.updateMousePosition(event);

        // 右键选择模型
        if (event.button === 2) { // 右键
            this.selectModelAtMouse();
        }
    }

    // 鼠标释放处理
    onMouseUp(event) {
        if (event.button === 2 && this.isDraggingModel) {
            this.isDraggingModel = false;
        }
    }

    // 键盘按下处理
    onKeyDown(event) {
        // 删除键删除选中模型
        if (event.key === 'Delete' || event.key === 'Backspace') {
            const selectedModel = this.sceneManager.getSelectedModel();
            if (selectedModel && selectedModel.userData.type === 'customModel') {
                this.sceneManager.removeModel(selectedModel);
            }
        }

        // ESC键取消选择
        if (event.key === 'Escape') {
            this.sceneManager.selectModel(null);
        }
    }

    // 文件拖放处理
    onFileDrop(event) {
        event.preventDefault();

        const files = Array.from(event.dataTransfer.files).filter(file =>
            file.name.toLowerCase().endsWith('.obj')
        );

        if (files.length > 0) {
            this.loadModelFiles(files);
        }
    }

    // 更新鼠标位置
    updateMousePosition(event) {
        const canvas = this.sceneManager.renderer.domElement;
        const rect = canvas.getBoundingClientRect();

        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    // 选择鼠标位置的模型
    selectModelAtMouse() {
        this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);

        // 过滤出自定义模型
        const customModels = this.sceneManager.models.filter(model =>
            model.userData.type === 'customModel' ||
            model.userData.type === 'letter'
        );

        const intersects = this.raycaster.intersectObjects(customModels, true);

        if (intersects.length > 0) {
            // 找到最顶层的父对象（整个模型）
            let model = intersects[0].object;
            while (model.parent && model.parent !== this.sceneManager.scene) {
                model = model.parent;
            }

            this.sceneManager.selectModel(model);

            // 开始拖动
            this.startDragModel(model, intersects[0].point);
        } else {
            // 点击空白处取消选择
            this.sceneManager.selectModel(null);
        }
    }

    // 开始拖动模型
    startDragModel(model, intersectionPoint) {
        this.isDraggingModel = true;

        // 创建拖动平面（垂直于相机视线）
        const cameraDirection = new THREE.Vector3();
        this.sceneManager.camera.getWorldDirection(cameraDirection);
        this.dragPlane.setFromNormalAndCoplanarPoint(cameraDirection, intersectionPoint);

        // 计算拖动偏移
        this.dragOffset.copy(intersectionPoint).sub(model.position);
    }

    // 拖动模型
    dragModel() {
        const model = this.sceneManager.getSelectedModel();
        if (!model || !this.isDraggingModel) return;

        // 计算鼠标在3D空间中的位置
        this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
        this.raycaster.ray.intersectPlane(this.dragPlane, this.intersectionPoint);

        if (this.intersectionPoint) {
            // 应用位置（减去偏移量）
            model.position.copy(this.intersectionPoint).sub(this.dragOffset);

            // 限制模型在合理范围内
            const bounds = 15;
            model.position.x = THREE.MathUtils.clamp(model.position.x, -bounds, bounds);
            model.position.y = THREE.MathUtils.clamp(model.position.y, -2, bounds);
            model.position.z = THREE.MathUtils.clamp(model.position.z, -bounds, bounds);
        }
    }

    // 加载模型文件
    async loadModelFiles(files) {
        try {
            const results = await this.modelLoader.loadModelFiles(files);

            // 处理加载结果
            if (results.success.length > 0) {
                console.log(`成功加载 ${results.success.length} 个模型`);

                // 自动选择最后一个加载的模型
                if (results.success.length > 0) {
                    const lastModel = results.success[results.success.length - 1].model;
                    this.sceneManager.selectModel(lastModel);
                }
            }

            if (results.failed.length > 0) {
                console.warn(`${results.failed.length} 个模型加载失败`);
                results.failed.forEach(failure => {
                    console.warn(`失败: ${failure.file} - ${failure.error}`);
                });
            }

            return results;
        } catch (error) {
            console.error('加载模型文件时出错:', error);
            throw error;
        }
    }

    // 更新交互
    update() {
        // 每帧更新的交互逻辑
    }
}