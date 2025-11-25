// 模型加载器
class ModelLoader {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.objLoader = new THREE.OBJLoader();
        this.loadingManager = new THREE.LoadingManager();

        // 设置加载管理器回调
        this.loadingManager.onStart = (url, itemsLoaded, itemsTotal) => {
            console.log(`开始加载: ${url} (${itemsLoaded}/${itemsTotal})`);
        };

        this.loadingManager.onLoad = () => {
            console.log('所有资源加载完成');
        };

        this.loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
            console.log(`加载进度: ${url} (${itemsLoaded}/${itemsTotal})`);
        };

        this.loadingManager.onError = (url) => {
            console.error(`加载失败: ${url}`);
        };

        // 更新加载器使用加载管理器
        this.objLoader.manager = this.loadingManager;
    }

    // 加载模型
    async loadModel(url, name = 'Model') {
        return new Promise((resolve, reject) => {
            this.objLoader.load(
                url,
                (object) => {
                    try {
                        // 处理加载的模型
                        const processedModel = this.processModel(object, name);

                        // 添加到场景
                        const model = this.sceneManager.addModel(processedModel, name);

                        resolve(model);
                    } catch (error) {
                        reject(new Error(`处理模型时出错: ${error.message}`));
                    }
                },
                (progress) => {
                    // 加载进度回调
                    const percent = (progress.loaded / progress.total) * 100;
                    console.log(`模型加载进度: ${percent.toFixed(2)}%`);
                },
                (error) => {
                    reject(new Error(`加载模型失败: ${error.message}`));
                }
            );
        });
    }

    // 从文件加载模型
    async loadModelFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (event) => {
                try {
                    const modelData = event.target.result;
                    const name = file.name.replace(/\.[^/.]+$/, ""); // 移除文件扩展名

                    // 使用OBJLoader解析数据
                    const object = this.objLoader.parse(modelData);

                    // 处理模型
                    const processedModel = this.processModel(object, name);

                    // 添加到场景
                    const model = this.sceneManager.addModel(processedModel, name);

                    resolve(model);
                } catch (error) {
                    reject(new Error(`解析模型文件失败: ${error.message}`));
                }
            };

            reader.onerror = () => {
                reject(new Error('读取文件失败'));
            };

            reader.readAsText(file);
        });
    }

    // 处理加载的模型
    processModel(object, name) {
        // 确保模型有合适的材质
        object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                if (!child.material || child.material.length === 0) {
                    // 创建默认材质
                    const hue = Math.random();
                    const color = new THREE.Color().setHSL(hue, 0.7, 0.6);

                    child.material = new THREE.MeshPhongMaterial({
                        color: color,
                        shininess: 30,
                        specular: 0x222222
                    });
                } else if (Array.isArray(child.material)) {
                    // 处理材质数组
                    child.material = child.material.map(mat => {
                        if (mat instanceof THREE.MeshPhongMaterial ||
                            mat instanceof THREE.MeshLambertMaterial) {
                            return mat;
                        } else {
                            const hue = Math.random();
                            const color = new THREE.Color().setHSL(hue, 0.7, 0.6);
                            return new THREE.MeshPhongMaterial({
                                color: color,
                                shininess: 30,
                                specular: 0x222222
                            });
                        }
                    });
                } else if (!(child.material instanceof THREE.MeshPhongMaterial) &&
                          !(child.material instanceof THREE.MeshLambertMaterial)) {
                    // 转换非Phong/Lambert材质
                    const hue = Math.random();
                    const color = new THREE.Color().setHSL(hue, 0.7, 0.6);

                    child.material = new THREE.MeshPhongMaterial({
                        color: color,
                        shininess: 30,
                        specular: 0x222222
                    });
                }

                // 启用阴影
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // 计算边界框并居中模型
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // 调整模型位置使其居中
        object.position.x -= center.x;
        object.position.y -= center.y;
        object.position.z -= center.z;

        // 根据模型大小调整缩放
        const maxSize = Math.max(size.x, size.y, size.z);
        if (maxSize > 0) {
            const targetSize = 5; // 目标大小
            object.scale.multiplyScalar(targetSize / maxSize);
        }

        console.log(`处理模型完成: ${name}, 尺寸: ${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)}`);

        return object;
    }

    // 批量加载模型文件
    async loadModelFiles(files) {
        const results = {
            success: [],
            failed: []
        };

        for (const file of files) {
            try {
                const model = await this.loadModelFromFile(file);
                results.success.push({
                    file: file.name,
                    model: model
                });
            } catch (error) {
                results.failed.push({
                    file: file.name,
                    error: error.message
                });
            }
        }

        return results;
    }
}