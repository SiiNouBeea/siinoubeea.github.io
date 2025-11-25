// 主应用程序
class DICOMViewer {
    constructor() {
        this.element = null;
        this.dicomLoader = null;
        this.tools = null;
        this.currentImage = null;
        this.isPlaying = false;
        this.playInterval = null;
        this.imageIds = [];
        this.currentImageIdIndex = 0;

        this.init();
    }

    // 初始化应用程序
    async init() {
        // 等待DOM加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    // 配置Cornerstone
    configureCornerstone() {
        try {
            // 配置WADO图像加载器
            cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
            cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

            // 配置Web图像加载器
            cornerstoneWebImageLoader.external.cornerstone = cornerstone;

            // 配置代码cs和编码方案 - 使用简化配置
            const config = {
                webWorkerPath: './node_modules/cornerstone-wado-image-loader/dist/cornerstoneWADOImageLoaderWebWorker.min.js',
                taskConfiguration: {
                    'decodeTask': {
                        codecsPath: './node_modules/cornerstone-wado-image-loader/dist/cornerstoneWADOImageLoaderCodecs.min.js'
                    }
                }
            };

            // 初始化Web Worker管理器
            cornerstoneWADOImageLoader.webWorkerManager.initialize(config);

            console.log('Cornerstone配置完成');
        } catch (error) {
            console.error('Cornerstone配置失败:', error);
            // 如果Web Worker初始化失败，尝试使用非Web Worker模式
            try {
                cornerstoneWADOImageLoader.webWorkerManager.initialize({
                    maxWebWorkers: 0 // 禁用Web Workers
                });
                console.log('使用非Web Worker模式');
            } catch (fallbackError) {
                console.error('非Web Worker模式也失败:', fallbackError);
            }
        }
    }

    // 设置应用程序
    setup() {
        console.log('开始设置应用程序...');

        // 确保DOM元素存在
        this.element = document.getElementById('dicomImage');
        if (!this.element) {
            console.error('无法找到 dicomImage 元素');
            return;
        }

        // 配置Cornerstone
        this.configureCornerstone();

        // 启用Cornerstone元素
        try {
            cornerstone.enable(this.element);
            console.log('Cornerstone元素已启用');

        } catch (error) {
            console.error('启用Cornerstone元素失败:', error);
        }

        // 初始化DICOM加载器
        this.dicomLoader = new DICOMLoader();

        // 初始化工具
        try {
            this.tools = new DICOMTools(this.element);
            console.log('工具初始化完成');
        } catch (error) {
            console.error('工具初始化失败:', error);
        }

        // 设置事件监听器
        this.setupEventListeners();

        // 更新UI状态
        this.updateUI();

        console.log('应用程序设置完成');
    }


    // 设置事件监听器
    setupEventListeners() {
        console.log('设置事件监听器...');

        // 文件上传
        const fileInput = document.getElementById('fileInput');
        const uploadArea = document.getElementById('uploadArea');

        if (uploadArea) {
            uploadArea.addEventListener('click', () => {
                if (fileInput) fileInput.click();
            });

            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = '#6c9bcf';
            });

            uploadArea.addEventListener('dragleave', () => {
                uploadArea.style.borderColor = '#3a3a52';
            });

            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = '#3a3a52';

                if (e.dataTransfer.files.length) {
                    this.loadDICOMFiles(e.dataTransfer.files);
                }
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length) {
                    this.loadDICOMFiles(e.target.files);
                }
            });
        }

        // 工具栏按钮
        document.querySelectorAll('.toolbar .tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tool = e.currentTarget.getAttribute('data-tool');

                // 更新按钮状态
                document.querySelectorAll('.toolbar .tool-btn[data-tool]').forEach(b => {
                    b.classList.remove('active');
                });
                e.currentTarget.classList.add('active');

                // 设置活动工具
                if (this.tools) {
                    this.tools.setActiveTool(tool);
                }
            });
        });

        // 测量工具按钮
        document.querySelectorAll('#measure-tab .tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tool = e.currentTarget.getAttribute('data-tool');

                // 更新按钮状态
                document.querySelectorAll('#measure-tab .tool-btn[data-tool]').forEach(b => {
                    b.classList.remove('active');
                });
                e.currentTarget.classList.add('active');

                // 设置活动工具
                if (this.tools) {
                    this.tools.setActiveTool(tool);
                }
            });
        });

        // 标记工具按钮
        document.querySelectorAll('#annotate-tab .tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tool = e.currentTarget.getAttribute('data-tool');

                // 更新按钮状态
                document.querySelectorAll('#annotate-tab .tool-btn[data-tool]').forEach(b => {
                    b.classList.remove('active');
                });
                e.currentTarget.classList.add('active');

                // 设置活动工具
                if (this.tools) {
                    this.tools.setActiveTool(tool);
                }
            });
        });

        // 标签切换
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.getAttribute('data-tab');

                // 移除所有活动标签
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

                // 激活当前标签
                tab.classList.add('active');
                const tabContent = document.getElementById(`${tabId}-tab`);
                if (tabContent) {
                    tabContent.classList.add('active');
                }
            });
        });

        // 控制按钮
        const buttonMap = {
            'resetViewBtn': () => this.resetView(),
            'invertBtn': () => this.invertImage(),
            'clearMeasurementsBtn': () => { if (this.tools) this.tools.clearAllMeasurements(); },
            'clearAnnotationsBtn': () => { if (this.tools) this.tools.clearAllAnnotations(); },
            'render3dBtn': () => this.render3D(),
            'prevSliceBtn': () => this.previousSlice(),
            'nextSliceBtn': () => this.nextSlice(),
            'playSequenceBtn': () => this.togglePlaySequence(),
            'rotateBtn': () => this.rotateImage(),
            'exportReportBtn': () => this.exportReport(),
            'saveImageBtn': () => this.saveImage()
        };

        Object.keys(buttonMap).forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.addEventListener('click', buttonMap[buttonId]);
            }
        });

        // 滑块控制
        const sliderMap = {
            'windowWidthSlider': (e) => this.adjustWindowWidth(e.target.value),
            'windowLevelSlider': (e) => this.adjustWindowLevel(e.target.value),
            'zoomSlider': (e) => this.adjustZoom(e.target.value),
            'sliceSlider': (e) => this.gotoSlice(parseInt(e.target.value)),
            'opacitySlider': (e) => this.adjustOpacity(e.target.value),
            'brightnessSlider': (e) => this.adjustBrightness(e.target.value)
        };

        Object.keys(sliderMap).forEach(sliderId => {
            const slider = document.getElementById(sliderId);
            if (slider) {
                slider.addEventListener('input', sliderMap[sliderId]);
            }
        });

        // 鼠标移动事件 - 更新位置信息
        if (this.element) {
            this.element.addEventListener('mousemove', (e) => {
                this.updatePositionInfo(e);
            });
        }

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            this.handleKeyboard(e);
        });

        console.log('事件监听器设置完成');
    }

    // 加载DICOM文件
    async loadDICOMFiles(files) {
        try {
            console.log('开始加载DICOM文件...', files);

            // 显示加载状态
            const uploadArea = document.getElementById('uploadArea');
            if (uploadArea) {
                uploadArea.innerHTML = `
                    <div class="upload-icon">⏳</div>
                    <p>正在加载 ${files.length} 个文件...</p>
                `;
            }

            // 清空当前图像
            this.imageIds = [];
            this.currentImageIdIndex = 0;

            // 为每个文件创建图像ID - 使用WADO Image Loader的文件管理器
            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                // 使用WADO Image Loader的文件管理器创建imageId
                // 这会生成一个可以被Cornerstone识别的imageId
                const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);
                this.imageIds.push(imageId);
            }

            console.log('创建了图像ID:', this.imageIds);

            // 加载第一个图像
            if (this.imageIds.length > 0) {
                await this.loadImage(0);
            }

            // 重置文件上传区域
            if (uploadArea) {
                uploadArea.innerHTML = `
                    <div class="upload-icon">📁</div>
                    <p>点击或拖拽DICOM文件到此处</p>
                    <p class="file-upload-hint">支持单文件或文件夹上传</p>
                `;
            }

            // 显示成功消息
            this.showMessage(`成功加载 ${files.length} 个DICOM文件`, 'success');

        } catch (error) {
            console.error('加载DICOM文件失败:', error);

            // 重置文件上传区域
            const uploadArea = document.getElementById('uploadArea');
            if (uploadArea) {
                uploadArea.innerHTML = `
                    <div class="upload-icon">📁</div>
                    <p>点击或拖拽DICOM文件到此处</p>
                    <p class="file-upload-hint">支持单文件或文件夹上传</p>
                `;
            }

            this.showMessage(`加载DICOM文件失败: ${error.message}`, 'error');
        }
    }

    // 加载指定索引的图像
    async loadImage(imageIndex) {
        if (imageIndex < 0 || imageIndex >= this.imageIds.length) {
            throw new Error('图像索引超出范围');
        }

        this.currentImageIdIndex = imageIndex;
        const imageId = this.imageIds[imageIndex];

        try {
            console.log('开始加载图像:', imageId);

            // 确保元素已启用
            if (!cornerstone.getEnabledElement(this.element)) {
                cornerstone.enable(this.element);
            }

            const image = await cornerstone.loadImage(imageId);
            console.log('图像加载完成:', image);

            await cornerstone.displayImage(this.element, image);
            console.log('图像显示完成');

            // 保存当前图像引用
            this.currentImage = image;

            // 更新UI
            this.updateUI();
            this.updateImageInfo(image);
            this.updateSliceSlider();

            return image;
        } catch (error) {
            console.error('加载图像失败:', error);
            throw error;
        }
    }

    // 更新UI状态
    updateUI() {
        // 更新切片信息
        const sliceInfo = document.getElementById('sliceInfo');
        const sliceCounter = document.getElementById('sliceCounter');
        const currentSeries = document.getElementById('currentSeries');
        const imageWidth = document.getElementById('imageWidth');
        const imageHeight = document.getElementById('imageHeight');
        const imageSize = document.getElementById('imageSize');

        if (this.imageIds.length > 0) {
            if (sliceInfo) {
                sliceInfo.textContent = `${this.currentImageIdIndex + 1}/${this.imageIds.length}`;
            }
            if (sliceCounter) {
                sliceCounter.textContent = `切片 ${this.currentImageIdIndex + 1}/${this.imageIds.length}`;
            }
            if (currentSeries) {
                currentSeries.textContent = `序列 1/1`;
            }

            // 更新图像尺寸
            if (this.currentImage) {
                if (imageWidth) {
                    imageWidth.textContent = this.currentImage.width;
                }
                if (imageHeight) {
                    imageHeight.textContent = this.currentImage.height;
                }
                if (imageSize) {
                    imageSize.textContent = `图像大小: ${this.currentImage.width} × ${this.currentImage.height}`;
                }
            }
        } else {
            // 没有图像时的默认状态
            if (sliceInfo) sliceInfo.textContent = '0/0';
            if (sliceCounter) sliceCounter.textContent = '切片 0/0';
            if (currentSeries) currentSeries.textContent = '-';
            if (imageWidth) imageWidth.textContent = '-';
            if (imageHeight) imageHeight.textContent = '-';
            if (imageSize) imageSize.textContent = '图像大小: - × -';
        }
    }

    // 更新图像信息
    updateImageInfo(image) {
        const infoGrid = document.getElementById('imageInfo');
        if (!infoGrid) return;

        infoGrid.innerHTML = '';

        if (!image) {
            infoGrid.innerHTML = '<div class="empty-message">无图像信息</div>';
            return;
        }

        // 添加一些基本的图像信息
        const infoItems = [
            { name: '图像尺寸', value: `${image.width} × ${image.height}` },
            { name: '切片位置', value: `${this.currentImageIdIndex + 1}/${this.imageIds.length}` },
            { name: '颜色模式', value: image.color ? '彩色' : '灰度' }
        ];

        // 尝试获取DICOM信息
        try {
            const imageId = this.imageIds[this.currentImageIdIndex];

            // 使用cornerstone.metadata获取DICOM信息
            const generalSeriesModule = cornerstone.metaData.get('generalSeriesModule', imageId) || {};
            const patientModule = cornerstone.metaData.get('patientModule', imageId) || {};
            const generalStudyModule = cornerstone.metaData.get('generalStudyModule', imageId) || {};
            const generalImageModule = cornerstone.metaData.get('generalImageModule', imageId) || {};

            // 添加DICOM信息
            if (patientModule.patientName) infoItems.push({ name: '患者姓名', value: patientModule.patientName });
            if (patientModule.patientId) infoItems.push({ name: '患者ID', value: patientModule.patientId });
            if (patientModule.patientBirthDate) infoItems.push({ name: '出生日期', value: patientModule.patientBirthDate });
            if (patientModule.patientSex) infoItems.push({ name: '性别', value: patientModule.patientSex });
            if (generalStudyModule.studyDate) infoItems.push({ name: '检查日期', value: generalStudyModule.studyDate });
            if (generalStudyModule.modality) infoItems.push({ name: '模态', value: generalStudyModule.modality });
            if (generalSeriesModule.seriesNumber) infoItems.push({ name: '序列号', value: generalSeriesModule.seriesNumber });
            if (generalImageModule.instanceNumber) infoItems.push({ name: '实例号', value: generalImageModule.instanceNumber });

        } catch (error) {
            console.warn('无法读取DICOM信息:', error);
        }

        infoItems.forEach(item => {
            const div = document.createElement('div');
            div.className = 'info-item-grid';
            div.innerHTML = `
                <span class="info-label-grid">${item.name}</span>
                <span class="info-value-grid">${item.value}</span>
            `;
            infoGrid.appendChild(div);
        });

        // 如果没有提取到任何信息，显示默认消息
        if (infoGrid.children.length === 0) {
            infoGrid.innerHTML = '<div class="empty-message">无法读取DICOM信息</div>';
        }
    }

    // 更新切片滑块
    updateSliceSlider() {
        const sliceSlider = document.getElementById('sliceSlider');
        const sliceValue = document.getElementById('sliceValue');

        if (sliceSlider && sliceValue) {
            if (this.imageIds.length > 0) {
                sliceSlider.min = 0;
                sliceSlider.max = this.imageIds.length - 1;
                sliceSlider.value = this.currentImageIdIndex;
                sliceValue.textContent = `${this.currentImageIdIndex + 1}/${this.imageIds.length}`;
            } else {
                sliceSlider.min = 0;
                sliceSlider.max = 0;
                sliceSlider.value = 0;
                sliceValue.textContent = '0/0';
            }
        }
    }

    // 调整窗宽
    adjustWindowWidth(width) {
        const windowWidthValue = document.getElementById('windowWidthValue');
        if (windowWidthValue) {
            windowWidthValue.textContent = width;
        }

        const viewport = cornerstone.getViewport(this.element);
        if (viewport) {
            viewport.voi.windowWidth = parseInt(width);
            cornerstone.setViewport(this.element, viewport);
        }
    }

    // 调整窗位
    adjustWindowLevel(level) {
        const windowLevelValue = document.getElementById('windowLevelValue');
        if (windowLevelValue) {
            windowLevelValue.textContent = level;
        }

        const viewport = cornerstone.getViewport(this.element);
        if (viewport) {
            viewport.voi.windowCenter = parseInt(level);
            cornerstone.setViewport(this.element, viewport);
        }
    }

    // 调整缩放
    adjustZoom(zoomPercent) {
        const zoomValue = document.getElementById('zoomValue');
        if (zoomValue) {
            zoomValue.textContent = `${zoomPercent}%`;
        }

        const viewport = cornerstone.getViewport(this.element);
        if (viewport) {
            viewport.scale = zoomPercent / 100;
            cornerstone.setViewport(this.element, viewport);
        }
    }

    // 调整透明度
    adjustOpacity(value) {
        const opacityValue = document.getElementById('opacityValue');
        if (opacityValue) {
            opacityValue.textContent = `${value}%`;
        }
        // 在实际应用中，这里会应用到3D渲染
    }

    // 调整亮度
    adjustBrightness(value) {
        const brightnessValue = document.getElementById('brightnessValue');
        if (brightnessValue) {
            brightnessValue.textContent = `${value}%`;
        }
        // 在实际应用中，这里会应用到3D渲染
    }

    // 转到指定切片
    async gotoSlice(sliceIndex) {
        try {
            await this.loadImage(sliceIndex);
        } catch (error) {
            console.error('切换切片失败:', error);
            this.showMessage(`切换切片失败: ${error.message}`, 'error');
        }
    }

    // 上一个切片
    async previousSlice() {
        if (this.currentImageIdIndex > 0) {
            await this.gotoSlice(this.currentImageIdIndex - 1);
        }
    }

    // 下一个切片
    async nextSlice() {
        if (this.currentImageIdIndex < this.imageIds.length - 1) {
            await this.gotoSlice(this.currentImageIdIndex + 1);
        }
    }

    // 切换播放序列
    togglePlaySequence() {
        if (this.isPlaying) {
            this.stopPlaySequence();
        } else {
            this.startPlaySequence();
        }
    }

    // 开始播放序列
    startPlaySequence() {
        if (this.imageIds.length <= 1) {
            this.showMessage('序列中只有一个图像，无法播放', 'warning');
            return;
        }

        this.isPlaying = true;
        const playButton = document.getElementById('playSequenceBtn');
        if (playButton) {
            playButton.textContent = '停止播放';
        }

        this.playInterval = setInterval(async () => {
            let nextIndex = this.currentImageIdIndex + 1;
            if (nextIndex >= this.imageIds.length) {
                nextIndex = 0;
            }
            await this.gotoSlice(nextIndex);
        }, 500); // 每500ms切换一张图像
    }

    // 停止播放序列
    stopPlaySequence() {
        this.isPlaying = false;
        const playButton = document.getElementById('playSequenceBtn');
        if (playButton) {
            playButton.textContent = '播放序列';
        }

        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
    }

    // 重置视图
    resetView() {
        if (!this.currentImage) return;

        const defaultViewport = cornerstone.getDefaultViewport(this.element, this.currentImage);
        cornerstone.setViewport(this.element, defaultViewport);

        // 重置滑块值
        const windowWidthSlider = document.getElementById('windowWidthSlider');
        const windowLevelSlider = document.getElementById('windowLevelSlider');
        const zoomSlider = document.getElementById('zoomSlider');
        const windowWidthValue = document.getElementById('windowWidthValue');
        const windowLevelValue = document.getElementById('windowLevelValue');
        const zoomValue = document.getElementById('zoomValue');

        if (windowWidthSlider) {
            windowWidthSlider.value = defaultViewport.voi.windowWidth || 400;
        }
        if (windowLevelSlider) {
            windowLevelSlider.value = defaultViewport.voi.windowCenter || 40;
        }
        if (zoomSlider) {
            zoomSlider.value = 100;
        }

        // 更新显示值
        if (windowWidthValue && windowWidthSlider) {
            windowWidthValue.textContent = windowWidthSlider.value;
        }
        if (windowLevelValue && windowLevelSlider) {
            windowLevelValue.textContent = windowLevelSlider.value;
        }
        if (zoomValue) {
            zoomValue.textContent = '100%';
        }
    }

    // 反色图像
    invertImage() {
        const viewport = cornerstone.getViewport(this.element);
        viewport.invert = !viewport.invert;
        cornerstone.setViewport(this.element, viewport);
    }

    // 旋转图像
    rotateImage() {
        const viewport = cornerstone.getViewport(this.element);
        viewport.rotation = (viewport.rotation || 0) + 90;
        cornerstone.setViewport(this.element, viewport);
    }

    // 3D再现
    render3D() {
        // 在实际应用中，这里会使用VTK.js或Cornerstone3D来实现3D功能
        // 这里只是一个模拟实现
        this.showMessage('3D渲染功能需要额外的库支持，如VTK.js或Cornerstone3D', 'info');
    }

    // 导出报告
    exportReport() {
        if (!this.currentImage) {
            this.showMessage('没有图像可导出', 'warning');
            return;
        }

        try {
            // 创建报告内容
            const reportContent = this.generateReportContent();

            // 创建Blob对象
            const blob = new Blob([reportContent], { type: 'text/html' });

            // 创建下载链接
            const link = document.createElement('a');
            link.download = `dicom_report_${Date.now()}.html`;
            link.href = URL.createObjectURL(blob);
            link.click();

            // 清理URL
            setTimeout(() => URL.revokeObjectURL(link.href), 100);

            this.showMessage('报告导出成功', 'success');
        } catch (error) {
            console.error('导出报告失败:', error);
            this.showMessage(`导出报告失败: ${error.message}`, 'error');
        }
    }

    // 生成报告内容
    generateReportContent() {
        const measurements = this.tools ? this.tools.getAllMeasurements() : [];
        const annotations = this.tools ? this.tools.getAllAnnotations() : [];

        return `
<!DOCTYPE html>
<html>
<head>
    <title>DICOM医学影像报告</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { border-bottom: 2px solid #333; padding-bottom: 10px; }
        .section { margin: 20px 0; }
        .measurement-item, .annotation-item {
            border: 1px solid #ddd;
            padding: 10px;
            margin: 5px 0;
            border-radius: 4px;
        }
        .image-info { background: #f5f5f5; padding: 15px; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>DICOM医学影像分析报告</h1>
        <p>生成时间: ${new Date().toLocaleString()}</p>
    </div>

    <div class="section">
        <h2>图像信息</h2>
        <div class="image-info">
            <p>图像尺寸: ${this.currentImage ? `${this.currentImage.width} × ${this.currentImage.height}` : '未知'}</p>
            <p>当前切片: ${this.currentImageIdIndex + 1}/${this.imageIds.length}</p>
        </div>
    </div>

    <div class="section">
        <h2>测量结果 (${measurements.length} 个)</h2>
        ${measurements.length > 0 ?
            measurements.map(m => `
                <div class="measurement-item">
                    <strong>${m.toolName}</strong>: ${m.formattedValue || '未知'}
                    <br><small>时间: ${m.timestamp.toLocaleString()}</small>
                </div>
            `).join('') :
            '<p>暂无测量数据</p>'
        }
    </div>

    <div class="section">
        <h2>标记注释 (${annotations.length} 个)</h2>
        ${annotations.length > 0 ?
            annotations.map(a => `
                <div class="annotation-item">
                    <strong>${a.toolType}</strong>
                    <br><small>时间: ${a.timestamp.toLocaleString()}</small>
                </div>
            `).join('') :
            '<p>暂无标记数据</p>'
        }
    </div>
</body>
</html>
    `;
    }

    // 保存图像 - 导出标注后的DICOM
    saveImage() {
        if (!this.currentImage) {
            this.showMessage('没有图像可保存', 'warning');
            return;
        }

        try {
            // 获取当前canvas元素
            const canvas = this.element.querySelector('canvas');
            if (!canvas) {
                throw new Error('无法获取图像画布');
            }

            // 创建下载链接
            const link = document.createElement('a');
            link.download = `dicom_annotated_${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            this.showMessage('标注图像已保存为PNG', 'success');
        } catch (error) {
            console.error('保存图像失败:', error);
            this.showMessage(`保存图像失败: ${error.message}`, 'error');
        }
    }

    // 更新位置信息
    updatePositionInfo(event) {
        if (!this.currentImage) return;

        // 获取鼠标在图像上的位置
        const rect = this.element.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        document.getElementById('positionInfo').textContent =
            `位置: (${Math.round(x)}, ${Math.round(y)}) | 像素值: -`;
    }

    // 处理键盘事件
    handleKeyboard(event) {
        // 防止在输入框中触发
        if (event.target.tagName === 'INPUT') return;

        switch (event.key) {
            case 'ArrowLeft':
                event.preventDefault();
                this.previousSlice();
                break;
            case 'ArrowRight':
                event.preventDefault();
                this.nextSlice();
                break;
            case '+':
            case '=':
                event.preventDefault();
                // 放大
                const zoomSlider = document.getElementById('zoomSlider');
                if (zoomSlider) {
                    zoomSlider.value = Math.min(500, parseInt(zoomSlider.value) + 10);
                    this.adjustZoom(zoomSlider.value);
                }
                break;
            case '-':
                event.preventDefault();
                // 缩小
                const zoomSlider2 = document.getElementById('zoomSlider');
                if (zoomSlider2) {
                    zoomSlider2.value = Math.max(10, parseInt(zoomSlider2.value) - 10);
                    this.adjustZoom(zoomSlider2.value);
                }
                break;
            case 'r':
            case 'R':
                event.preventDefault();
                this.resetView();
                break;
            case ' ':
                event.preventDefault();
                this.togglePlaySequence();
                break;
        }
    }

    // 显示消息
    showMessage(message, type = 'info') {
        // 移除现有的消息
        const existingMessages = document.querySelectorAll('.message');
        existingMessages.forEach(msg => msg.remove());

        // 创建新的消息
        const messageDiv = document.createElement('div');
        messageDiv.textContent = message;
        messageDiv.className = `message ${type}`;

        document.body.appendChild(messageDiv);

        // 3秒后移除消息
        setTimeout(() => {
            if (document.body.contains(messageDiv)) {
                document.body.removeChild(messageDiv);
            }
        }, 3000);
    }
}

// 初始化应用程序
const viewer = new DICOMViewer();