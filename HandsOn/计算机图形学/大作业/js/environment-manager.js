// 环境管理器 - 处理天空盒和地面纹理
class EnvironmentManager {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.skybox = null;
        this.groundTexture = null;
        this.defaultSkyColor = 0x87ceeb;
        this.defaultGroundColor = 0x3a5f3a;
    }

    // 设置天空盒
    async setSkybox(imagePath = null) {
        try {
            if (imagePath) {
                // 加载天空盒纹理
                const textureLoader = new THREE.TextureLoader();
                const skyTexture = await textureLoader.loadAsync(imagePath);
                skyTexture.mapping = THREE.EquirectangularReflectionMapping;
                
                // 设置场景背景
                this.sceneManager.scene.background = skyTexture;
                this.sceneManager.scene.environment = skyTexture;
                
                console.log(`天空盒已设置: ${imagePath}`);
            } else {
                // 使用默认天空颜色
                this.sceneManager.scene.background = new THREE.Color(this.defaultSkyColor);
                this.sceneManager.scene.environment = null;
                
                console.log('使用默认天空颜色');
            }
            
            return true;
        } catch (error) {
            console.error('设置天空盒失败:', error);
            // 回退到默认颜色
            this.sceneManager.scene.background = new THREE.Color(this.defaultSkyColor);
            return false;
        }
    }

    // 设置地面纹理
    async setGroundTexture(imagePath = null) {
        try {
            const ground = this.sceneManager.scene.children.find(child => 
                child.isMesh && child.geometry instanceof THREE.PlaneGeometry
            );
            
            if (!ground) {
                console.warn('未找到地面对象');
                return false;
            }

            if (imagePath) {
                // 加载地面纹理
                const textureLoader = new THREE.TextureLoader();
                const groundTexture = await textureLoader.loadAsync(imagePath);
                
                // 配置纹理
                groundTexture.wrapS = THREE.RepeatWrapping;
                groundTexture.wrapT = THREE.RepeatWrapping;
                groundTexture.repeat.set(10, 10); // 重复10次
                
                // 创建新材质
                const groundMaterial = new THREE.MeshLambertMaterial({
                    map: groundTexture
                });
                
                ground.material = groundMaterial;
                ground.material.needsUpdate = true;
                
                console.log(`地面纹理已设置: ${imagePath}`);
            } else {
                // 使用默认地面材质
                const groundMaterial = new THREE.MeshLambertMaterial({
                    color: this.defaultGroundColor
                });
                
                ground.material = groundMaterial;
                ground.material.needsUpdate = true;
                
                console.log('使用默认地面颜色');
            }
            
            return true;
        } catch (error) {
            console.error('设置地面纹理失败:', error);
            return false;
        }
    }

    // 创建默认环境
    async createDefaultEnvironment() {
        try {
            // 设置默认天空
            await this.setSkybox('./textures/sky.jpeg');
            
            // 设置默认地面
            await this.setGroundTexture('./textures/ground.jpg');
            
            console.log('默认环境创建完成');
        } catch (error) {
            console.error('创建默认环境失败:', error);
            
            // 回退到基础环境
            this.sceneManager.scene.background = new THREE.Color(this.defaultSkyColor);
            
            const ground = this.sceneManager.scene.children.find(child => 
                child.isMesh && child.geometry instanceof THREE.PlaneGeometry
            );
            
            if (ground) {
                ground.material = new THREE.MeshLambertMaterial({
                    color: this.defaultGroundColor
                });
            }
        }
    }

    // 获取环境配置
    getEnvironmentConfig() {
        return {
            skyboxPath: this.skybox ? './textures/sky.jpeg' : null,
            groundTexturePath: this.groundTexture ? './textures/ground.jpg' : null,
            defaultSkyColor: this.defaultSkyColor,
            defaultGroundColor: this.defaultGroundColor
        };
    }

    // 从配置恢复环境
    async restoreFromConfig(config) {
        try {
            if (config.skyboxPath) {
                await this.setSkybox(config.skyboxPath);
            } else {
                this.sceneManager.scene.background = new THREE.Color(config.defaultSkyColor || this.defaultSkyColor);
            }
            
            if (config.groundTexturePath) {
                await this.setGroundTexture(config.groundTexturePath);
            } else {
                await this.setGroundTexture(null);
            }
            
            console.log('环境配置恢复完成');
        } catch (error) {
            console.error('恢复环境配置失败:', error);
        }
    }
}

// 导出环境管理器
window.EnvironmentManager = EnvironmentManager;