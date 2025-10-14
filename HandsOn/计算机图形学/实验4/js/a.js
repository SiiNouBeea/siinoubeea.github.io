"use strict";

var canvas;
var gl;

var points = [];
var colors = [];

var rotationAxis = 'x'; // 默认旋转轴
var thetaX = 0.0; // X轴旋转角度
var thetaY = 0.0; // Y轴旋转角度
var thetaZ = 0.0; // Z轴旋转角度

var thetaXLocation;
var thetaYLocation;
var thetaZLocation;

var colorHex = '#FF0000'; // 默认颜色

var vertices = [
    -0.5, -0.5, 0.5,
    -0.5, 0.5, 0.5,
    0.5, 0.5, 0.5,
    0.5, -0.5, 0.5,
    -0.5, -0.5, -0.5,
    -0.5, 0.5, -0.5,
    0.5, 0.5, -0.5,
    0.5, -0.5, -0.5
];

var vertexColors = [
    1.0, 0.0, 0.0, 1.0,
    1.0, 1.0, 0.0, 1.0,
    0.0, 1.0, 0.0, 1.0,
    0.0, 0.0, 1.0, 1.0,
    1.0, 0.0, 1.0, 1.0,
    0.0, 1.0, 1.0, 1.0,
    0.0, 0.0, 0.0, 1.0,
    1.0, 1.0, 1.0, 1.0
];

var faces = [
    1, 0, 3,
    3, 2, 1,
    2, 3, 7,
    7, 6, 2,
    3, 0, 4,
    4, 7, 3,
    6, 5, 1,
    1, 2, 6,
    4, 5, 6,
    6, 7, 4,
    5, 4, 0,
    0, 1, 5
];

var program;

function initCube() {
    canvas = document.getElementById("gl-canvas");
    gl = canvas.getContext("webgl2");
    if (!gl) {
        alert("WebGL isn't available");
        return;
    }

    // 构建立方体
    for (let i = 0; i < faces.length; i++) {
        points.push(vertices[faces[i] * 3], vertices[faces[i] * 3 + 1], vertices[faces[i] * 3 + 2]);
        colors.push(vertexColors[faces[i] * 4], vertexColors[faces[i] * 4 + 1], vertexColors[faces[i] * 4 + 2], vertexColors[faces[i] * 4 + 3]);
    }

    // 设置视口和清除颜色
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1.0, 1.0, 1.0, 1.0);

    // 启用深度测试
    gl.enable(gl.DEPTH_TEST);

    // 初始化着色器
    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    // 设置顶点缓冲区
    var vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);

    var vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    // 设置颜色缓冲区
    var cBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

    var vColor = gl.getAttribLocation(program, "vColor");
    gl.vertexAttribPointer(vColor, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vColor);

    // 获取旋转角度的uniform位置
    thetaXLocation = gl.getUniformLocation(program, "thetaX");
    thetaYLocation = gl.getUniformLocation(program, "thetaY");
    thetaZLocation = gl.getUniformLocation(program, "thetaZ");

    render();
}

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 更新旋转角度（根据当前旋转轴）
    if (rotationAxis === 'x') {
        thetaX += 0.01;
        gl.uniform1f(thetaXLocation, thetaX);
    } else if (rotationAxis === 'y') {
        thetaY += 0.01;
        gl.uniform1f(thetaYLocation, thetaY);
    } else if (rotationAxis === 'z') {
        thetaZ += 0.01;
        gl.uniform1f(thetaZLocation, thetaZ);
    }

    // 绘制立方体
    gl.drawArrays(gl.TRIANGLES, 0, points.length / 3);

    // 动画循环
    requestAnimationFrame(render);
}

function changeAxis(axis) {
    rotationAxis = axis;
    console.log(`切换到${axis}轴旋转`);
}

function clearCanvas() {
    // 重置场景
    points = [];
    colors = [];
    thetaX = 0.0;
    thetaY = 0.0;
    thetaZ = 0.0;
    initCube();
}

function updateColor() {
    const colorPicker = document.getElementById("colorPicker");
    colorHex = colorPicker.value;
    console.log(`颜色已更新为: ${colorHex}`);

    // 更新颜色缓冲区
    for (let i = 0; i < colors.length; i += 4) {
        colors[i] = parseInt(colorPicker.value.slice(1, 3), 16) / 255;
        colors[i + 1] = parseInt(colorPicker.value.slice(3, 5), 16) / 255;
        colors[i + 2] = parseInt(colorPicker.value.slice(5, 7), 16) / 255;
        colors[i + 3] = 1.0;
    }

    // 重新绑定颜色缓冲区
    var cBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

    var vColor = gl.getAttribLocation(program, "vColor");
    gl.vertexAttribPointer(vColor, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vColor);

    render();
}