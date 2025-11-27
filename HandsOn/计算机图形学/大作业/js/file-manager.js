// 文件管理器 - 处理场景的保存和加载
class FileManager {
    constructor(editor) {
        this.editor = editor;
        this.currentSceneFile = null;
        this.supportedFormats = ['.json', '.scene'];
    }

    // 保存场景
    async saveScene() {
        try {
            this.editor.uiManager.showLoading('正在保存场景...');
            
            const sceneData = this.collectSceneData();
            
            // 添加文件路径信息
            sceneData.fileInfo = {
                models: this.editor.modelManager.getAllModels().map(model => ({
                    id: model.userData.id,
                    fileName: model.userData.fileName || null,
                    type: model.userData.type
                }))
            };
            
            const jsonData = JSON.stringify(sceneData, null, 2);
            
            // 创建下载链接
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `scene-${Date.now()}.json`;
            link.click();
            
            URL.revokeObjectURL(url);
            
            this.editor.uiManager.hideLoading();
            this.editor.uiManager.showNotification('场景保存成功', 'success');
            
        } catch (error) {
            console.error('保存场景失败:', error);
            this.editor.uiManager.hideLoading();
            this.editor.uiManager.showNotification('场景保存失败: ' + error.message, 'error');
        }
    }

    // 加载场景
    async loadScene() {
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,.scene';
            
            input.onchange = async (event) => {
                const file = event.target.files[0];
                if (!file) return;
                
                this.editor.uiManager.showLoading('正在加载场景...');
                
                try {
                    const text = await this.readFileAsText(file);
                    const sceneData = JSON.parse(text);
                    
                    await this.applySceneData(sceneData);
                    
                    this.currentSceneFile = file;
                    this.editor.uiManager.showNotification('场景加载成功', 'success');
                    
                } catch (error) {
                    console.error('加载场景失败:', error);
                    this.editor.uiManager.showNotification('场景加载失败: ' + error.message, 'error');
                }
                
                this.editor.uiManager.hideLoading();
            };
            
            input.click();
            
        } catch (error) {
            console.error('加载场景失败:', error);
            this.editor.uiManager.showNotification('加载场景失败: ' + error.message, 'error');
        }
    }

    // 收集场景数据
    collectSceneData() {
        const sceneData = {
            version: '1.0',
            timestamp: Date.now(),
            
            // 场景信息
            scene: {
                background: this.getBackgroundColor(),
                fog: {
                    color: this.editor.sceneManager.scene.fog.color.getHex(),
                    near: this.editor.sceneManager.scene.fog.near,
                    far: this.editor.sceneManager.scene.fog.far
                }
            },
            
            // 相机数据
            camera: this.editor.cameraManager.getCameraData(),
            
            // 光源数据
            lights: this.editor.lightManager.getLightsData(),
            
            // 模型数据
            models: this.editor.modelManager.getModelsData(),
            
            // 渲染设置
            renderer: {
                shadowMap: true,
                antialias: true,
                pixelRatio: this.editor.sceneManager.renderer.getPixelRatio()
            },
            
            // 文件映射信息
            fileMappings: this.getFileMappings()
        };
        
        return sceneData;
    }

    // 获取背景颜色
    getBackgroundColor() {
        const background = this.editor.sceneManager.scene.background;
        if (background instanceof THREE.Color) {
            return background.getHex();
        } else if (background && typeof background === 'number') {
            return background;
        } else if (background === null) {
            return 0x000000; // 默认黑色
        }
        // 对于纹理或其他类型背景，返回默认值
        return this.editor.environmentManager ?
               this.editor.environmentManager.defaultSkyColor : 0x87ceeb;
    }

    // 获取文件映射信息
    getFileMappings() {
        const mappings = {};
        
        this.editor.modelManager.getAllModels().forEach(model => {
            if (model.userData.type === 'external' && model.userData.fileName) {
                mappings[model.userData.id] = {
                    fileName: model.userData.fileName,
                    originalPath: model.userData.originalPath || './model/',
                    modelType: this.getModelTypeFromFileName(model.userData.fileName)
                };
            }
        });
        
        return mappings;
    }

    // 从文件名获取模型类型
    getModelTypeFromFileName(fileName) {
        const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
        switch (ext) {
            case '.obj': return 'obj';
            case '.gltf': return 'gltf';
            case '.glb': return 'glb';
            case '.fbx': return 'fbx';
            default: return 'unknown';
        }
    }

    // 应用场景数据
    async applySceneData(sceneData) {
        try {
            // 清空当前场景
            await this.editor.clearScene();
            
            // 应用场景设置
            if (sceneData.scene) {
                this.applySceneSettings(sceneData.scene);
            }
            
            // 应用相机设置
            if (sceneData.camera) {
                this.editor.cameraManager.loadCameraData(sceneData.camera);
            }
            
            // 应用光源设置
            if (sceneData.lights) {
                await this.editor.lightManager.loadLightsFromData(sceneData.lights);
            }
            
            // 应用模型设置
            if (sceneData.models) {
                await this.editor.modelManager.loadModelsFromData(sceneData.models, sceneData.fileMappings);
            }
            
            // 更新UI
            this.editor.updateSceneInfo();
            
            console.log('场景数据应用完成');
            
        } catch (error) {
            console.error('应用场景数据失败:', error);
            throw error;
        }
    }

    // 应用场景设置
    applySceneSettings(sceneSettings) {
        const scene = this.editor.sceneManager.scene;

        // 设置背景色
        if (sceneSettings.background !== undefined) {
            // 检查 scene.background 是否为 THREE.Color 对象
            if (scene.background instanceof THREE.Color) {
                scene.background.setHex(sceneSettings.background);
            } else {
                // 如果不是 Color 对象，则创建新的 Color 对象
                scene.background = new THREE.Color(sceneSettings.background);
            }
        }

        // 设置雾效
        if (sceneSettings.fog) {
            scene.fog.color.setHex(sceneSettings.fog.color);
            scene.fog.near = sceneSettings.fog.near;
            scene.fog.far = sceneSettings.fog.far;
        }
    }

    // 导出场景为图像
    exportSceneImage() {
        try {
            this.editor.sceneManager.exportToImage();
            this.editor.uiManager.showNotification('图像导出成功', 'success');
        } catch (error) {
            console.error('导出图像失败:', error);
            this.editor.uiManager.showNotification('导出图像失败: ' + error.message, 'error');
        }
    }

    // 创建场景模板
    createSceneTemplate(templateName) {
        const templates = {
            empty: {
                name: '空场景',
                description: '没有任何对象的空白场景',
                scene: {
                    background: 0x1a1a2e,
                    fog: { color: 0x1a1a2e, near: 10, far: 100 }
                },
                camera: {
                    mode: 'orbit',
                    position: { x: 0, y: 5, z: 15 }
                },
                lights: {
                    ambientLights: [{ intensity: 0.3, color: 0xffffff }],
                    directionalLights: [{ intensity: 1.0, color: 0xffffff, position: { x: 10, y: 10, z: 5 } }]
                },
                models: []
            },
            
            basic: {
                name: '基础场景',
                description: '包含三个基本几何体的场景',
                scene: {
                    background: 0x2d3561,
                    fog: { color: 0x2d3561, near: 10, far: 50 }
                },
                camera: {
                    mode: 'orbit',
                    position: { x: 0, y: 5, z: 15 }
                },
                lights: {
                    ambientLights: [{ intensity: 0.4, color: 0xffffff }],
                    directionalLights: [
                        { intensity: 1.2, color: 0xffffff, position: { x: 10, y: 10, z: 5 } },
                        { intensity: 0.8, color: 0xff6b6b, position: { x: -10, y: 5, z: -5 } }
                    ],
                    pointLights: [
                        { intensity: 1.0, color: 0x4ecdc4, position: { x: 0, y: 5, z: 0 }, distance: 20 }
                    ]
                },
                models: [
                    {
                        type: 'primitive',
                        primitiveType: 'cube',
                        name: '红色立方体',
                        position: { x: -3, y: 0, z: 0 },
                        scale: { x: 1, y: 1, z: 1 },
                        rotation: { x: 0, y: 0, z: 0 },
                        color: 0xff6b6b
                    },
                    {
                        type: 'primitive',
                        primitiveType: 'sphere',
                        name: '青色球体',
                        position: { x: 0, y: 0, z: 0 },
                        scale: { x: 1, y: 1, z: 1 },
                        rotation: { x: 0, y: 0, z: 0 },
                        color: 0x4ecdc4
                    },
                    {
                        type: 'primitive',
                        primitiveType: 'cylinder',
                        name: '蓝色圆柱体',
                        position: { x: 3, y: 0, z: 0 },
                        scale: { x: 1, y: 1, z: 1 },
                        rotation: { x: 0, y: 0, z: 0 },
                        color: 0x45b7d1
                    }
                ]
            },
            
            complex: {
                name: '复杂场景',
                description: '包含多个光源和复杂几何体的场景',
                scene: {
                    background: 0x16213e,
                    fog: { color: 0x16213e, near: 15, far: 100 }
                },
                camera: {
                    mode: 'orbit',
                    position: { x: 10, y: 8, z: 15 }
                },
                lights: {
                    ambientLights: [{ intensity: 0.2, color: 0x444444 }],
                    directionalLights: [
                        { intensity: 1.5, color: 0xffffff, position: { x: 15, y: 15, z: 10 } }
                    ],
                    pointLights: [
                        { intensity: 2.0, color: 0xff6b6b, position: { x: -5, y: 3, z: 5 }, distance: 15 },
                        { intensity: 2.0, color: 0x4ecdc4, position: { x: 5, y: 3, z: -5 }, distance: 15 },
                        { intensity: 1.5, color: 0x45b7d1, position: { x: 0, y: 8, z: 0 }, distance: 20 }
                    ],
                    spotLights: [
                        { intensity: 3.0, color: 0xffffff, position: { x: 0, y: 10, z: 0 }, target: { x: 0, y: 0, z: 0 } }
                    ]
                },
                models: [
                    {
                        type: 'primitive',
                        primitiveType: 'torus',
                        name: '圆环体',
                        position: { x: -4, y: 1, z: 2 },
                        scale: { x: 1.5, y: 1.5, z: 1.5 },
                        rotation: { x: 0, y: 45, z: 0 },
                        color: 0xff6b6b
                    },
                    {
                        type: 'primitive',
                        primitiveType: 'cone',
                        name: '圆锥体',
                        position: { x: 0, y: 1, z: 0 },
                        scale: { x: 1.2, y: 1.2, z: 1.2 },
                        rotation: { x: 0, y: 0, z: 0 },
                        color: 0x4ecdc4
                    },
                    {
                        type: 'primitive',
                        primitiveType: 'dodecahedron',
                        name: '十二面体',
                        position: { x: 4, y: 1, z: -2 },
                        scale: { x: 1, y: 1, z: 1 },
                        rotation: { x: 0, y: 30, z: 0 },
                        color: 0x45b7d1
                    },
                    {
                        type: 'primitive',
                        primitiveType: 'octahedron',
                        name: '八面体',
                        position: { x: -2, y: 2, z: -4 },
                        scale: { x: 0.8, y: 0.8, z: 0.8 },
                        rotation: { x: 0, y: 60, z: 0 },
                        color: 0xffd93d
                    }
                ]
            }
        };
        
        return templates[templateName] || templates.basic;
    }

    // 加载场景模板
    async loadSceneTemplate(templateName) {
        try {
            this.editor.uiManager.showLoading('正在加载场景模板...');
            
            const template = this.createSceneTemplate(templateName);
            await this.applySceneData(template);
            
            this.editor.uiManager.hideLoading();
            this.editor.uiManager.showNotification(`已加载场景模板: ${template.name}`, 'success');
            
        } catch (error) {
            console.error('加载场景模板失败:', error);
            this.editor.uiManager.hideLoading();
            this.editor.uiManager.showNotification('加载场景模板失败: ' + error.message, 'error');
        }
    }

    // 读取文件内容为文本
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = (error) => reject(error);
            reader.readAsText(file);
        });
    }

    // 验证场景数据
    validateSceneData(sceneData) {
        const requiredFields = ['version', 'scene', 'camera', 'lights', 'models'];
        
        for (const field of requiredFields) {
            if (!sceneData.hasOwnProperty(field)) {
                throw new Error(`场景数据缺少必要字段: ${field}`);
            }
        }
        
        // 版本检查
        if (sceneData.version !== '1.0') {
            console.warn(`未知场景版本: ${sceneData.version}，可能无法正常加载`);
        }
        
        return true;
    }

    // 获取当前场景文件信息
    getCurrentSceneInfo() {
        return {
            file: this.currentSceneFile,
            name: this.currentSceneFile ? this.currentSceneFile.name : '未保存的场景',
            lastModified: this.currentSceneFile ? this.currentSceneFile.lastModified : null
        };
    }

    // 导出场景数据为其他格式（如GLTF）
    async exportScene(format = 'json') {
        try {
            switch (format.toLowerCase()) {
                case 'json':
                    await this.saveScene();
                    break;
                    
                case 'gltf':
                case 'glb':
                    // 需要GLTFExporter支持
                    this.editor.uiManager.showNotification('GLTF导出功能需要额外支持', 'info');
                    break;
                    
                default:
                    this.editor.uiManager.showNotification(`不支持的导出格式: ${format}`, 'error');
            }
        } catch (error) {
            console.error('导出失败:', error);
            this.editor.uiManager.showNotification('导出失败: ' + error.message, 'error');
        }
    }

    // 自动保存功能
    async autoSave() {
        try {
            const sceneData = this.collectSceneData();
            const jsonData = JSON.stringify(sceneData);
            
            // 保存到localStorage
            localStorage.setItem('webgl_editor_autosave', jsonData);
            localStorage.setItem('webgl_editor_autosave_time', Date.now().toString());
            
            console.log('自动保存完成');
        } catch (error) {
            console.error('自动保存失败:', error);
        }
    }

    // 加载自动保存的场景
    async loadAutoSave() {
        try {
            const autosaveData = localStorage.getItem('webgl_editor_autosave');
            const autosaveTime = localStorage.getItem('webgl_editor_autosave_time');
            
            if (autosaveData && autosaveTime) {
                const timeDiff = Date.now() - parseInt(autosaveTime);
                const hoursDiff = timeDiff / (1000 * 60 * 60);
                
                if (hoursDiff < 24) { // 只加载24小时内的自动保存
                    const sceneData = JSON.parse(autosaveData);
                    await this.applySceneData(sceneData);
                    
                    this.editor.uiManager.showNotification('已恢复上次的工作场景', 'info');
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            console.error('加载自动保存失败:', error);
            return false;
        }
    }

    // 清除自动保存
    clearAutoSave() {
        localStorage.removeItem('webgl_editor_autosave');
        localStorage.removeItem('webgl_editor_autosave_time');
        console.log('自动保存已清除');
    }
}