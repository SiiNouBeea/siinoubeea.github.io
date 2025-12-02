// UI管理器 - 处理所有用户界面交互和更新
class UIManager {
    constructor(editor) {
        this.editor = editor;
        this.isInitialized = false;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializeControls();
        this.isInitialized = true;
        console.log('UI管理器初始化完成');
    }

    setupEventListeners() {
        // 场景管理
        this.bindEvent('new-scene', 'click', () => this.editor.newScene());
        this.bindEvent('generate-initial-scene', 'click', () => this.editor.sceneGenerator.generateInitialScene());
        this.bindEvent('save-scene', 'click', () => this.editor.fileManager.saveScene());
        this.bindEvent('load-scene', 'click', () => this.editor.fileManager.loadScene());
        this.bindEvent('clear-scene', 'click', () => this.editor.clearScene());
        this.bindEvent('export-image', 'click', () => this.editor.exportImage());
        this.bindEvent('screenshot', 'click', () => this.editor.exportImage());

        // 光源参数对话框 - 实时更新滑块数值显示
        this.bindEvent('light-intensity', 'input', (e) => {
            const value = e.target.value;
            document.getElementById('intensity-value').textContent = value;
        });

        this.bindEvent('light-distance', 'input', (e) => {
            const value = e.target.value;
            document.getElementById('distance-value').textContent = value;
        });

        // 光源参数对话框 - 实时更新颜色预览
        this.bindEvent('light-color', 'input', (e) => {
            const color = e.target.value;
            document.getElementById('color-preview').style.backgroundColor = color;
        });

        // 光源控制
        this.bindEvent('ambient-intensity', 'input', (e) => {
            const intensity = parseFloat(e.target.value);
            if (this.editor.lightManager.ambientLights.length > 0) {
                this.editor.lightManager.updateLightIntensity('ambient', 0, intensity);
            }
        });

        this.bindEvent('directional-intensity', 'input', (e) => {
            const intensity = parseFloat(e.target.value);
            if (this.editor.lightManager.directionalLights.length > 0) {
                this.editor.lightManager.updateLightIntensity('directional', 0, intensity);
            }
        });

        document.getElementById('color-preview').addEventListener('click', function() {
            document.getElementById('light-color').click();
        });

        document.getElementById('light-color').addEventListener('input', function() {
            document.getElementById('color-preview').style.backgroundColor = this.value;
        });

        this.bindEvent('screenshot', 'click', () => this.editor.exportImage());
        
        // 原按钮改为弹窗
        this.bindEvent('add-point-light', 'click', () => this.showLightModal('point'));
        this.bindEvent('remove-point-light', 'click', () => {
            this.editor.lightManager.removePointLight();
            this.updateLightInfo();
        });

        this.bindEvent('add-directional-light', 'click', () => this.showLightModal('directional'));
        this.bindEvent('remove-directional-light', 'click', () => {
            this.editor.lightManager.removeDirectionalLight();
            this.updateLightInfo();
        });

        // 新增面光源按钮
        const areaBtn = document.getElementById('add-area-light');
        if(areaBtn) this.bindEvent('add-area-light','click',()=>this.showLightModal('area'));
        const rmAreaBtn = document.getElementById('remove-area-light');
        if(rmAreaBtn) this.bindEvent('remove-area-light','click',()=>{
            this.editor.lightManager.removeAreaLight();
            this.updateLightInfo();
        });

        // 相机控制
        this.bindEvent('camera-mode-select', 'change', (e) => {
            this.editor.cameraManager.switchMode(e.target.value);
        });

        this.bindEvent('camera-speed', 'input', (e) => {
            const speed = parseFloat(e.target.value);
            this.editor.cameraManager.setMoveSpeed(speed);
        });

        this.bindEvent('reset-camera', 'click', () => {
            this.editor.cameraManager.resetCamera();
        });

        this.bindEvent('center-view', 'click', () => {
            this.editor.cameraManager.centerView();
        });

        // 模型控制
        this.bindEvent('load-model', 'click', () => this.showModelLoadDialog());
        this.bindEvent('add-primitive', 'click', () => this.showPrimitiveDialog());

        this.bindEvent('model-scale', 'input', (e) => {
            const scale = parseFloat(e.target.value);
            this.updateSelectedModel({ scale: { x: scale, y: scale, z: scale } });
        });

        this.bindEvent('model-rotation', 'input', (e) => {
            const rotation = parseFloat(e.target.value);
            this.updateSelectedModel({ rotation: { y: rotation } });
        });

        this.bindEvent('delete-selected', 'click', () => {
            this.editor.modelManager.deleteSelectedModel();
        });

        this.bindEvent('duplicate-selected', 'click', () => {
            this.editor.modelManager.duplicateSelectedModel();
        });

        // 材质控制
        this.bindEvent('material-type', 'change', (e) => {
            this.updateMaterialType(e.target.value);
        });

        this.bindEvent('material-color', 'input', (e) => {
            const color = parseInt(e.target.value.replace('#', '0x'));
            this.updateSelectedModelMaterial(color);
        });

        this.bindEvent('material-shininess', 'input', (e) => {
            const shininess = parseInt(e.target.value);
            this.updateSelectedModelShininess(shininess);
        });

        this.bindEvent('load-texture', 'click', () => this.showTextureDialog());
        this.bindEvent('load-normal-map', 'click', () => this.showNormalMapDialog());

        // 模态框事件
        this.bindEvent('confirm-light', 'click', () => this.confirmAddLight());
        this.bindEvent('cancel-light', 'click', () => this.hideModal('light-params-modal'));

        this.bindEvent('confirm-load', 'click', () => this.confirmModelLoad());
        this.bindEvent('cancel-load', 'click', () => this.hideModal('model-params-modal'));
    }

    // 统一弹窗
    showLightModal(type){
        this._pendingLightType = type;
        // 动态标题
        const titleMap = {point:'添加点光源',directional:'添加方向光',spot:'添加聚光灯',area:'添加面光源'};
        document.getElementById('light-modal-title').textContent = titleMap[type] || '添加光源';
        // 控制显示/隐藏
        const distGrp = document.getElementById('light-distance-group');
        const posGrp = document.getElementById('light-position-group');
        if(type==='area'){
            if(distGrp) distGrp.style.display='none';
            if(posGrp) posGrp.style.display='block';
        }else{
            if(distGrp) distGrp.style.display='block';
            if(posGrp) posGrp.style.display='block';
        }
        this.showModal('light-params-modal');
    }

    confirmAddLight(){
        const type = this._pendingLightType;
        const intensity = parseFloat(document.getElementById('light-intensity').value);
        const colorInput = document.getElementById('light-color').value;
        const color = parseInt(colorInput.replace('#', '0x'), 16);
        console.log(color,colorInput);
        const pos = {
            x: parseFloat(document.getElementById('light-position-x').value),
            y: parseFloat(document.getElementById('light-position-y').value),
            z: parseFloat(document.getElementById('light-position-z').value)
        };
        const distance = parseFloat(document.getElementById('light-distance').value);

        switch(type){
            case 'point':
                this.editor.lightManager.addPointLight(intensity, color, pos, distance);
                break;
            case 'directional':
                this.editor.lightManager.addDirectionalLight(intensity, color, pos);
                break;
            case 'spot':
                this.editor.lightManager.addSpotLight(intensity, color, pos, {x:0, y:0, z:0});
                break;
            case 'area':
                this.editor.lightManager.addAreaLight(intensity, color, pos, distance);
                break;
        }

        this.updateLightInfo();
        this.hideModal('light-params-modal');
    }


    bindEvent(elementId, eventType, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(eventType, handler);
        } else {
            console.warn(`UI元素未找到: ${elementId}`);
        }
    }

    initializeControls() {
        this.setElementValue('ambient-intensity', '0.3');
        this.setElementValue('directional-intensity', '1.0');
        this.setElementValue('light-color', '#ffffff');
        this.setElementValue('camera-speed', '1.0');
        this.setElementValue('model-scale', '1.0');
        this.setElementValue('model-rotation', '0');
        this.setElementValue('material-shininess', '30');
    }

    showModelLoadDialog() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.obj,.gltf,.glb,.fbx';

        input.onchange = (event) => {
            const file = event.target.files[0];
            if (file) {
                this.showModal('model-params-modal');
                this.currentLoadFile = file;
            }
        };

        input.click();
    }

    showPrimitiveDialog() {
        const primitives = ['Cube', 'Sphere', 'Cylinder', 'Cone', 'Torus', 'Plane', 'Octahedron'];
        const selected = prompt('选择几何体类型:\n' + primitives.join('\n'));

        if (selected && primitives.map(p => p.toLowerCase()).includes(selected.toLowerCase())) {
            this.editor.modelManager.addPrimitive(selected.toLowerCase());
        }
    }

    showTextureDialog() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        input.onchange = (event) => {
            const file = event.target.files[0];
            if (file) {
                this.editor.modelManager.loadTexture(file);
            }
        };

        input.click();
    }

    showNormalMapDialog() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        input.onchange = (event) => {
            const file = event.target.files[0];
            if (file) {
                this.editor.modelManager.loadNormalMap(file);
            }
        };

        input.click();
    }

    async confirmModelLoad() {
        if (!this.currentLoadFile) return;

        const params = {
            position: {
                x: parseFloat(this.getElementValue('model-position-x') || 0),
                y: parseFloat(this.getElementValue('model-position-y') || 0),
                z: parseFloat(this.getElementValue('model-position-z') || 0)
            },
            scale: {
                x: parseFloat(this.getElementValue('model-scale-x') || 1),
                y: parseFloat(this.getElementValue('model-scale-y') || 1),
                z: parseFloat(this.getElementValue('model-scale-z') || 1)
            },
            rotation: {
                x: parseFloat(this.getElementValue('model-rotation-x') || 0),
                y: parseFloat(this.getElementValue('model-rotation-y') || 0),
                z: parseFloat(this.getElementValue('model-rotation-z') || 0)
            }
        };

        try {
            await this.editor.modelManager.loadModel(this.currentLoadFile, params);
            this.hideModal('model-params-modal');
        } catch (error) {
            alert('模型加载失败: ' + error.message);
        }

        this.currentLoadFile = null;
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
        }
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
        }
    }

    updateSelectedModel(options) {
        this.editor.modelManager.updateSelectedModel(options);
    }

    updateMaterialType(materialType) {
        const selectedModel = this.editor.getSelectedModel();
        if (selectedModel) {
            const color = selectedModel.userData.originalColor || 0x4ecdc4;
            const shininess = parseInt(this.getElementValue('material-shininess') || 30);
            this.editor.modelManager.updateModelMaterial(materialType, color, shininess);
        }
    }

    updateSelectedModelMaterial(color) {
        const selectedModel = this.editor.getSelectedModel();
        if (selectedModel) {
            const materialType = this.getElementValue('material-type') || 'phong';
            const shininess = parseInt(this.getElementValue('material-shininess') || 30);
            this.editor.modelManager.updateModelMaterial(materialType, color, shininess);
        }
    }

    updateSelectedModelShininess(shininess) {
        const selectedModel = this.editor.getSelectedModel();
        if (selectedModel) {
            const materialType = this.getElementValue('material-type') || 'phong';
            const color = parseInt(this.getElementValue('material-color')?.replace('#', '0x') || '0x4ecdc4');
            this.editor.modelManager.updateModelMaterial(materialType, color, shininess);
        }
    }

    updateLightInfo() {
        this.setElementText('point-lights', this.editor.lightManager.getPointLightCount());
        this.setElementText('directional-lights', this.editor.lightManager.getDirectionalLightCount());
        const areaCount = this.editor.lightManager.areaLights ? this.editor.lightManager.areaLights.length : 0;
        this.setElementText('area-lights', areaCount);
    }

    updateCameraControls() {
        const currentMode = this.editor.cameraManager.currentMode;
        this.setElementValue('camera-mode-select', currentMode);
    }

    updateModelControls() {
        const selectedModel = this.editor.getSelectedModel();

        if (selectedModel) {
            const scale = selectedModel.scale.x;
            this.setElementValue('model-scale', scale.toString());

            const rotation = THREE.MathUtils.radToDeg(selectedModel.rotation.y);
            this.setElementValue('model-rotation', rotation.toString());

            this.updateMaterialControls(selectedModel);
        }
    }

    updateMaterialControls(model) {
        if (!model) return;

        let material = null;
        model.traverse((child) => {
            if (child.isMesh && child.material && !material) {
                material = child.material;
            }
        });

        if (material) {
            let materialType = 'phong';
            if (material instanceof THREE.MeshBasicMaterial) materialType = 'basic';
            else if (material instanceof THREE.MeshLambertMaterial) materialType = 'lambert';
            else if (material instanceof THREE.MeshStandardMaterial) materialType = 'standard';

            this.setElementValue('material-type', materialType);

            const color = '#' + material.color.getHexString();
            this.setElementValue('material-color', color);

            if (material.shininess !== undefined) {
                this.setElementValue('material-shininess', material.shininess.toString());
            }
        }
    }

    getElementValue(elementId) {
        const element = document.getElementById(elementId);
        return element ? element.value : '';
    }

    setElementValue(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.value = value;
        }
    }

    getElementText(elementId) {
        const element = document.getElementById(elementId);
        return element ? element.textContent : '';
    }

    setElementText(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'error' ? '#ff6b6b' : '#4ecdc4'};
            color: white;
            border-radius: 8px;
            z-index: 10000;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transition: all 0.3s ease;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    showLoading(message = '加载中...') {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.querySelector('p').textContent = message;
            overlay.style.display = 'flex';
        }
    }

    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    updateAllInfo() {
        this.updateLightInfo();
        this.updateCameraControls();
        this.updateModelControls();
    }

    setEnabled(enabled) {
        const controls = document.querySelectorAll('input, button, select');
        controls.forEach(control => {
            control.disabled = !enabled;
        });
    }
}