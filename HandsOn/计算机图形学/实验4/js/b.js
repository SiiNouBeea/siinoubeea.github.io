"use strict";

var canvas;
var gl;
var program;

// 全局变量
var shapes = []; // 存储所有形状
var selectedShape = null; // 当前选中的形状
var currentShapeType = null; // 默认不选中任何形状类型
var currentColor = [1.0, 0.0, 0.0, 1.0]; // 默认红色

// 着色器变量位置
var vPosition;
var vColor;
var thetaXLocation;
var thetaYLocation;
var thetaZLocation;
var translationLocation;
var scaleLocation;

// 自动旋转控制
var autoRotate = {
    x: false,
    y: false,
    z: false,
    speed: 0
};

// 形状类型枚举
var ShapeTypes = {
    TRIANGLE: 'triangle',
    SQUARE: 'square',
    CUBE: 'cube',
    CIRCLE: 'circle'
};

// 形状基类
function Shape(type, x, y, color) {
    this.type = type;
    this.x = x; // 画布坐标X
    this.y = y; // 画布坐标Y
    this.color = color || [1.0, 0.0, 0.0, 1.0];
    this.selected = false;

    // 动画参数
    this.thetaX = 0.0;
    this.thetaY = 0.0;
    this.thetaZ = 0.0;
    this.scale = 1.0;
    this.translation = [0.0, 0.0, 0.0];

    // 特定参数
    this.animationTime = 0;
    this.scaleDirection = 1; // 缩放方向
    this.randomVelocity = [0.0, 0.0, 0.0]; // 圆形随机速度

    // 初始化特定形状的参数
    this.initShapeParams();

    this.init();
}

Shape.prototype.initShapeParams = function() {
    switch(this.type) {
        case ShapeTypes.TRIANGLE:
            this.scaleSpeed = 0.008;
            this.minScale = 0.5;
            this.maxScale = 2.0;
            break;
        case ShapeTypes.SQUARE:
            this.size = 0.1;
            this.rotationSpeed = 0.02;
            break;
        case ShapeTypes.CUBE:
            this.rotationXSpeed = 0.015;
            this.rotationYSpeed = 0.01;
            this.rotationZSpeed = 0.0;
            break;
        case ShapeTypes.CIRCLE:
            this.segments = 32;
            this.radius = 0.1;
            this.randomVelocity[0] = (Math.random() - 0.5) * 0.02;
            this.randomVelocity[1] = (Math.random() - 0.5) * 0.02;
            this.randomVelocity[2] = 0.0;
            break;
    }
};

Shape.prototype.init = function() {
    // 将画布坐标转换为WebGL坐标
    this.translation[0] = (this.x - 300) / 300; // 转换为-1到1
    this.translation[1] = -(this.y - 300) / 300; // Y轴反转
    this.translation[2] = 0.0;
};

Shape.prototype.updateAnimation = function(deltaTime) {
    this.animationTime += deltaTime;

    switch (this.type) {
        case ShapeTypes.TRIANGLE:
            // 正三角形：持续放大缩小 (0.5-2倍)
            this.scale += this.scaleDirection * this.scaleSpeed;
            if (this.scale >= this.maxScale) {
                this.scale = this.maxScale;
                this.scaleDirection = -1;
            } else if (this.scale <= this.minScale) {
                this.scale = this.minScale;
                this.scaleDirection = 1;
            }
            break;

        case ShapeTypes.SQUARE:
            // 正方形：持续绕Z轴转动
            this.thetaZ += this.rotationSpeed;
            break;

        case ShapeTypes.CUBE:
            // 立方体：绕特定轴转动，确保能看到两个面
            this.thetaX += this.rotationXSpeed;
            this.thetaY += this.rotationYSpeed;
            this.thetaZ += this.rotationZSpeed;
            break;

        case ShapeTypes.CIRCLE:
            // 圆形：在XOY平面上作随机平移
            this.translation[0] += this.randomVelocity[0];
            this.translation[1] += this.randomVelocity[1];

            // 边界检测和反弹
            if (this.translation[0] > 0.9 || this.translation[0] < -0.9) {
                this.randomVelocity[0] = -this.randomVelocity[0];
            }
            if (this.translation[1] > 0.9 || this.translation[1] < -0.9) {
                this.randomVelocity[1] = -this.randomVelocity[1];
            }
            break;
    }
};

// 获取形状的几何数据
Shape.prototype.getGeometry = function() {
    switch (this.type) {
        case ShapeTypes.TRIANGLE:
            return this.createTriangle();
        case ShapeTypes.SQUARE:
            return this.createSquare();
        case ShapeTypes.CUBE:
            return this.createCube();
        case ShapeTypes.CIRCLE:
            return this.createCircle();
        default:
            return { vertices: [], colors: [] };
    }
};

// 修改创建三角形方法，添加选中效果
Shape.prototype.createTriangle = function() {
    var vertices = [
        0.0, 0.15, 0.0,      // 顶点
        -0.13, -0.075, 0.0,  // 左下
        0.13, -0.075, 0.0    // 右下
    ];

    var colors = [];
    for (var i = 0; i < 3; i++) {
        // 如果形状被选中，增加亮度
        if (this.selected) {
            colors = colors.concat([
                Math.min(this.color[0] * 1.5, 1.0),
                Math.min(this.color[1] * 1.5, 1.0),
                Math.min(this.color[2] * 1.5, 1.0),
                1.0
            ]);
        } else {
            colors = colors.concat(this.color);
        }
    }

    return { vertices: vertices, colors: colors };
};

// 修改创建正方形方法，添加选中效果
Shape.prototype.createSquare = function() {
    var s = this.size;
    var vertices = [
        -s, s, 0.0,   // 左上
        -s, -s, 0.0,  // 左下
        s, -s, 0.0,   // 右下
        -s, s, 0.0,   // 左上
        s, -s, 0.0,   // 右下
        s, s, 0.0     // 右上
    ];

    var colors = [];
    for (var i = 0; i < 6; i++) {
        // 如果形状被选中，增加亮度
        if (this.selected) {
            colors = colors.concat([
                Math.min(this.color[0] * 1.5, 1.0),
                Math.min(this.color[1] * 1.5, 1.0),
                Math.min(this.color[2] * 1.5, 1.0),
                1.0
            ]);
        } else {
            colors = colors.concat(this.color);
        }
    }

    return { vertices: vertices, colors: colors };
};

// 修改创建立方体方法，添加选中效果
Shape.prototype.createCube = function() {
    var s = 0.08; // 立方体半边长
    var vertices = [
        // 前面
        -s, -s, s,   -s, s, s,   s, s, s,
        -s, -s, s,   s, s, s,   s, -s, s,
        // 后面
        s, -s, -s,   s, s, -s,   -s, s, -s,
        s, -s, -s,   -s, s, -s,   -s, -s, -s,
        // 右面
        s, -s, s,   s, s, s,   s, s, -s,
        s, -s, s,   s, s, -s,   s, -s, -s,
        // 左面
        -s, -s, -s,   -s, s, -s,   -s, s, s,
        -s, -s, -s,   -s, s, s,   -s, -s, s,
        // 上面
        -s, s, s,   -s, s, -s,   s, s, -s,
        -s, s, s,   s, s, -s,   s, s, s,
        // 下面
        -s, -s, -s,   s, -s, -s,   s, -s, s,
        -s, -s, -s,   s, -s, s,   -s, -s, s
    ];

    var colors = [];
    var faceColors = [
        [1.0, 0.0, 0.0, 1.0], // 前面 - 红
        [0.0, 1.0, 0.0, 1.0], // 后面 - 绿
        [0.0, 0.0, 1.0, 1.0], // 右面 - 蓝
        [1.0, 1.0, 0.0, 1.0], // 左面 - 黄
        [1.0, 0.0, 1.0, 1.0], // 上面 - 紫
        [0.0, 1.0, 1.0, 1.0]  // 下面 - 青
    ];

    // 使用自定义颜色，但保持面的颜色变化
    for (var face = 0; face < 6; face++) {
        for (var vertex = 0; vertex < 6; vertex++) {
            // 混合用户颜色和默认颜色
            var mixedColor = [
                (this.color[0] + faceColors[face][0]) / 2,
                (this.color[1] + faceColors[face][1]) / 2,
                (this.color[2] + faceColors[face][2]) / 2,
                1.0
            ];

            // 如果形状被选中，增加亮度
            if (this.selected) {
                mixedColor[0] = Math.min(mixedColor[0] * 1.5, 1.0);
                mixedColor[1] = Math.min(mixedColor[1] * 1.5, 1.0);
                mixedColor[2] = Math.min(mixedColor[2] * 1.5, 1.0);
            }

            colors = colors.concat(mixedColor);
        }
    }

    return { vertices: vertices, colors: colors };
};

// 修改创建圆形方法，添加选中效果
Shape.prototype.createCircle = function() {
    var vertices = [];
    var radius = this.radius;

    // 中心点
    vertices.push(0.0, 0.0, 0.0);

    // 圆周上的点
    for (var i = 0; i <= this.segments; i++) {
        var angle = (i / this.segments) * Math.PI * 2;
        vertices.push(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius,
            0.0
        );
    }

    var colors = [];
    // 中心点颜色
    if (this.selected) {
        colors = colors.concat([
            Math.min(this.color[0] * 1.5, 1.0),
            Math.min(this.color[1] * 1.5, 1.0),
            Math.min(this.color[2] * 1.5, 1.0),
            1.0
        ]);
    } else {
        colors = colors.concat(this.color);
    }

    // 圆周点颜色
    for (var i = 0; i <= this.segments; i++) {
        if (this.selected) {
            colors = colors.concat([
                Math.min(this.color[0] * 1.5, 1.0),
                Math.min(this.color[1] * 1.5, 1.0),
                Math.min(this.color[2] * 1.5, 1.0),
                1.0
            ]);
        } else {
            colors = colors.concat(this.color);
        }
    }

    return { vertices: vertices, colors: colors };
};

// 初始化函数
function initCanvas() {
    canvas = document.getElementById("gl-canvas");
    gl = canvas.getContext("webgl2");

    if (!gl) {
        alert("WebGL isn't available");
        return;
    }

    // 设置WebGL
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.95, 0.95, 0.95, 1.0);
    gl.enable(gl.DEPTH_TEST);

    // 初始化着色器
    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    // 获取属性和uniform位置
    vPosition = gl.getAttribLocation(program, "vPosition");
    vColor = gl.getAttribLocation(program, "vColor");
    thetaXLocation = gl.getUniformLocation(program, "thetaX");
    thetaYLocation = gl.getUniformLocation(program, "thetaY");
    thetaZLocation = gl.getUniformLocation(program, "thetaZ");
    translationLocation = gl.getUniformLocation(program, "translation");
    scaleLocation = gl.getUniformLocation(program, "scale");

    // 设置事件监听器
    canvas.addEventListener('click', handleCanvasClick);

    // 设置控制面板事件监听器
    setupControlPanel();

    // 添加点击外部区域清除选中的功能
    document.addEventListener('click', function(e) {
        // 检查点击是否在控制面板或画布内
        const controlPanel = document.querySelector('.controls-wrapper');
        const canvasContainer = document.querySelector('.canvas-container');
        const propertiesPanel = document.querySelector('.properties-panel');

        // 如果点击不在控制面板、画布或属性面板内，则清除选中
        if (!controlPanel.contains(e.target) &&
            !canvasContainer.contains(e.target) &&
            (!propertiesPanel || !propertiesPanel.contains(e.target))) {
            clearSelection();
        }
    });

    // 开始渲染循环
    render();
}

// 清除选中状态
function clearSelection() {
    if (selectedShape) {
        selectedShape.selected = false;
        selectedShape = null;
        closePropertiesPanel();

        // 重置控制面板
        document.getElementById('thetaX').value = 0;
        document.getElementById('thetaY').value = 0;
        document.getElementById('thetaZ').value = 0;
    }
}


// 设置控制面板事件监听器
function setupControlPanel() {
    // 旋转控制
    document.getElementById('thetaX').addEventListener('input', function(e) {
        if (selectedShape) {
            selectedShape.thetaX = parseFloat(e.target.value) * Math.PI / 180;
        }
    });

    document.getElementById('thetaY').addEventListener('input', function(e) {
        if (selectedShape) {
            selectedShape.thetaY = parseFloat(e.target.value) * Math.PI / 180;
        }
    });

    document.getElementById('thetaZ').addEventListener('input', function(e) {
        if (selectedShape) {
            selectedShape.thetaZ = parseFloat(e.target.value) * Math.PI / 180;
        }
    });

    // 自动旋转控制
    document.getElementById('autoX').addEventListener('change', function(e) {
        autoRotate.x = e.target.checked;
    });

    document.getElementById('autoY').addEventListener('change', function(e) {
        autoRotate.y = e.target.checked;
    });

    document.getElementById('autoZ').addEventListener('change', function(e) {
        autoRotate.z = e.target.checked;
    });

    document.getElementById('rotSpeed').addEventListener('input', function(e) {
        autoRotate.speed = parseFloat(e.target.value) * 0.01;
    });
}

// 处理画布点击事件
function handleCanvasClick(event) {
    var rect = canvas.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;

    // 检查是否点击了已存在的形状
    var clickedShape = getShapeAtPosition(x, y);

    if (clickedShape) {
        // 选中已存在的形状
        selectExistingShape(clickedShape);
        showPropertiesPanel(clickedShape);
        // 更新控制面板
        updateControlPanel(clickedShape);
    } else {
        // 在点击位置创建新形状
        createShapeAt(x, y);
        // 关闭属性面板
        closePropertiesPanel();
    }
}

// 更新控制面板
function updateControlPanel(shape) {
    document.getElementById('thetaX').value = shape.thetaX * 180 / Math.PI;
    document.getElementById('thetaY').value = shape.thetaY * 180 / Math.PI;
    document.getElementById('thetaZ').value = shape.thetaZ * 180 / Math.PI;
}

// 获取指定位置的形状
function getShapeAtPosition(x, y) {
    for (var i = shapes.length - 1; i >= 0; i--) {
        var shape = shapes[i];
        var shapeX = (shape.translation[0] + 1) * 300;
        var shapeY = (-shape.translation[1] + 1) * 300;

        var distance = Math.sqrt(Math.pow(x - shapeX, 2) + Math.pow(y - shapeY, 2));

        // 根据形状类型设置不同的点击范围
        var clickRadius = 30; // 默认点击范围

        if (distance < clickRadius) {
            return shape;
        }
    }
    return null;
}

// 选中已存在的形状
function selectExistingShape(shape) {
    // 取消之前选中的形状
    if (selectedShape) {
        selectedShape.selected = false;
    }

    // 选中新形状
    selectedShape = shape;
    shape.selected = true;

    // 更新颜色选择器
    var color = shape.color;
    var hexColor = rgbToHex(Math.floor(color[0] * 255), Math.floor(color[1] * 255), Math.floor(color[2] * 255));
    document.getElementById('colorPicker').value = hexColor;

    // 更新控制面板
    updateControlPanel(shape);
}

// 在指定位置创建形状
function createShapeAt(x, y) {
    if (!currentShapeType) return; // 如果没有选择形状类型，则不创建
    var shape = new Shape(currentShapeType, x, y, currentColor.slice());
    shapes.push(shape);
}

// 选择形状类型
function selectShape(shapeType) {
    // 如果当前已选中该形状类型，则取消选中
    if (currentShapeType === shapeType) {
        currentShapeType = null;

        // 更新按钮状态
        var buttons = document.querySelectorAll('.shape-btn');
        buttons.forEach(function(btn) {
            btn.classList.remove('active');
        });
        return;
    }

    currentShapeType = shapeType;

    // 更新按钮状态
    var buttons = document.querySelectorAll('.shape-btn');
    buttons.forEach(function(btn) {
        btn.classList.remove('active');
    });
    document.getElementById(shapeType + '-btn').classList.add('active');
}

// 更新选中形状的颜色
function updateSelectedColor() {
    var colorPicker = document.getElementById('colorPicker');
    var hexColor = colorPicker.value;
    currentColor = hexToRgb(hexColor);

    if (selectedShape) {
        selectedShape.color = currentColor.slice();
    }
}

// 清除画布
function clearCanvas() {
    shapes = [];
    selectedShape = null;
    closePropertiesPanel();

    // 重置控制面板
    document.getElementById('thetaX').value = 0;
    document.getElementById('thetaY').value = 0;
    document.getElementById('thetaZ').value = 0;
}

// 删除选中的形状
function deleteSelected() {
    if (selectedShape) {
        var index = shapes.indexOf(selectedShape);
        if (index > -1) {
            shapes.splice(index, 1);
        }
        selectedShape = null;
        closePropertiesPanel();

        // 重置控制面板
        document.getElementById('thetaX').value = 0;
        document.getElementById('thetaY').value = 0;
        document.getElementById('thetaZ').value = 0;
    }
}

// 颜色转换函数
function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255,
        1.0
    ] : [1.0, 0.0, 0.0, 1.0];
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// 显示属性面板
function showPropertiesPanel(shape) {
    // 移除已存在的面板
    closePropertiesPanel();

    // 创建遮罩层
    var overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.onclick = closePropertiesPanel;
    document.body.appendChild(overlay);

    // 创建面板
    var panel = document.createElement('div');
    panel.className = 'properties-panel';

    // 创建标题栏
    var header = document.createElement('div');
    header.className = 'panel-header';

    var title = document.createElement('h3');
    title.textContent = '属性设置 - ' + shape.type;
    header.appendChild(title);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = '×';
    closeBtn.onclick = closePropertiesPanel;
    header.appendChild(closeBtn);

    panel.appendChild(header);

    // 根据形状类型添加控件
    switch(shape.type) {
        case ShapeTypes.TRIANGLE:
            addTriangleControls(panel, shape);
            break;
        case ShapeTypes.SQUARE:
            addSquareControls(panel, shape);
            break;
        case ShapeTypes.CUBE:
            addCubeControls(panel, shape);
            break;
        case ShapeTypes.CIRCLE:
            addCircleControls(panel, shape);
            break;
    }

    // 添加通用控件
    addGeneralControls(panel, shape);

    document.body.appendChild(panel);
}

// 添加三角形控件
function addTriangleControls(panel, shape) {
    var group = document.createElement('div');
    group.className = 'property-group';

    var label = document.createElement('label');
    label.textContent = '缩放速度: ' + shape.scaleSpeed.toFixed(3);
    group.appendChild(label);

    var scaleSpeedSlider = document.createElement('input');
    scaleSpeedSlider.type = 'range';
    scaleSpeedSlider.min = '0.001';
    scaleSpeedSlider.max = '0.05';
    scaleSpeedSlider.step = '0.001';
    scaleSpeedSlider.value = shape.scaleSpeed;
    scaleSpeedSlider.oninput = function() {
        shape.scaleSpeed = parseFloat(this.value);
        label.textContent = '缩放速度: ' + shape.scaleSpeed.toFixed(3);
    };
    group.appendChild(scaleSpeedSlider);

    panel.appendChild(group);

    // 最小缩放
    group = document.createElement('div');
    group.className = 'property-group';

    label = document.createElement('label');
    label.textContent = '最小缩放: ' + shape.minScale.toFixed(2);
    group.appendChild(label);

    var minScaleSlider = document.createElement('input');
    minScaleSlider.type = 'range';
    minScaleSlider.min = '0.1';
    minScaleSlider.max = '2.0';
    minScaleSlider.step = '0.1';
    minScaleSlider.value = shape.minScale;
    minScaleSlider.oninput = function() {
        shape.minScale = parseFloat(this.value);
        label.textContent = '最小缩放: ' + shape.minScale.toFixed(2);
    };
    group.appendChild(minScaleSlider);

    panel.appendChild(group);

    // 最大缩放
    group = document.createElement('div');
    group.className = 'property-group';

    label = document.createElement('label');
    label.textContent = '最大缩放: ' + shape.maxScale.toFixed(2);
    group.appendChild(label);

    var maxScaleSlider = document.createElement('input');
    maxScaleSlider.type = 'range';
    maxScaleSlider.min = '0.1';
    maxScaleSlider.max = '3.0';
    maxScaleSlider.step = '0.1';
    maxScaleSlider.value = shape.maxScale;
    maxScaleSlider.oninput = function() {
        shape.maxScale = parseFloat(this.value);
        label.textContent = '最大缩放: ' + shape.maxScale.toFixed(2);
    };
    group.appendChild(maxScaleSlider);

    panel.appendChild(group);
}

// 添加正方形控件
function addSquareControls(panel, shape) {
    var group = document.createElement('div');
    group.className = 'property-group';

    var label = document.createElement('label');
    label.textContent = '大小: ' + shape.size.toFixed(2);
    group.appendChild(label);

    var sizeSlider = document.createElement('input');
    sizeSlider.type = 'range';
    sizeSlider.min = '0.05';
    sizeSlider.max = '0.3';
    sizeSlider.step = '0.01';
    sizeSlider.value = shape.size;
    sizeSlider.oninput = function() {
        shape.size = parseFloat(this.value);
        label.textContent = '大小: ' + shape.size.toFixed(2);
    };
    group.appendChild(sizeSlider);

    panel.appendChild(group);

    // 旋转速度
    group = document.createElement('div');
    group.className = 'property-group';

    label = document.createElement('label');
    label.textContent = '旋转速度: ' + shape.rotationSpeed.toFixed(3);
    group.appendChild(label);

    var rotationSpeedSlider = document.createElement('input');
    rotationSpeedSlider.type = 'range';
    rotationSpeedSlider.min = '0.001';
    rotationSpeedSlider.max = '0.1';
    rotationSpeedSlider.step = '0.001';
    rotationSpeedSlider.value = shape.rotationSpeed;
    rotationSpeedSlider.oninput = function() {
        shape.rotationSpeed = parseFloat(this.value);
        label.textContent = '旋转速度: ' + shape.rotationSpeed.toFixed(3);
    };
    group.appendChild(rotationSpeedSlider);

    panel.appendChild(group);
}

// 添加立方体控件
function addCubeControls(panel, shape) {
    var group = document.createElement('div');
    group.className = 'property-group';

    var label = document.createElement('label');
    label.textContent = 'X轴旋转速度: ' + shape.rotationXSpeed.toFixed(3);
    group.appendChild(label);

    var rotationXSlider = document.createElement('input');
    rotationXSlider.type = 'range';
    rotationXSlider.min = '-0.1';
    rotationXSlider.max = '0.1';
    rotationXSlider.step = '0.001';
    rotationXSlider.value = shape.rotationXSpeed;
    rotationXSlider.oninput = function() {
        shape.rotationXSpeed = parseFloat(this.value);
        label.textContent = 'X轴旋转速度: ' + shape.rotationXSpeed.toFixed(3);
    };
    group.appendChild(rotationXSlider);

    panel.appendChild(group);

    // Y轴旋转
    group = document.createElement('div');
    group.className = 'property-group';

    label = document.createElement('label');
    label.textContent = 'Y轴旋转速度: ' + shape.rotationYSpeed.toFixed(3);
    group.appendChild(label);

    var rotationYSlider = document.createElement('input');
    rotationYSlider.type = 'range';
    rotationYSlider.min = '-0.1';
    rotationYSlider.max = '0.1';
    rotationYSlider.step = '0.001';
    rotationYSlider.value = shape.rotationYSpeed;
    rotationYSlider.oninput = function() {
        shape.rotationYSpeed = parseFloat(this.value);
        label.textContent = 'Y轴旋转速度: ' + shape.rotationYSpeed.toFixed(3);
    };
    group.appendChild(rotationYSlider);

    panel.appendChild(group);

    // Z轴旋转
    group = document.createElement('div');
    group.className = 'property-group';

    label = document.createElement('label');
    label.textContent = 'Z轴旋转速度: ' + shape.rotationZSpeed.toFixed(3);
    group.appendChild(label);

    var rotationZSlider = document.createElement('input');
    rotationZSlider.type = 'range';
    rotationZSlider.min = '-0.1';
    rotationZSlider.max = '0.1';
    rotationZSlider.step = '0.001';
    rotationZSlider.value = shape.rotationZSpeed;
    rotationZSlider.oninput = function() {
        shape.rotationZSpeed = parseFloat(this.value);
        label.textContent = 'Z轴旋转速度: ' + shape.rotationZSpeed.toFixed(3);
    };
    group.appendChild(rotationZSlider);

    panel.appendChild(group);
}

// 添加圆形控件
function addCircleControls(panel, shape) {
    var group = document.createElement('div');
    group.className = 'property-group';

    var label = document.createElement('label');
    label.textContent = '半径: ' + shape.radius.toFixed(2);
    group.appendChild(label);

    var radiusSlider = document.createElement('input');
    radiusSlider.type = 'range';
    radiusSlider.min = '0.05';
    radiusSlider.max = '0.3';
    radiusSlider.step = '0.01';
    radiusSlider.value = shape.radius;
    radiusSlider.oninput = function() {
        shape.radius = parseFloat(this.value);
        label.textContent = '半径: ' + shape.radius.toFixed(2);
    };
    group.appendChild(radiusSlider);

    panel.appendChild(group);

    // 边数
    group = document.createElement('div');
    group.className = 'property-group';

    label = document.createElement('label');
    label.textContent = '边数: ' + shape.segments;
    group.appendChild(label);

    var segmentsSlider = document.createElement('input');
    segmentsSlider.type = 'range';
    segmentsSlider.min = '3';
    segmentsSlider.max = '100';
    segmentsSlider.step = '1';
    segmentsSlider.value = shape.segments;
    segmentsSlider.oninput = function() {
        shape.segments = parseInt(this.value);
        label.textContent = '边数: ' + shape.segments;
    };
    group.appendChild(segmentsSlider);

    panel.appendChild(group);

    // X轴速度
    group = document.createElement('div');
    group.className = 'property-group';

    label = document.createElement('label');
    label.textContent = 'X轴速度: ' + shape.randomVelocity[0].toFixed(3);
    group.appendChild(label);

    var velocityXSlider = document.createElement('input');
    velocityXSlider.type = 'range';
    velocityXSlider.min = '-0.05';
    velocityXSlider.max = '0.05';
    velocityXSlider.step = '0.001';
    velocityXSlider.value = shape.randomVelocity[0];
    velocityXSlider.oninput = function() {
        shape.randomVelocity[0] = parseFloat(this.value);
        label.textContent = 'X轴速度: ' + shape.randomVelocity[0].toFixed(3);
    };
    group.appendChild(velocityXSlider);

    panel.appendChild(group);

    // Y轴速度
    group = document.createElement('div');
    group.className = 'property-group';

    label = document.createElement('label');
    label.textContent = 'Y轴速度: ' + shape.randomVelocity[1].toFixed(3);
    group.appendChild(label);

    var velocityYSlider = document.createElement('input');
    velocityYSlider.type = 'range';
    velocityYSlider.min = '-0.05';
    velocityYSlider.max = '0.05';
    velocityYSlider.step = '0.001';
    velocityYSlider.value = shape.randomVelocity[1];
    velocityYSlider.oninput = function() {
        shape.randomVelocity[1] = parseFloat(this.value);
        label.textContent = 'Y轴速度: ' + shape.randomVelocity[1].toFixed(3);
    };
    group.appendChild(velocityYSlider);

    panel.appendChild(group);
}

// 添加通用控件
function addGeneralControls(panel, shape) {
    var group = document.createElement('div');
    group.className = 'property-group';

    var label = document.createElement('label');
    label.textContent = '统一缩放: ' + shape.scale.toFixed(2);
    group.appendChild(label);

    var scaleSlider = document.createElement('input');
    scaleSlider.type = 'range';
    scaleSlider.min = '0.1';
    scaleSlider.max = '3.0';
    scaleSlider.step = '0.1';
    scaleSlider.value = shape.scale;
    scaleSlider.oninput = function() {
        shape.scale = parseFloat(this.value);
        label.textContent = '统一缩放: ' + shape.scale.toFixed(2);
    };
    group.appendChild(scaleSlider);

    panel.appendChild(group);

    // X轴旋转
    group = document.createElement('div');
    group.className = 'property-group';

    label = document.createElement('label');
    label.textContent = 'X轴旋转: ' + (shape.thetaX * 180 / Math.PI).toFixed(2) + '°';
    group.appendChild(label);

    var thetaXSlider = document.createElement('input');
    thetaXSlider.type = 'range';
    thetaXSlider.min = '0';
    thetaXSlider.max = '360';
    thetaXSlider.step = '1';
    thetaXSlider.value = shape.thetaX * 180 / Math.PI;
    thetaXSlider.oninput = function() {
        shape.thetaX = parseFloat(this.value) * Math.PI / 180;
        label.textContent = 'X轴旋转: ' + (shape.thetaX * 180 / Math.PI).toFixed(2) + '°';
    };
    group.appendChild(thetaXSlider);

    panel.appendChild(group);

    // Y轴旋转
    group = document.createElement('div');
    group.className = 'property-group';

    label = document.createElement('label');
    label.textContent = 'Y轴旋转: ' + (shape.thetaY * 180 / Math.PI).toFixed(2) + '°';
    group.appendChild(label);

    var thetaYSlider = document.createElement('input');
    thetaYSlider.type = 'range';
    thetaYSlider.min = '0';
    thetaYSlider.max = '360';
    thetaYSlider.step = '1';
    thetaYSlider.value = shape.thetaY * 180 / Math.PI;
    thetaYSlider.oninput = function() {
        shape.thetaY = parseFloat(this.value) * Math.PI / 180;
        label.textContent = 'Y轴旋转: ' + (shape.thetaY * 180 / Math.PI).toFixed(2) + '°';
    };
    group.appendChild(thetaYSlider);

    panel.appendChild(group);

    // Z轴旋转
    group = document.createElement('div');
    group.className = 'property-group';

    label = document.createElement('label');
    label.textContent = 'Z轴旋转: ' + (shape.thetaZ * 180 / Math.PI).toFixed(2) + '°';
    group.appendChild(label);

    var thetaZSlider = document.createElement('input');
    thetaZSlider.type = 'range';
    thetaZSlider.min = '0';
    thetaZSlider.max = '360';
    thetaZSlider.step = '1';
    thetaZSlider.value = shape.thetaZ * 180 / Math.PI;
    thetaZSlider.oninput = function() {
        shape.thetaZ = parseFloat(this.value) * Math.PI / 180;
        label.textContent = 'Z轴旋转: ' + (shape.thetaZ * 180 / Math.PI).toFixed(2) + '°';
    };
    group.appendChild(thetaZSlider);

    panel.appendChild(group);
}

// 关闭属性面板
function closePropertiesPanel() {
    var overlay = document.querySelector('.overlay');
    var panel = document.querySelector('.properties-panel');

    if (overlay) {
        overlay.remove();
    }

    if (panel) {
        panel.remove();
    }
}

// 渲染函数
function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    var currentTime = Date.now();
    var deltaTime = 16; // 约60fps

    // 处理自动旋转
    if (selectedShape && autoRotate.speed > 0) {
        if (autoRotate.x) {
            selectedShape.thetaX += autoRotate.speed;
        }
        if (autoRotate.y) {
            selectedShape.thetaY += autoRotate.speed;
        }
        if (autoRotate.z) {
            selectedShape.thetaZ += autoRotate.speed;
        }

        // 更新控制面板显示
        updateControlPanel(selectedShape);
    }

    // 渲染每个形状
    for (var i = 0; i < shapes.length; i++) {
        var shape = shapes[i];

        // 更新动画
        shape.updateAnimation(deltaTime);

        // 获取几何数据
        var geometry = shape.getGeometry();

        if (geometry.vertices.length === 0) continue;

        // 创建和绑定顶点缓冲区
        var vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry.vertices), gl.STATIC_DRAW);

        gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(vPosition);

        // 创建和绑定颜色缓冲区
        var colorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry.colors), gl.STATIC_DRAW);

        gl.vertexAttribPointer(vColor, 4, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(vColor);

        // 设置uniform变量
        gl.uniform1f(thetaXLocation, shape.thetaX);
        gl.uniform1f(thetaYLocation, shape.thetaY);
        gl.uniform1f(thetaZLocation, shape.thetaZ);
        gl.uniform3fv(translationLocation, shape.translation);
        gl.uniform1f(scaleLocation, shape.scale);

        // 绘制形状
        var vertexCount = geometry.vertices.length / 3;

        if (shape.type === ShapeTypes.CIRCLE) {
            // 圆形使用三角形扇
            gl.drawArrays(gl.TRIANGLE_FAN, 0, vertexCount);
        } else {
            // 其他形状使用三角形
            gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
        }
    }

    requestAnimationFrame(render);
}
