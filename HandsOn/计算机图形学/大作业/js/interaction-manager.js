// 交互管理器 - 处理用户与场景的交互，包括模型选择、拖拽等
class InteractionManager {
    constructor(sceneManager, editor) {
        this.sceneManager = sceneManager;
        this.editor = editor;
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isDragging = false;
        this.dragPlane = null;
        this.dragOffset = new THREE.Vector3();
        this.selectedObject = null;
        this.lockedSelection = false; // 锁定选择状态
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.createDragPlane();
    }

    setupEventListeners() {
        const canvas = this.sceneManager.renderer.domElement;
        
        // 鼠标事件
        canvas.addEventListener('mousedown', (event) => this.onMouseDown(event));
        canvas.addEventListener('mousemove', (event) => this.onMouseMove(event));
        canvas.addEventListener('mouseup', (event) => this.onMouseUp(event));
        canvas.addEventListener('click', (event) => this.onClick(event));
        
        // 防止右键菜单
        canvas.addEventListener('contextmenu', (event) => event.preventDefault());
        
        // 键盘事件
        document.addEventListener('keydown', (event) => this.onKeyDown(event));
        document.addEventListener('keyup', (event) => this.onKeyUp(event));
    }

    createDragPlane() {
        // 创建一个不可见的平面用于拖拽计算
        const planeGeometry = new THREE.PlaneGeometry(1000, 1000);
        const planeMaterial = new THREE.MeshBasicMaterial({
            visible: false
        });
        this.dragPlane = new THREE.Mesh(planeGeometry, planeMaterial);
        this.dragPlane.rotation.x = -Math.PI / 2; // 水平平面
    }

    update(deltaTime) {
        // 更新交互状态
        if (this.isDragging && this.selectedObject) {
            this.updateDragging();
        }
    }

    // 鼠标按下事件
    onMouseDown(event) {
        if (event.button !== 0) return; // 只处理左键
        
        this.updateMousePosition(event);
        
        // 检测点击的对象
        const intersects = this.getIntersects();
        
        if (intersects.length > 0) {
            const intersect = intersects[0];
            const object = this.getSelectableObject(intersect.object);
            
            if (object && this.editor.modelManager.models.includes(object)) {
                this.startDragging(object, intersect.point);
            }
        }
    }

    // 鼠标移动事件
    onMouseMove(event) {
        this.updateMousePosition(event);
        
        if (this.isDragging) {
            this.updateDragging();
        } else {
            // 鼠标悬停效果
            this.updateHoverEffect();
        }
    }

    // 鼠标释放事件
    onMouseUp(event) {
        if (event.button !== 0) return;
        
        this.stopDragging();
    }

    // 鼠标点击事件
    onClick(event) {
        this.updateMousePosition(event);
        
        // 如果正在拖拽，不处理点击事件
        if (this.isDragging) return;
        
        const intersects = this.getIntersects();
        
        if (intersects.length > 0) {
            const intersect = intersects[0];
            const object = this.getSelectableObject(intersect.object);
            
            if (object && this.editor.modelManager.models.includes(object)) {
                this.selectObject(object);
            } else {
                // 点击空白处取消选择（如果未锁定）
                if (!this.lockedSelection) {
                    this.selectObject(null);
                }
            }
        } else {
            // 点击空白处取消选择（如果未锁定）
            if (!this.lockedSelection) {
                this.selectObject(null);
            }
        }
    }

    // 键盘事件处理
    onKeyDown(event) {
        switch (event.code) {
            case 'Delete':
            case 'Backspace':
                if (this.editor.getSelectedModel()) {
                    this.editor.modelManager.deleteSelectedModel();
                }
                break;
                
            case 'KeyD':
                if (event.ctrlKey && this.editor.getSelectedModel()) {
                    event.preventDefault();
                    this.editor.modelManager.duplicateSelectedModel();
                }
                break;
                
            case 'KeyL': // L键锁定/解锁选中模型
                event.preventDefault();
                this.toggleLockSelection();
                break;
                
            case 'Escape':
                this.selectObject(null);
                break;
        }
    }

    onKeyUp(event) {
        // 处理按键释放
    }

    // 锁定/解锁选择
    toggleLockSelection() {
        this.lockedSelection = !this.lockedSelection;
        
        if (this.lockedSelection) {
            this.editor.uiManager.showNotification('模型选择已锁定', 'info');
            document.body.style.cursor = 'not-allowed';
        } else {
            this.editor.uiManager.showNotification('模型选择已解锁', 'info');
            document.body.style.cursor = 'default';
        }
    }

    // 更新鼠标位置
    updateMousePosition(event) {
        const rect = this.sceneManager.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    // 获取射线与场景的交点
    getIntersects() {
        this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
        
        // 获取所有可交互的对象
        const objects = this.editor.modelManager.getAllModels();
        return this.raycaster.intersectObjects(objects, true);
    }

    // 获取可选择对象
    getSelectableObject(object) {
        // 如果是网格，返回其父对象（模型组）
        if (object.isMesh) {
            return object.parent || object;
        }
        return object;
    }

    // 开始拖拽
    startDragging(object, intersectionPoint) {
        if (this.editor.cameraManager.currentMode === 'firstPerson') {
            // 第一人称模式下不启用拖拽
            return;
        }

        this.isDragging = true;
        this.selectedObject = object;
        
        // 设置拖拽平面位置
        this.dragPlane.position.copy(intersectionPoint);
        this.dragPlane.position.y = object.position.y; // 保持y坐标不变
        
        // 计算拖拽偏移
        const planeIntersect = this.raycaster.intersectObject(this.dragPlane);
        if (planeIntersect.length > 0) {
            this.dragOffset.copy(planeIntersect[0].point).sub(object.position);
        }
        
        // 禁用轨道控制器
        this.sceneManager.controls.enabled = false;
        
        // 改变鼠标样式
        document.body.style.cursor = 'grabbing';
        
        console.log(`开始拖拽模型: ${object.userData.name}`);
    }

    // 更新拖拽
    updateDragging() {
        if (!this.isDragging || !this.selectedObject) return;
        
        // 计算与拖拽平面的交点
        this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
        const intersects = this.raycaster.intersectObject(this.dragPlane);
        
        if (intersects.length > 0) {
            const newPosition = intersects[0].point.sub(this.dragOffset);
            
            // 保持y坐标不变（在地面上拖拽）
            newPosition.y = this.selectedObject.position.y;
            
            this.selectedObject.position.copy(newPosition);
        }
    }

    // 停止拖拽
    stopDragging() {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        
        // 重新启用轨道控制器
        if (this.editor.cameraManager.currentMode === 'orbit') {
            this.sceneManager.controls.enabled = true;
        }
        
        // 恢复鼠标样式（如果没有锁定）
        if (!this.lockedSelection) {
            document.body.style.cursor = 'default';
        }
        
        console.log(`停止拖拽模型: ${this.selectedObject.userData.name}`);
    }

    // 选择对象
    selectObject(object) {
        if (this.selectedObject === object) return;
        
        // 如果锁定了选择，不允许改变选择
        if (this.lockedSelection && object !== this.selectedObject) {
            return;
        }
        
        // 更新选择状态
        if (this.selectedObject) {
            this.selectedObject.userData.isSelected = false;
            this.editor.modelManager.updateModelAppearance(this.selectedObject);
        }
        
        this.selectedObject = object;
        
        if (object) {
            object.userData.isSelected = true;
            this.editor.modelManager.updateModelAppearance(object);
            console.log(`选择模型: ${object.userData.name}`);
        }
        
        // 通知编辑器
        this.editor.modelManager.selectModel(object);
    }

    // 更新悬停效果
    updateHoverEffect() {
        // 如果锁定了选择，不显示悬停效果
        if (this.lockedSelection) return;
        
        const intersects = this.getIntersects();
        
        // 重置所有模型的悬停状态
        this.editor.modelManager.getAllModels().forEach(model => {
            if (!model.userData.isSelected) {
                this.setHoverEffect(model, false);
            }
        });
        
        // 设置悬停对象的悬停效果
        if (intersects.length > 0) {
            const object = this.getSelectableObject(intersects[0].object);
            if (this.editor.modelManager.models.includes(object) && !object.userData.isSelected) {
                this.setHoverEffect(object, true);
                document.body.style.cursor = 'pointer';
            } else {
                document.body.style.cursor = this.lockedSelection ? 'not-allowed' : 'default';
            }
        } else {
            document.body.style.cursor = this.lockedSelection ? 'not-allowed' : 'default';
        }
    }

    // 设置悬停效果
    setHoverEffect(object, isHovering) {
        object.traverse((child) => {
            if (child.isMesh && child.material && !object.userData.isSelected) {
                if (isHovering) {
                    // 添加悬停高亮
                    child.material.emissive = new THREE.Color(0x4ecdc4);
                    child.material.emissiveIntensity = 0.1;
                } else {
                    // 移除悬停高亮
                    child.material.emissive = new THREE.Color(0x000000);
                    child.material.emissiveIntensity = 0;
                }
            }
        });
    }

    // 获取鼠标下的对象
    getObjectUnderMouse() {
        const intersects = this.getIntersects();
        if (intersects.length > 0) {
            return this.getSelectableObject(intersects[0].object);
        }
        return null;
    }

    // 获取鼠标位置
    getMousePosition() {
        return this.mouse.clone();
    }

    // 检查是否正在拖拽
    isDraggingObject() {
        return this.isDragging;
    }

    // 获取选中的对象
    getSelectedObject() {
        return this.selectedObject;
    }

    // 检查选择是否被锁定
    isSelectionLocked() {
        return this.lockedSelection;
    }

    // 框选功能
    startBoxSelection(startPoint, endPoint) {
        // 实现框选逻辑
        const minX = Math.min(startPoint.x, endPoint.x);
        const maxX = Math.max(startPoint.x, endPoint.x);
        const minY = Math.min(startPoint.y, endPoint.y);
        const maxY = Math.max(startPoint.y, endPoint.y);
        
        const selectedModels = [];
        
        this.editor.modelManager.getAllModels().forEach(model => {
            // 将3D位置投影到2D屏幕坐标
            const screenPosition = this.worldToScreen(model.position);
            
            if (screenPosition.x >= minX && screenPosition.x <= maxX &&
                screenPosition.y >= minY && screenPosition.y <= maxY) {
                selectedModels.push(model);
            }
        });
        
        return selectedModels;
    }

    // 3D世界坐标转换为屏幕坐标
    worldToScreen(worldPosition) {
        const vector = worldPosition.clone();
        vector.project(this.sceneManager.camera);
        
        const canvas = this.sceneManager.renderer.domElement;
        return {
            x: (vector.x + 1) * canvas.width / 2,
            y: (-vector.y + 1) * canvas.height / 2
        };
    }

    // 屏幕坐标转换为3D世界坐标
    screenToWorld(screenPosition, planeY = 0) {
        const canvas = this.sceneManager.renderer.domElement;
        const mouse = new THREE.Vector2(
            (screenPosition.x / canvas.width) * 2 - 1,
            -(screenPosition.y / canvas.height) * 2 + 1
        );
        
        this.raycaster.setFromCamera(mouse, this.sceneManager.camera);
        
        // 与水平平面相交
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
        const intersection = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(plane, intersection);
        
        return intersection;
    }

    // 启用/禁用交互
    setEnabled(enabled) {
        this.enabled = enabled;
        
        if (!enabled) {
            this.stopDragging();
            if (!this.lockedSelection) {
                this.selectObject(null);
            }
        }
    }

    // 销毁交互管理器
    dispose() {
        const canvas = this.sceneManager.renderer.domElement;
        
        canvas.removeEventListener('mousedown', this.onMouseDown);
        canvas.removeEventListener('mousemove', this.onMouseMove);
        canvas.removeEventListener('mouseup', this.onMouseUp);
        canvas.removeEventListener('click', this.onClick);
        
        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('keyup', this.onKeyUp);
        
        document.body.style.cursor = 'default';
    }
}