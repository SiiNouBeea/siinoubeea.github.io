// 光源管理器 - 处理所有光源的创建、配置和管理
class LightManager {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.ambientLights = [];
        this.directionalLights = [];
        this.pointLights = [];
        this.spotLights = [];
        this.areaLights = [];          // 新增面光源数组

        this.defaultAmbientIntensity = 0.3;
        this.defaultDirectionalIntensity = 1.0;
        this.defaultPointIntensity = 1.0;
        this.defaultAreaIntensity = 2.0;
    }

    // 添加环境光
    addAmbientLight(intensity = this.defaultAmbientIntensity, color = 0xffffff) {
        const ambientLight = new THREE.AmbientLight(color, intensity);
        ambientLight.userData = {
            type: 'ambient',
            id: this.generateLightId('ambient'),
            intensity: intensity,
            color: color
        };
        this.ambientLights.push(ambientLight);
        this.sceneManager.addToScene(ambientLight);
        console.log(`添加环境光: ${ambientLight.userData.id}, 强度: ${intensity}`);
        return ambientLight;
    }

    // 添加方向光
    addDirectionalLight(intensity = this.defaultDirectionalIntensity, color = 0xffffff, position = { x: 10, y: 10, z: 5 }) {
        const directionalLight = new THREE.DirectionalLight(color, intensity);
        directionalLight.position.set(position.x, position.y, position.z);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.1;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -20;
        directionalLight.shadow.camera.right = 20;
        directionalLight.shadow.camera.top = 20;
        directionalLight.shadow.camera.bottom = -20;
        directionalLight.userData = {
            type: 'directional',
            id: this.generateLightId('directional'),
            intensity: intensity,
            color: color,
            position: position
        };
        this.directionalLights.push(directionalLight);
        this.sceneManager.addToScene(directionalLight);
        const helper = new THREE.DirectionalLightHelper(directionalLight, 2);
        helper.userData = { lightId: directionalLight.userData.id, type: 'helper' };
        directionalLight.userData.helper = helper;
        this.sceneManager.addToScene(helper);
        console.log(`添加方向光: ${directionalLight.userData.id}, 强度: ${intensity}, 位置: (${position.x}, ${position.y}, ${position.z})`);
        return directionalLight;
    }

    // 添加点光源
    addPointLight(intensity = this.defaultPointIntensity, color = 0xffffff, position = { x: 0, y: 5, z: 0 }, distance = 0, decay = 2) {
        const pointLight = new THREE.PointLight(color, intensity, distance, decay);
        pointLight.position.set(position.x, position.y, position.z);
        pointLight.castShadow = true;
        pointLight.shadow.mapSize.width = 1024;
        pointLight.shadow.mapSize.height = 1024;
        pointLight.shadow.camera.near = 0.1;
        pointLight.shadow.camera.far = distance;
        pointLight.userData = {
            type: 'point',
            id: this.generateLightId('point'),
            intensity: intensity,
            color: color,
            position: position,
            distance: distance,
            decay: decay
        };
        this.pointLights.push(pointLight);
        this.sceneManager.addToScene(pointLight);
        const helper = new THREE.PointLightHelper(pointLight, 0.5);
        helper.userData = { lightId: pointLight.userData.id, type: 'helper' };
        pointLight.userData.helper = helper;
        this.sceneManager.addToScene(helper);
        console.log(`添加点光源: ${pointLight.userData.id}, 强度: ${intensity}, 位置: (${position.x}, ${position.y}, ${position.z})`);
        return pointLight;
    }

    // 添加聚光灯
    addSpotLight(intensity = 1.0, color = 0xffffff, position = { x: 0, y: 10, z: 0 }, target = { x: 0, y: 0, z: 0 }) {
        const spotLight = new THREE.SpotLight(color, intensity);
        spotLight.position.set(position.x, position.y, position.z);
        spotLight.target.position.set(target.x, target.y, target.z);
        spotLight.castShadow = true;
        spotLight.angle = Math.PI / 6;
        spotLight.penumbra = 0.1;
        spotLight.decay = 2;
        spotLight.distance = 30;
        spotLight.shadow.mapSize.width = 1024;
        spotLight.shadow.mapSize.height = 1024;
        spotLight.shadow.camera.near = 0.1;
        spotLight.shadow.camera.far = 30;
        spotLight.userData = {
            type: 'spot',
            id: this.generateLightId('spot'),
            intensity: intensity,
            color: color,
            position: position,
            target: target
        };
        this.spotLights.push(spotLight);
        this.sceneManager.addToScene(spotLight);
        this.sceneManager.addToScene(spotLight.target);
        const helper = new THREE.SpotLightHelper(spotLight);
        helper.userData = { lightId: spotLight.userData.id, type: 'helper' };
        spotLight.userData.helper = helper;
        this.sceneManager.addToScene(helper);
        console.log(`添加聚光灯: ${spotLight.userData.id}, 强度: ${intensity}`);
        return spotLight;
    }

    // ====================== 面光源 ======================
    addAreaLight(intensity = this.defaultAreaIntensity, color = 0xffffff, position = { x: 0, y: 5, z: 0 }, distance = 20) {
        // 1. 创建 RectAreaLight
        const areaLight = new THREE.RectAreaLight(color, intensity, distance, distance);
        areaLight.position.set(position.x, position.y, position.z);
        areaLight.lookAt(0, 0, 0); // 默认指向原点
        areaLight.userData = {
            type: 'area',
            id: this.generateLightId('area'),
            intensity: intensity,
            color: color,
            position: position,
            distance: distance
        };
        this.areaLights.push(areaLight);
        this.sceneManager.addToScene(areaLight);

        // 2. 辅助体：绿色线框矩形
        const helper = new THREE.RectAreaLightHelper(areaLight);
        helper.userData = { lightId: areaLight.userData.id, type: 'helper' };
        areaLight.userData.helper = helper;
        this.sceneManager.addToScene(helper);

        console.log(`添加面光源: ${areaLight.userData.id}, 强度: ${intensity}`);
        return areaLight;
    }

    removeAreaLight() {
        if (this.areaLights.length > 0) {
            const light = this.areaLights.pop();
            if (light.userData.helper) this.sceneManager.removeFromScene(light.userData.helper);
            this.sceneManager.removeFromScene(light);
            console.log(`移除面光源: ${light.userData.id}`);
            return true;
        }
        console.warn('没有可移除的面光源');
        return false;
    }
    // ====================================================

    removePointLight() {
        if (this.pointLights.length > 0) {
            const light = this.pointLights.pop();
            if (light.userData.helper) this.sceneManager.removeFromScene(light.userData.helper);
            this.sceneManager.removeFromScene(light);
            console.log(`移除点光源: ${light.userData.id}`);
            return true;
        }
        console.warn('没有可移除的点光源');
        return false;
    }

    removeDirectionalLight() {
        if (this.directionalLights.length > 0) {
            const light = this.directionalLights.pop();
            if (light.userData.helper) this.sceneManager.removeFromScene(light.userData.helper);
            this.sceneManager.removeFromScene(light);
            console.log(`移除方向光: ${light.userData.id}`);
            return true;
        }
        console.warn('没有可移除的方向光');
        return false;
    }

    removeSpotLight() {
        if (this.spotLights.length > 0) {
            const light = this.spotLights.pop();
            if (light.userData.helper) this.sceneManager.removeFromScene(light.userData.helper);
            this.sceneManager.removeFromScene(light.target);
            this.sceneManager.removeFromScene(light);
            console.log(`移除聚光灯: ${light.userData.id}`);
            return true;
        }
        console.warn('没有可移除的聚光灯');
        return false;
    }

    updateLightIntensity(lightType, index, intensity) {
        let lights;
        switch (lightType) {
            case 'ambient': lights = this.ambientLights; break;
            case 'directional': lights = this.directionalLights; break;
            case 'point': lights = this.pointLights; break;
            case 'spot': lights = this.spotLights; break;
            case 'area': lights = this.areaLights; break;
            default: console.error('未知的光源类型:', lightType); return;
        }
        if (index >= 0 && index < lights.length) {
            const light = lights[index];
            light.intensity = intensity;
            light.userData.intensity = intensity;
            console.log(`更新${lightType}光源强度: ${light.userData.id} -> ${intensity}`);
        }
    }

    updateLightColor(lightType, index, color) {
        let lights;
        switch (lightType) {
            case 'ambient': lights = this.ambientLights; break;
            case 'directional': lights = this.directionalLights; break;
            case 'point': lights = this.pointLights; break;
            case 'spot': lights = this.spotLights; break;
            case 'area': lights = this.areaLights; break;
            default: console.error('未知的光源类型:', lightType); return;
        }
        if (index >= 0 && index < lights.length) {
            const light = lights[index];
            light.color.setHex(color);
            light.userData.color = color;
            console.log(`更新${lightType}光源颜色: ${light.userData.id} -> ${color}`);
        }
    }

    async clearAllLights() {
        const allLights = [
            ...this.ambientLights,
            ...this.directionalLights,
            ...this.pointLights,
            ...this.spotLights,
            ...this.areaLights
        ];
        for (const light of allLights) {
            if (light.userData.helper) this.sceneManager.removeFromScene(light.userData.helper);
            if (light.target) this.sceneManager.removeFromScene(light.target);
            this.sceneManager.removeFromScene(light);
        }
        this.ambientLights = [];
        this.directionalLights = [];
        this.pointLights = [];
        this.spotLights = [];
        this.areaLights = [];
        console.log('已清除所有光源');
    }

    async resetToDefault() {
        await this.clearAllLights();
        this.addAmbientLight(this.defaultAmbientIntensity, 0xffffff);
        this.addDirectionalLight(this.defaultDirectionalIntensity, 0xffffff, { x: 10, y: 10, z: 5 });
        console.log('已重置为默认光源配置');
    }

    generateLightId(type) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 4);
        return `${type}_${timestamp}_${random}`;
    }

    getTotalLightCount() {
        return this.ambientLights.length + this.directionalLights.length + this.pointLights.length + this.spotLights.length + this.areaLights.length;
    }
    getPointLightCount() { return this.pointLights.length; }
    getDirectionalLightCount() { return this.directionalLights.length; }
    getSpotLightCount() { return this.spotLights.length; }
    getAreaLightCount() { return this.areaLights.length; }

    getLightsData() {
        return {
            ambientLights: this.ambientLights.map(light => ({
                intensity: light.userData.intensity,
                color: light.userData.color
            })),
            directionalLights: this.directionalLights.map(light => ({
                intensity: light.userData.intensity,
                color: light.userData.color,
                position: light.userData.position
            })),
            pointLights: this.pointLights.map(light => ({
                intensity: light.userData.intensity,
                color: light.userData.color,
                position: light.userData.position,
                distance: light.userData.distance,
                decay: light.userData.decay
            })),
            spotLights: this.spotLights.map(light => ({
                intensity: light.userData.intensity,
                color: light.userData.color,
                position: light.userData.position,
                target: light.userData.target
            })),
            areaLights: this.areaLights.map(light => ({
                intensity: light.userData.intensity,
                color: light.userData.color,
                position: light.userData.position,
                distance: light.userData.distance
            }))
        };
    }

    async loadLightsFromData(lightsData) {
        await this.clearAllLights();
        if (lightsData.ambientLights) {
            for (const lightData of lightsData.ambientLights) {
                this.addAmbientLight(lightData.intensity, lightData.color);
            }
        }
        if (lightsData.directionalLights) {
            for (const lightData of lightsData.directionalLights) {
                this.addDirectionalLight(lightData.intensity, lightData.color, lightData.position);
            }
        }
        if (lightsData.pointLights) {
            for (const lightData of lightsData.pointLights) {
                this.addPointLight(lightData.intensity, lightData.color, lightData.position, lightData.distance, lightData.decay);
            }
        }
        if (lightsData.spotLights) {
            for (const lightData of lightsData.spotLights) {
                this.addSpotLight(lightData.intensity, lightData.color, lightData.position, lightData.target);
            }
        }
        if (lightsData.areaLights) {
            for (const lightData of lightsData.areaLights) {
                this.addAreaLight(lightData.intensity, lightData.color, lightData.position, lightData.distance);
            }
        }
        console.log('已从数据加载光源配置');
    }

    updateLightHelpers() {
        const allLights = [
            ...this.directionalLights,
            ...this.pointLights,
            ...this.spotLights,
            ...this.areaLights
        ];
        for (const light of allLights) {
            if (light.userData.helper) light.userData.helper.update();
        }
    }

    toggleLightHelpers(show) {
        const allLights = [
            ...this.directionalLights,
            ...this.pointLights,
            ...this.spotLights,
            ...this.areaLights
        ];
        for (const light of allLights) {
            if (light.userData.helper) light.userData.helper.visible = show;
        }
    }
}