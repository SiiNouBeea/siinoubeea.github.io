// 工具管理和测量功能
class DICOMTools {
    constructor(element) {
        this.element = element;
        this.activeTool = 'Pan';
        this.measurements = [];
        this.annotations = [];

        // 初始化工具
        this.initTools();
    }

    // 初始化工具
    initTools() {
        try {
            console.log('开始初始化工具...');
            cornerstoneTools.init({
                showSVGCursors: true,
            });
            console.log('工具初始化完成');

            // 添加工具
            this.addTools();

            // 设置默认工具
            this.setActiveTool(this.activeTool);

            // 监听测量完成事件
            this.setupEventListeners();


        } catch (error) {
            console.error('工具初始化失败:', error);
        }
    }



    // 添加工具到元素
    addTools() {
        console.log('添加工具到元素...');
        const toolList = [
            { name: 'Pan', class: cornerstoneTools.PanTool },
            { name: 'Zoom', class: cornerstoneTools.ZoomTool },
            { name: 'Wwwc', class: cornerstoneTools.WwwcTool },
            { name: 'Length', class: cornerstoneTools.LengthTool },
            { name: 'Angle', class: cornerstoneTools.AngleTool },
            { name: 'EllipticalRoi', class: cornerstoneTools.EllipticalRoiTool },
            { name: 'RectangleRoi', class: cornerstoneTools.RectangleRoiTool },
            { name: 'Probe', class: cornerstoneTools.ProbeTool },
            { name: 'ArrowAnnotate', class: cornerstoneTools.ArrowAnnotateTool },
            { name: 'FreehandRoi', class: cornerstoneTools.FreehandRoiTool },
            { name: 'Eraser', class: cornerstoneTools.EraserTool }
        ];

        toolList.forEach(tool => {
            if (tool.class) {
                try {
                    cornerstoneTools.addToolForElement(this.element, tool.class);
                    console.log(`成功添加工具: ${tool.name}`);
                } catch (error) {
                    console.warn(`添加工具失败 ${tool.name}:`, error);
                }
            }
        });

        // 配置 ArrowAnnotateTool
        if (cornerstoneTools.ArrowAnnotateTool) {
            try {
                const arrowAnnotateConfig = {
                    getTextCallback: function() {
                        return prompt('请输入注释文本:') || '标注';
                    }
                };

                cornerstoneTools.ArrowAnnotateTool.setConfiguration(arrowAnnotateConfig);
            } catch (error) {
                console.warn('配置 ArrowAnnotateTool 失败:', error);
            }
        }

        // 配置颜色选项
        this.configureColors();
    }

    // 配置工具颜色
    configureColors() {
        console.log('配置工具颜色...');
        // 配置测量工具颜色
        const measurementColor = '#00FF00';
        cornerstoneTools.globalConfiguration.setToolColor(measurementColor);

        // 配置标注工具颜色
        const annotationColor = '#FF0000';
        if (cornerstoneTools.ArrowAnnotateTool) {
            cornerstoneTools.ArrowAnnotateTool.setConfiguration({
                getTextCallback: function() {
                    return prompt('请输入注释文本:') || '标注';
                },
                color: annotationColor
            });
        }
    }

    // 设置活动工具
    setActiveTool(toolName) {
        console.log(`设置活动工具: ${toolName}`);
        if (!toolName) return;

        try {
            // 先禁用当前工具
            if (this.activeTool) {
                cornerstoneTools.setToolPassiveForElement(this.element, this.activeTool);
            }

            // 设置新工具
            this.activeTool = toolName;

            // 激活新工具
            cornerstoneTools.setToolActiveForElement(this.element, toolName, {
                mouseButtonMask: 1
            });

            console.log(`工具 ${toolName} 已激活`);

            // 触发自定义事件通知工具变更
            const event = new CustomEvent('toolChanged', {
                detail: { toolName }
            });
            this.element.dispatchEvent(event);
        } catch (error) {
            console.error(`激活工具失败: ${toolName}`, error);
        }
    }

    // 设置事件监听器
    setupEventListeners() {
        console.log('设置事件监听器...');
        // 监听测量完成事件
        this.element.addEventListener(cornerstoneTools.EVENTS.MEASUREMENT_ADDED, (e) => {
            console.log('测量数据添加事件:', e.detail);
            this.onMeasurementAdded(e.detail);
        });

        // 监听测量修改事件
        this.element.addEventListener(cornerstoneTools.EVENTS.MEASUREMENT_MODIFIED, (e) => {
            console.log('测量数据修改事件:', e.detail);
            this.onMeasurementModified(e.detail);
        });

        // 监听注释添加事件
        this.element.addEventListener(cornerstoneTools.EVENTS.ANNOTATION_ADDED, (e) => {
            console.log('注释添加事件:', e.detail);
            this.onAnnotationAdded(e.detail);
        });

        // 监听颜色选择器变化
        const colorPicker = document.getElementById('annotationColor');
        if (colorPicker) {
            colorPicker.addEventListener('change', (e) => {
                console.log('颜色选择器变化:', e.target.value);
                this.updateAnnotationColor(e.target.value);
            });
        }
    }

    // 更新标注颜色
    updateAnnotationColor(color) {
        console.log(`更新标注颜色: ${color}`);
        if (cornerstoneTools.ArrowAnnotateTool) {
            cornerstoneTools.ArrowAnnotateTool.setConfiguration({
                color: color
            });
        }

        // 更新自由绘制工具颜色
        if (cornerstoneTools.FreehandRoiTool) {
            cornerstoneTools.FreehandRoiTool.setConfiguration({
                color: color
            });
        }
    }

    // 处理测量添加
    onMeasurementAdded(measurementData) {
        console.log('处理测量添加:', measurementData);
        const { toolType, toolName, measurementData: data } = measurementData;

        let measurement = {
            id: this.generateId(),
            toolType,
            toolName,
            data,
            timestamp: new Date()
        };

        // 根据工具类型格式化测量值
        if (toolType === 'LengthTool') {
            measurement.formattedValue = this.formatLengthMeasurement(data);
        } else if (toolType === 'AngleTool') {
            measurement.formattedValue = this.formatAngleMeasurement(data);
        } else if (toolType === 'EllipticalRoiTool' || toolType === 'RectangleRoiTool') {
            measurement.formattedValue = this.formatAreaMeasurement(data);
        } else if (toolType === 'ProbeTool') {
            measurement.formattedValue = this.formatProbeMeasurement(data);
        }

        this.measurements.push(measurement);
        this.updateMeasurementList();
    }

    // 处理测量修改
    onMeasurementModified(measurementData) {
        console.log('处理测量修改:', measurementData);
        const { toolType, measurementData: data } = measurementData;

        // 查找并更新测量
        const index = this.measurements.findIndex(m =>
            m.data._id === data._id
        );

        if (index !== -1) {
            // 根据工具类型格式化测量值
            if (toolType === 'LengthTool') {
                this.measurements[index].formattedValue = this.formatLengthMeasurement(data);
            } else if (toolType === 'AngleTool') {
                this.measurements[index].formattedValue = this.formatAngleMeasurement(data);
            } else if (toolType === 'EllipticalRoiTool' || toolType === 'RectangleRoiTool') {
                this.measurements[index].formattedValue = this.formatAreaMeasurement(data);
            } else if (toolType === 'ProbeTool') {
                this.measurements[index].formattedValue = this.formatProbeMeasurement(data);
            }

            this.measurements[index].data = data;
            this.updateMeasurementList();
        }
    }

    // 处理注释添加
    onAnnotationAdded(annotationData) {
        console.log('处理注释添加:', annotationData);
        const {toolType, annotation } = annotationData;
        const newAnnotation = {
            id: this.generateId(),
            toolType,
            annotation,
            timestamp: new Date()
        };

        this.annotations.push(newAnnotation);
        this.updateAnnotationList();
    }

    // 格式化长度测量
    formatLengthMeasurement(data) {
        console.log('格式化长度测量:', data);
        if (!data || !data.length) return '未知';

        // 尝试获取像素间距来计算实际长度
        let pixelSpacing = 1; // 默认值
        if (data.handles && data.handles.pixelSpacing) {
            pixelSpacing = data.handles.pixelSpacing;
        }

        const lengthInPixels = data.length;
        const lengthInMM = lengthInPixels * pixelSpacing;

        return `${lengthInMM.toFixed(2)} mm (${lengthInPixels.toFixed(1)} 像素)`;
    }

    // 格式化角度测量
    formatAngleMeasurement(data) {
        console.log('格式化角度测量:', data);
        if (!data || !data.rAngle) return '未知';

        return `${data.rAngle.toFixed(1)}°`;
    }

    // 格式化面积测量
    formatAreaMeasurement(data) {
        console.log('格式化面积测量:', data);
        if (!data || !data.area) return '未知';

        // 尝试获取像素间距来计算实际面积
        let pixelSpacing = 1; // 默认值
        if (data.handles && data.handles.pixelSpacing) {
            pixelSpacing = data.handles.pixelSpacing;
        }

        const areaInPixels = data.area;
        const areaInMM2 = areaInPixels * pixelSpacing * pixelSpacing;

        return `${areaInMM2.toFixed(2)} mm² (${areaInPixels.toFixed(1)} 像素²)`;
    }

    // 格式化像素值测量
    formatProbeMeasurement(data) {
        console.log('格式化像素值测量:', data);
        if (!data || data.value === undefined) return '未知';

        return `像素值: ${data.value}`;
    }

    // 更新测量列表显示
    updateMeasurementList() {
        console.log('更新测量列表显示');
        const measurementList = document.getElementById('measurementList');

        if (this.measurements.length === 0) {
            measurementList.innerHTML = '<div class="empty-message">暂无测量数据</div>';
            return;
        }

        measurementList.innerHTML = '';

        this.measurements.forEach(measurement => {
            const item = document.createElement('div');
            item.className = 'measurement-item';
            item.innerHTML = `
                <span>${measurement.toolName}</span>
                <span class="measurement-value">${measurement.formattedValue}</span>
            `;
            measurementList.appendChild(item);
        });
    }

    // 更新注释列表显示
    updateAnnotationList() {
        console.log('更新注释列表显示');
        const annotationList = document.getElementById('annotationList');

        if (this.annotations.length === 0) {
            annotationList.innerHTML = '<div class="empty-message">暂无标记</div>';
            return;
        }

        annotationList.innerHTML = '';

        this.annotations.forEach(annotation => {
            const item = document.createElement('div');
            item.className = 'annotation-item';

            let annotationText = '标记';
            if (annotation.toolType === 'ArrowAnnotateTool' && annotation.annotation.text) {
                annotationText = annotation.annotation.text;
            }

            item.innerHTML = `
                <span>${annotation.toolType.replace('Tool', '')}</span>
                <span>${annotationText}</span>
            `;
            annotationList.appendChild(item);
        });
    }

    // 清除所有测量
    clearAllMeasurements() {
        console.log('清除所有测量');
        // 从Cornerstone工具中清除测量
        const measurementManager = cornerstoneTools.globalImageIdSpecificToolStateManager;
        const toolState = measurementManager.saveToolState();

        // 清除所有工具的测量状态
        for (const toolName in toolState) {
            for (const imageId in toolState[toolName]) {
                measurementManager.restoreToolState(toolName, imageId, { data: [] });
            }
        }

        // 清除本地存储的测量
        this.measurements = [];
        this.updateMeasurementList();

        // 刷新图像以清除显示
        cornerstone.updateImage(this.element);
    }

    // 清除所有注释
    clearAllAnnotations() {
        console.log('清除所有注释');
        // 从Cornerstone工具中清除注释
        const annotationManager = cornerstoneTools.globalImageIdSpecificToolStateManager;
        const toolState = annotationManager.saveToolState();

        // 清除所有工具的注释状态
        for (const toolName in toolState) {
            if (toolName.includes('Annotation') || toolName.includes('Roi')) {
                for (const imageId in toolState[toolName]) {
                    annotationManager.restoreToolState(toolName, imageId, { data: [] });
                }
            }
        }

        // 清除本地存储的注释
        this.annotations = [];
        this.updateAnnotationList();

        // 刷新图像以清除显示
        cornerstone.updateImage(this.element);
    }

    // 生成唯一ID
    generateId() {
        console.log('生成唯一ID');
        return 'id_' + Math.random().toString(36).substr(2, 9);
    }

    // 获取所有测量数据
    getAllMeasurements() {
        console.log('获取所有测量数据');
        return this.measurements;
    }

    // 获取所有标注数据
    getAllAnnotations() {
        console.log('获取所有标注数据');
        return this.annotations;
    }
}