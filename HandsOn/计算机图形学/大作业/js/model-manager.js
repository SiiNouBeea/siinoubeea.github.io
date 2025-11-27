// 模型管理器 - 处理所有模型的加载、创建、管理和交互
class ModelManager {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.models = [];
        this.selectedModel = null;
        this.modelIdCounter = 0;
        
        // 支持的模型格式
        this.supportedFormats = ['.obj', '.gltf', '.glb', '.fbx'];
        
        // 默认材质
        this.defaultMaterial = new THREE.MeshPhongMaterial({
            color: 0x4ecdc4,
            shininess: 30,
            specular: 0x111111
        });
    }

    // 生成模型ID
    generateModelId(type = 'model') {
        return `${type}_${++this.modelIdCounter}_${Date.now()}`;
    }

    // 添加基础几何体
    async addPrimitive(type, options = {}) {
        const {
            position = { x: 0, y: 0, z: 0 },
            scale = { x: 1, y: 1, z: 1 },
            rotation = { x: 0, y: 0, z: 0 },
            color = 0x4ecdc4,
            name = null
        } = options;

        let geometry, material, mesh;

        // 创建几何体
        switch (type.toLowerCase()) {
            case 'cube':
            case 'box':
                geometry = new THREE.BoxGeometry(2, 2, 2);
                break;
                
            case 'sphere':
                geometry = new THREE.SphereGeometry(1, 32, 32);
                break;
                
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(1, 1, 2, 32);
                break;
                
            case 'cone':
                geometry = new THREE.ConeGeometry(1, 2, 32);
                break;
                
            case 'torus':
                geometry = new THREE.TorusGeometry(1, 0.4, 16, 100);
                break;
                
            case 'plane':
                geometry = new THREE.PlaneGeometry(4, 4);
                break;
                
            case 'octahedron':
                geometry = new THREE.OctahedronGeometry(1);
                break;
                
            case 'dodecahedron':
                geometry = new THREE.DodecahedronGeometry(1);
                break;
                
            default:
                throw new Error(`不支持的几何体类型: ${type}`);
        }

        // 创建材质
        material = this.defaultMaterial.clone();
        material.color.setHex(color);

        // 创建网格
        mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(position.x, position.y, position.z);
        mesh.scale.set(scale.x, scale.y, scale.z);
        mesh.rotation.set(
            THREE.MathUtils.degToRad(rotation.x),
            THREE.MathUtils.degToRad(rotation.y),
            THREE.MathUtils.degToRad(rotation.z)
        );

        // 配置阴影
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // 设置用户数据
        mesh.userData = {
            id: this.generateModelId(type),
            name: name || `${type}_${this.modelIdCounter}`,
            type: 'primitive',
            primitiveType: type,
            originalColor: color,
            isSelected: false
        };

        this.models.push(mesh);
        this.sceneManager.addToScene(mesh);

        console.log(`添加几何体: ${mesh.userData.name} (${mesh.userData.id})`);
        
        // 自动选中新添加的模型
        this.selectModel(mesh);
        
        return mesh;
    }

    // 加载外部模型
    async loadModel(file, options = {}) {
        const {
            position = { x: 0, y: 0, z: 0 },
            scale = { x: 1, y: 1, z: 1 },
            rotation = { x: 0, y: 0, z: 0 },
            name = null
        } = options;

        try {
            const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
            
            if (!this.supportedFormats.includes(fileExtension)) {
                throw new Error(`不支持的文件格式: ${fileExtension}`);
            }

            let loader;
            let model;

            switch (fileExtension) {
                case '.obj':
                    loader = new THREE.OBJLoader();
                    model = await loader.loadAsync(URL.createObjectURL(file));
                    break;
                    
                case '.gltf':
                case '.glb':
                    // 注意：需要GLTFLoader，这里简化处理
                    throw new Error('GLTF/GLB格式需要额外的加载器支持');
                    
                default:
                    throw new Error(`暂不支持加载 ${fileExtension} 格式`);
            }

            // 配置模型
            model.position.set(position.x, position.y, position.z);
            model.scale.set(scale.x, scale.y, scale.z);
            model.rotation.set(
                THREE.MathUtils.degToRad(rotation.x),
                THREE.MathUtils.degToRad(rotation.y),
                THREE.MathUtils.degToRad(rotation.z)
            );

            // 配置阴影
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // 设置用户数据
            model.userData = {
                id: this.generateModelId('external'),
                name: name || file.name.replace(/\.[^/.]+$/, ""), // 移除文件扩展名
                type: 'external',
                fileName: file.name,
                isSelected: false
            };

            this.models.push(model);
            this.sceneManager.addToScene(model);

            console.log(`加载外部模型: ${model.userData.name} (${model.userData.id})`);
            
            // 自动选中新加载的模型
            this.selectModel(model);
            
            return model;
            
        } catch (error) {
            console.error('模型加载失败:', error);
            throw error;
        }
    }

    // 选择模型
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
        }
        
        // 通知UI更新
        if (window.webglEditor) {
            window.webglEditor.selectModel(model);
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

    // 更新选中模型的变换
    updateSelectedModel(options = {}) {
        if (!this.selectedModel) {
            console.warn('没有选中的模型');
            return;
        }

        const {
            position = null,
            scale = null,
            rotation = null,
            color = null
        } = options;

        if (position) {
            this.selectedModel.position.set(position.x, position.y, position.z);
        }

        if (scale) {
            // 确保缩放值不会过小或过大
            const clampedScale = {
                x: Math.max(0.01, Math.min(100, scale.x)),
                y: Math.max(0.01, Math.min(100, scale.y)),
                z: Math.max(0.01, Math.min(100, scale.z))
            };
            this.selectedModel.scale.set(clampedScale.x, clampedScale.y, clampedScale.z);
            
            console.log(`模型缩放更新: ${clampedScale.x}, ${clampedScale.y}, ${clampedScale.z}`);
        }

        if (rotation) {
            this.selectedModel.rotation.set(
                THREE.MathUtils.degToRad(rotation.x),
                THREE.MathUtils.degToRad(rotation.y),
                THREE.MathUtils.degToRad(rotation.z)
            );
        }

        if (color !== null) {
            this.selectedModel.traverse((child) => {
                if (child.isMesh && child.material) {
                    child.material.color.setHex(color);
                }
            });
            this.selectedModel.userData.originalColor = color;
        }
    }

    // 删除选中的模型
    deleteSelectedModel() {
        if (!this.selectedModel) {
            console.warn('没有选中的模型');
            return false;
        }

        const modelToDelete = this.selectedModel;
        this.selectModel(null); // 取消选择
        
        // 从数组中移除
        const index = this.models.indexOf(modelToDelete);
        if (index > -1) {
            this.models.splice(index, 1);
        }
        
        // 从场景中移除
        this.sceneManager.removeFromScene(modelToDelete);
        
        console.log(`删除模型: ${modelToDelete.userData.name}`);
        
        // 更新UI
        if (window.webglEditor) {
            window.webglEditor.updateSceneInfo();
        }
        
        return true;
    }

    // 复制选中的模型
    duplicateSelectedModel() {
        if (!this.selectedModel) {
            console.warn('没有选中的模型');
            return null;
        }

        let duplicate;
        
        if (this.selectedModel.userData.type === 'primitive') {
            // 复制几何体
            duplicate = this.selectedModel.clone();
            duplicate.userData = { ...this.selectedModel.userData };
            duplicate.userData.id = this.generateModelId(this.selectedModel.userData.primitiveType);
            duplicate.userData.name = `${this.selectedModel.userData.name}_副本`;
            duplicate.userData.isSelected = false;
            
            // 稍微偏移位置
            duplicate.position.x += 2;
        } else {
            // 对于外部模型，创建引用副本
            duplicate = this.selectedModel.clone();
            duplicate.userData = { ...this.selectedModel.userData };
            duplicate.userData.id = this.generateModelId('duplicated');
            duplicate.userData.name = `${this.selectedModel.userData.name}_副本`;
            duplicate.userData.isSelected = false;
            
            // 稍微偏移位置
            duplicate.position.x += 2;
        }

        this.models.push(duplicate);
        this.sceneManager.addToScene(duplicate);
        
        console.log(`复制模型: ${duplicate.userData.name}`);
        
        // 自动选中新复制的模型
        this.selectModel(duplicate);
        
        return duplicate;
    }

    // 清除所有模型
    async clearAllModels() {
        for (const model of this.models) {
            this.sceneManager.removeFromScene(model);
        }
        
        this.models = [];
        this.selectedModel = null;
        
        console.log('已清除所有模型');
    }

    // 通过ID查找模型
    getModelById(id) {
        return this.models.find(model => model.userData.id === id);
    }

    // 通过名称查找模型
    getModelByName(name) {
        return this.models.find(model => model.userData.name === name);
    }

    // 获取所有模型
    getAllModels() {
        return this.models;
    }

    // 获取模型数量
    getModelCount() {
        return this.models.length;
    }

    // 获取选中的模型
    getSelectedModel() {
        return this.selectedModel;
    }

    // 更新模型材质
    updateModelMaterial(materialType, color, shininess = 30) {
        if (!this.selectedModel) {
            console.warn('没有选中的模型');
            return;
        }

        let material;
        
        switch (materialType) {
            case 'basic':
                material = new THREE.MeshBasicMaterial({ color: color });
                break;
                
            case 'lambert':
                material = new THREE.MeshLambertMaterial({ color: color });
                break;
                
            case 'phong':
                material = new THREE.MeshPhongMaterial({
                    color: color,
                    shininess: shininess,
                    specular: 0x111111
                });
                break;
                
            case 'standard':
                material = new THREE.MeshStandardMaterial({
                    color: color,
                    roughness: 0.5,
                    metalness: 0.5
                });
                break;
                
            default:
                console.warn('未知的材质类型:', materialType);
                return;
        }

        this.selectedModel.traverse((child) => {
            if (child.isMesh) {
                child.material = material.clone();
            }
        });

        console.log(`更新模型材质: ${materialType}, 颜色: ${color}`);
    }

    // 加载纹理
    async loadTexture(file) {
        if (!this.selectedModel) {
            console.warn('没有选中的模型');
            return;
        }

        try {
            const textureLoader = new THREE.TextureLoader();
            const texture = await textureLoader.loadAsync(URL.createObjectURL(file));
            
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            
            this.selectedModel.traverse((child) => {
                if (child.isMesh) {
                    child.material.map = texture;
                    child.material.needsUpdate = true;
                }
            });
            
            console.log(`加载纹理: ${file.name}`);
        } catch (error) {
            console.error('纹理加载失败:', error);
        }
    }

    // 加载法线贴图
    async loadNormalMap(file) {
        if (!this.selectedModel) {
            console.warn('没有选中的模型');
            return;
        }

        try {
            const textureLoader = new THREE.TextureLoader();
            const normalMap = await textureLoader.loadAsync(URL.createObjectURL(file));
            
            this.selectedModel.traverse((child) => {
                if (child.isMesh) {
                    child.material.normalMap = normalMap;
                    child.material.needsUpdate = true;
                }
            });
            
            console.log(`加载法线贴图: ${file.name}`);
        } catch (error) {
            console.error('法线贴图加载失败:', error);
        }
    }

    // 获取所有模型的数据（用于场景保存）
    getModelsData() {
        return this.models.map(model => {
            const data = {
                id: model.userData.id,
                name: model.userData.name,
                type: model.userData.type,
                position: {
                    x: model.position.x,
                    y: model.position.y,
                    z: model.position.z
                },
                scale: {
                    x: model.scale.x,
                    y: model.scale.y,
                    z: model.scale.z
                },
                rotation: {
                    x: THREE.MathUtils.radToDeg(model.rotation.x),
                    y: THREE.MathUtils.radToDeg(model.rotation.y),
                    z: THREE.MathUtils.radToDeg(model.rotation.z)
                }
            };

            // 如果是几何体，保存类型和颜色
            if (model.userData.type === 'primitive') {
                data.primitiveType = model.userData.primitiveType;
                data.color = model.userData.originalColor;
            }

            // 如果是外部模型，保存文件名
            if (model.userData.type === 'external') {
                data.fileName = model.userData.fileName;
            }

            return data;
        });
    }

    // 从数据加载模型
    async loadModelsFromData(modelsData, fileMappings = {}) {
        await this.clearAllModels();

        for (const modelData of modelsData) {
            try {
                if (modelData.type === 'primitive') {
                    await this.addPrimitive(modelData.primitiveType, {
                        position: modelData.position,
                        scale: modelData.scale,
                        rotation: modelData.rotation,
                        color: modelData.color,
                        name: modelData.name
                    });
                } else if (modelData.type === 'external') {
                    // 尝试自动加载外部模型
                    await this.loadExternalModelFromData(modelData, fileMappings);
                }
            } catch (error) {
                console.error(`加载模型 ${modelData.name} 失败:`, error);
            }
        }

        console.log('已从数据加载模型配置');
    }

    // 从数据加载外部模型
    async loadExternalModelFromData(modelData, fileMappings) {
        try {
            let filePath = null;
            
            // 从文件映射中获取文件路径
            if (fileMappings[modelData.id]) {
                const mapping = fileMappings[modelData.id];
                const expectedPath = mapping.originalPath + mapping.fileName;
                
                // 尝试从预期路径加载
                if (await this.checkFileExists(expectedPath)) {
                    filePath = expectedPath;
                }
            }
            
            // 如果没有找到文件，尝试从标准路径加载
            if (!filePath && modelData.fileName) {
                const standardPaths = [
                    `./model/${modelData.fileName}`,
                    `./models/${modelData.fileName}`,
                    `./assets/${modelData.fileName}`
                ];
                
                for (const path of standardPaths) {
                    if (await this.checkFileExists(path)) {
                        filePath = path;
                        break;
                    }
                }
            }
            
            if (filePath) {
                console.log(`自动加载模型: ${filePath}`);
                // 这里应该实际加载文件，但为了演示，我们创建一个占位符
                await this.createExternalModelPlaceholder(modelData, filePath);
            } else {
                console.warn(`无法找到模型文件: ${modelData.fileName}`);
                // 创建一个占位符几何体
                await this.createMissingModelPlaceholder(modelData);
            }
            
        } catch (error) {
            console.error(`加载外部模型失败:`, error);
            await this.createMissingModelPlaceholder(modelData);
        }
    }

    // 检查文件是否存在
    async checkFileExists(filePath) {
        try {
            const response = await fetch(filePath, { method: 'HEAD' });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    // 创建外部模型占位符
    async createExternalModelPlaceholder(modelData, filePath) {
        try {
            // 实际加载OBJ文件
            const loader = new THREE.OBJLoader();
            const model = await loader.loadAsync(filePath);

            // 配置模型属性
            model.position.set(modelData.position.x, modelData.position.y, modelData.position.z);
            model.scale.set(modelData.scale.x, modelData.scale.y, modelData.scale.z);
            model.rotation.set(
                THREE.MathUtils.degToRad(modelData.rotation.x),
                THREE.MathUtils.degToRad(modelData.rotation.y),
                THREE.MathUtils.degToRad(modelData.rotation.z)
            );

            // 设置用户数据
            model.userData = {
                id: this.generateModelId('external'),
                name: modelData.name,
                type: 'external',
                fileName: modelData.fileName,
                originalPath: filePath.substring(0, filePath.lastIndexOf('/') + 1)
            };

            this.models.push(model);
            this.sceneManager.addToScene(model);

        } catch (error) {
            console.error('加载OBJ模型失败，回退到占位符:', error);
            // 回退到原来的立方体占位符
            await this.addPrimitive('cube', {
                position: modelData.position,
                scale: modelData.scale,
                rotation: modelData.rotation,
                color: 0xcccccc,
                name: modelData.name
            });
        }
    }


    // 创建缺失模型占位符
    async createMissingModelPlaceholder(modelData) {
        await this.addPrimitive('cube', {
            position: modelData.position,
            scale: modelData.scale,
            rotation: modelData.rotation,
            color: 0xff0000,
            name: `${modelData.name} (缺失)`
        });
        
        const model = this.getModelByName(`${modelData.name} (缺失)`);
        if (model) {
            model.userData.type = 'external';
            model.userData.fileName = modelData.fileName;
            model.userData.isMissing = true;
        }
    }
}