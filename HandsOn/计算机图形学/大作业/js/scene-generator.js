// 场景生成器 - 创建初始情感主题场景
class SceneGenerator {
    constructor(editor) {
        this.editor = editor;
        this.treeSeed = Date.now(); // 随机种子
    }

    // 生成完整的初始场景
    async generateInitialScene() {
        try {
            this.editor.uiManager.showLoading('正在生成初始场景...');
            
            // 清空当前场景
            await this.editor.clearScene();

            // 添加环境
            if (this.editor.environmentManager) {
                await this.editor.environmentManager.createDefaultEnvironment();
            }
            
            // 1. 添加基础光源
            this.setupLighting();
            
            // 2. 加载中心模型
            await this.loadCenterModels();
            
            // 3. 生成环境树木
            await this.generateTrees();
            
            // 4. 设置相机位置
            this.setupCamera();
            
            this.editor.uiManager.hideLoading();
            this.editor.uiManager.showNotification('初始场景生成完成', 'success');
            
        } catch (error) {
            console.error('生成初始场景失败:', error);
            this.editor.uiManager.hideLoading();
            this.editor.uiManager.showNotification('场景生成失败: ' + error.message, 'error');
        }
    }

    // 设置场景光照
    setupLighting() {
        // 主光源 - 模拟自然光
        this.editor.lightManager.addDirectionalLight(0.9, 0xffffff, { x: 250, y: 60, z: 100 });
        
        // 环境光
        this.editor.lightManager.addAmbientLight(0.2, 0xffffff);
        
        // 温暖的点光源 - 营造家庭氛围
        this.editor.lightManager.addPointLight(2, 0xfff8dc, { x: 0, y: 3, z: 0 }, 0, 2);
        
        // 冷色调补光
        this.editor.lightManager.addPointLight(0.6, 0x87ceeb, { x: -28, y: 5, z: -8 }, 0, 200);
    }

    // 加载中心模型
    async loadCenterModels() {
        try {
            // 1. 加载圆形台子 (family.obj) - 20倍大小，y=-2
            await this.loadOBJModel('./model/family.obj', {
                position: { x: 0, y: -2, z: 0 },
                scale: { x: 10, y: 10, z: 10 },
                name: 'family_base'
            });
            
            // 2. 加载全家福模型 (全家福.obj) - 12倍大小，指定位置
            await this.loadOBJModel('./model/全家福.obj', {
                position: { x: 2.35, y: -1.48, z: 0 },
                scale: { x: 6, y: 6, z: 6 },
                name: 'family_portrait'
            });
            
            // 设置选中全家福模型
            const portraitModel = this.editor.modelManager.getModelByName('family_portrait');
            if (portraitModel) {
                this.editor.modelManager.selectModel(portraitModel);
            }
            
        } catch (error) {
            console.error('加载中心模型失败:', error);
            throw error;
        }
    }

    // 加载OBJ模型
    async loadOBJModel(filePath, options = {}) {
        try {
            const loader = new THREE.OBJLoader();
            const model = await loader.loadAsync(filePath);
            
            // 配置模型
            if (options.position) {
                model.position.set(options.position.x, options.position.y, options.position.z);
            }
            if (options.scale) {
                model.scale.set(options.scale.x, options.scale.y, options.scale.z);
            }
            if (options.rotation) {
                model.rotation.set(
                    THREE.MathUtils.degToRad(options.rotation.x || 0),
                    THREE.MathUtils.degToRad(options.rotation.y || 0),
                    THREE.MathUtils.degToRad(options.rotation.z || 0)
                );
            }

            // 配置阴影
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // 设置用户数据
            const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
            model.userData = {
                id: this.editor.modelManager.generateModelId('external'),
                name: options.name || fileName.replace(/\.[^/.]+$/, ""),
                type: 'external',
                fileName: fileName,
                originalPath: filePath.substring(0, filePath.lastIndexOf('/') + 1)
            };

            this.editor.modelManager.models.push(model);
            this.editor.sceneManager.addToScene(model);
            
            console.log(`加载OBJ模型: ${filePath}`);
            return model;
            
        } catch (error) {
            console.error(`加载OBJ模型失败: ${filePath}`, error);
            
            // 创建占位符
            return await this.createOBJPlaceholder(filePath, options);
        }
    }

    // 创建OBJ模型占位符
    async createOBJPlaceholder(filePath, options) {
        const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
        const modelName = options.name || fileName.replace(/\.[^/.]+$/, "");
        
        await this.editor.modelManager.addPrimitive('cube', {
            position: options.position || { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            color: 0xff6b6b,
            name: `${modelName} (占位符)`
        });
        
        const placeholder = this.editor.modelManager.getModelByName(`${modelName} (占位符)`);
        if (placeholder) {
            placeholder.userData.type = 'external';
            placeholder.userData.fileName = fileName;
            placeholder.userData.originalPath = filePath.substring(0, filePath.lastIndexOf('/') + 1);
            placeholder.userData.isPlaceholder = true;
            placeholder.userData.originalFilePath = filePath;
        }
        
        return placeholder;
    }

    // 生成环境树木
    async generateTrees() {
        const treeCount = 500;
        const radiusMin = 10;  // 最小半径
        const radiusMax = 80;  // 最大半径
        
        console.log(`开始生成 ${treeCount} 棵树木...`);
        
        for (let i = 0; i < treeCount; i++) {
            try {
                // 使用随机种子确保可重复性
                const random = this.seededRandom(i);
                
                // 生成极坐标位置
                const angle = random * Math.PI * 2;
                const radius = radiusMin + (radiusMax - radiusMin) * this.seededRandom(i + 1000);
                
                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;
                
                // 固定Y位置为-2
                const y = -2;
                
                // 随机缩放 - 10-25倍
                const scale =5 + (radius-9)*this.seededRandom(i + 3000)/5 + this.seededRandom(i + 3000) * 8;
                
                // 随机旋转
                const rotationY = this.seededRandom(i + 4000) * Math.PI * 2;
                
                // 随机颜色变化（绿色系）
                const greenVariation = Math.floor(this.seededRandom(i + 5000) * 50);
                const color = 0x228b22 + (greenVariation << 8);
                
                // 尝试加载tree.obj，如果失败则使用圆锥体
                try {
                    const treeScale = scale * 0.5; // 调整树的大小
                    await this.loadOBJModel('./model/tree.obj', {
                        position: { x, y, z },
                        scale: { x: treeScale, y: treeScale, z: treeScale },
                        rotation: { x: 0, y: THREE.MathUtils.radToDeg(rotationY), z: 0 },
                        name: `tree_${i}`
                    });
                } catch (error) {
                    // 如果tree.obj加载失败，使用圆锥体
                    await this.editor.modelManager.addPrimitive('cone', {
                        position: { x, y, z },
                        scale: { x: scale, y: scale * 2, z: scale },
                        rotation: { x: 0, y: THREE.MathUtils.radToDeg(rotationY), z: 0 },
                        color: color,
                        name: `tree_${i}`
                    });
                }
                
                // 每100棵树更新一次进度
                if (i % 100 === 0) {
                    this.editor.uiManager.showLoading(`正在生成树木... ${i}/${treeCount}`);
                }
                
            } catch (error) {
                console.error(`生成第 ${i} 棵树失败:`, error);
            }
        }
        
        console.log('树木生成完成');
    }

    // 基于种子的随机数生成器
    seededRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    // 设置相机初始位置
    setupCamera() {
        // 设置相机位置，俯瞰整个场景
        this.editor.cameraManager.switchMode('orbit');
        this.editor.sceneManager.camera.position.set(11, 4, 3);
        this.editor.sceneManager.controls.target.set(0, 0, 0);
    }

    // 获取场景信息
    getSceneInfo() {
        return {
            treeCount: 1500,
            treeSeed: this.treeSeed,
            centerRadius: { min: 10, max: 50 },
            models: this.editor.modelManager.getModelCount(),
            lights: this.editor.lightManager.getTotalLightCount()
        };
    }

    // 保存场景配置
    getSceneConfig() {
        return {
            version: '1.0',
            type: 'initial_scene',
            treeSeed: this.treeSeed,
            treeCount: 1500,
            treeDistribution: {
                minRadius: 10,
                maxRadius: 50,
                minScale: 0.5,
                maxScale: 2.0
            },
            lighting: {
                ambientIntensity: 0.4,
                directionalIntensity: 1.2,
                warmLightIntensity: 0.8,
                coolLightIntensity: 0.6
            },
            camera: {
                mode: 'orbit',
                position: { x: 15, y: 5, z: -5 },
                target: { x: 0, y: 0, z: 0 }
            }
        };
    }

    // 从配置恢复场景
    async restoreFromConfig(config) {
        if (config.treeSeed) {
            this.treeSeed = config.treeSeed;
        }
        
        await this.generateInitialScene();
    }
}

// 导出场景生成器
window.SceneGenerator = SceneGenerator;