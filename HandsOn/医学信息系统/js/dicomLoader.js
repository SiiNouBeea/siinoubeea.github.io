// DICOM文件加载和管理模块
class DICOMLoader {
    constructor() {
        this.imageIds = [];
        this.currentImageIdIndex = 0;
        this.series = [];
        this.currentSeriesIndex = 0;

        // 配置Cornerstone
        this.configureCornerstone();
    }

    // 配置Cornerstone和图像加载器
    configureCornerstone() {
        try {
            // 配置WADO图像加载器
            cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
            cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

            // 配置Web图像加载器
            cornerstoneWebImageLoader.external.cornerstone = cornerstone;

            // 配置代码cs和编码方案 - 添加错误处理
            const config = {
                webWorkerPath: './node_modules/cornerstone-wado-image-loader/dist/cornerstoneWADOImageLoaderWebWorker.min.js',
                taskConfiguration: {
                    'decodeTask': {
                        codecsPath: './node_modules/cornerstone-wado-image-loader/dist/cornerstoneWADOImageLoaderCodecs.min.js'
                    }
                }
            };

            cornerstoneWADOImageLoader.webWorkerManager.initialize(config);
        } catch (error) {
            console.error('Cornerstone配置失败:', error);
        }
    }

    // 加载DICOM文件
    async loadFiles(files) {
        if (!files || files.length === 0) {
            throw new Error('没有选择任何文件');
        }

        this.imageIds = [];
        this.series = [];

        // 为每个文件创建图像ID
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);
            this.imageIds.push(imageId);
        }

        // 尝试根据DICOM信息对图像进行排序
        await this.sortImagesBySeries();

        // 加载第一个图像
        if (this.imageIds.length > 0) {
            await this.loadImage(0);
        }

        return this.series;
    }

    // 根据序列信息对图像进行排序
    async sortImagesBySeries() {
        const seriesMap = new Map();

        // 为每个图像ID加载元数据并提取序列信息
        for (let i = 0; i < this.imageIds.length; i++) {
            try {
                const imageId = this.imageIds[i];
                const image = await cornerstone.loadImage(imageId);

                // 提取序列和实例信息
                let seriesInstanceUID, instanceNumber, seriesNumber;

                try {
                    // 使用cornerstone.metadata获取DICOM信息
                    const generalSeriesModule = cornerstone.metaData.get('generalSeriesModule', imageId) || {};
                    seriesInstanceUID = generalSeriesModule.seriesInstanceUID || `series-${i}`;
                    instanceNumber = generalSeriesModule.instanceNumber || i;
                    seriesNumber = generalSeriesModule.seriesNumber || 0;
                } catch (ex) {
                    console.warn('无法提取DICOM标签:', ex);
                    seriesInstanceUID = `default-series-${i}`;
                    instanceNumber = i;
                    seriesNumber = 0;
                }

                if (!seriesInstanceUID) {
                    // 如果没有序列信息，将所有图像放在一个序列中
                    const defaultSeries = 'default-series';
                    if (!seriesMap.has(defaultSeries)) {
                        seriesMap.set(defaultSeries, {
                            seriesInstanceUID: defaultSeries,
                            seriesNumber: 1,
                            images: []
                        });
                    }

                    seriesMap.get(defaultSeries).images.push({
                        imageId,
                        instanceNumber: i,
                        position: i
                    });
                } else {
                    // 根据序列实例UID分组
                    if (!seriesMap.has(seriesInstanceUID)) {
                        seriesMap.set(seriesInstanceUID, {
                            seriesInstanceUID,
                            seriesNumber: seriesNumber || 0,
                            images: []
                        });
                    }

                    seriesMap.get(seriesInstanceUID).images.push({
                        imageId,
                        instanceNumber: instanceNumber || i,
                        position: i
                    });
                }
            } catch (error) {
                console.error(`加载图像 ${this.imageIds[i]} 的元数据失败:`, error);
                // 如果无法加载元数据，将所有图像放在一个序列中
                const defaultSeries = 'default-series';
                if (!seriesMap.has(defaultSeries)) {
                    seriesMap.set(defaultSeries, {
                        seriesInstanceUID: defaultSeries,
                        seriesNumber: 1,
                        images: []
                    });
                }

                seriesMap.get(defaultSeries).images.push({
                    imageId: this.imageIds[i],
                    instanceNumber: i,
                    position: i
                });
            }
        }

        // 对每个序列中的图像按实例编号排序
        for (const series of seriesMap.values()) {
            series.images.sort((a, b) => {
                // 确保实例号比较正确处理
                const aNum = typeof a.instanceNumber === 'number' ? a.instanceNumber : parseInt(a.instanceNumber) || 0;
                const bNum = typeof b.instanceNumber === 'number' ? b.instanceNumber : parseInt(b.instanceNumber) || 0;
                return aNum - bNum;
            });
        }

        // 将序列转换为数组
        this.series = Array.from(seriesMap.values());

        // 选择第一个序列
        if (this.series.length > 0) {
            this.currentSeriesIndex = 0;
            this.imageIds = this.series[0].images.map(img => img.imageId);
        }

        return this.series;
    }

    // 加载指定索引的图像
    async loadImage(imageIndex) {
        if (imageIndex < 0 || imageIndex >= this.imageIds.length) {
            throw new Error('图像索引超出范围');
        }

        this.currentImageIdIndex = imageIndex;
        const imageId = this.imageIds[imageIndex];

        try {
            const image = await cornerstone.loadImage(imageId);
            return image;
        } catch (error) {
            console.error('加载图像失败:', error);
            throw error;
        }
    }

    // 切换到下一个图像
    async nextImage() {
        if (this.currentImageIdIndex < this.imageIds.length - 1) {
            return await this.loadImage(this.currentImageIdIndex + 1);
        }
        return null;
    }

    // 切换到上一个图像
    async previousImage() {
        if (this.currentImageIdIndex > 0) {
            return await this.loadImage(this.currentImageIdIndex - 1);
        }
        return null;
    }

    // 切换到指定序列
    async switchSeries(seriesIndex) {
        if (seriesIndex < 0 || seriesIndex >= this.series.length) {
            throw new Error('序列索引超出范围');
        }

        this.currentSeriesIndex = seriesIndex;
        this.imageIds = this.series[seriesIndex].images.map(img => img.imageId);
        this.currentImageIdIndex = 0;

        return await this.loadImage(0);
    }

    // 获取当前图像信息
    getCurrentImageInfo() {
        if (this.imageIds.length === 0) {
            return null;
        }

        return {
            seriesIndex: this.currentSeriesIndex,
            imageIndex: this.currentImageIdIndex,
            totalImages: this.imageIds.length,
            seriesCount: this.series.length,
            currentSeries: this.series[this.currentSeriesIndex]
        };
    }

    // 获取所有序列信息
    getAllSeries() {
        return this.series;
    }
}