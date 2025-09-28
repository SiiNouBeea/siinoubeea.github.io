"use strict";
const {vec3} = glMatrix;

let gl, program;
let points = [];
let numTimesToSubdivide = 0;
let theta = 60;          // 整体旋转角（度）
let twist = false;       // 是否启用距离扭转
let twistStrength = 0;   // 扭转强度（度）

const radius = 1.0;
let levelSlider, angleSlider, twistSlider;

window.onload = function initTriangles(){
    const canvas = document.getElementById("gl-canvas");
    gl = canvas.getContext("webgl2");
    if(!gl){ alert("WebGL 2.0 not available"); return; }

    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1.0, 1.0, 1.0, 1.0);

    levelSlider  = document.getElementById("level-slider");
    angleSlider  = document.getElementById("angle-slider");
    twistSlider  = document.getElementById("twist-slider");

    numTimesToSubdivide = +levelSlider.value;
    theta               = +angleSlider.value;
    twistStrength       = +twistSlider.value;
    twist               = (twistStrength !== 0);

    levelSlider.addEventListener("input", updateLevel);
    angleSlider.addEventListener("input", updateAngle);
    twistSlider.addEventListener("input", updateTwist);

    rebuildAndDraw();
};

/* -------------------- 实时回调 -------------------- */
function updateLevel(){
    numTimesToSubdivide = +levelSlider.value;
    document.getElementById("levShow").textContent = numTimesToSubdivide;
    rebuildAndDraw();
}
function updateAngle(){
    theta = +angleSlider.value;
    document.getElementById("angShow").textContent = theta + "°";
    rebuildAndDraw();
}
function updateTwist(){
    twistStrength = +twistSlider.value;
    document.getElementById("twistShow").textContent = twistStrength + "°";
    twist = (twistStrength !== 0);
    rebuildAndDraw();
}

/* -------------------- 核心绘制 -------------------- */
function rebuildAndDraw(){
    points = [];
    const ang90 = 90 * Math.PI / 180;
    const u = vec3.fromValues(radius*Math.cos(ang90),
                              radius*Math.sin(ang90), 0);
    const v = vec3.fromValues(radius*Math.cos(ang90 + 2*Math.PI/3),
                              radius*Math.sin(ang90 + 2*Math.PI/3), 0);
    const w = vec3.fromValues(radius*Math.cos(ang90 + 4*Math.PI/3),
                              radius*Math.sin(ang90 + 4*Math.PI/3), 0);
    divideTriangle(u, v, w, numTimesToSubdivide);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);

    const vPos = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPos, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPos);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.LINES, 0, points.length / 3);
}

/* -------------------- 递归细分 -------------------- */
function divideTriangle(a, b, c, count){
    if(count === 0){
        tessellaTriangle(a, b, c);
    }else{
        const ab=vec3.create(), ac=vec3.create(), bc=vec3.create();
        vec3.lerp(ab, a, b, 0.5);
        vec3.lerp(ac, a, c, 0.5);
        vec3.lerp(bc, b, c, 0.5);
        --count;
        divideTriangle(a, ab, ac, count);
        divideTriangle(ab, b, bc, count);
        divideTriangle(ac, bc, c, count);
        divideTriangle(ab, bc, ac, count);
    }
}

/* -------------------- 单三角形输出（含扭转） -------------------- */
function tessellaTriangle(a, b, c){
    const zer = vec3.create();
    vec3.zero(zer);
    const radRot  = theta * Math.PI / 180.0;
    const radTwist= twistStrength * Math.PI / 180.0;

    const an = vec3.create(), bn = vec3.create(), cn = vec3.create();

    if(!twist){   // 仅整体旋转
        vec3.rotateZ(an, a, zer, radRot);
        vec3.rotateZ(bn, b, zer, radRot);
        vec3.rotateZ(cn, c, zer, radRot);
    }else{        // 实验 e：距离加权扭转
        const da = Math.hypot(a[0], a[1]),
              db = Math.hypot(b[0], b[1]),
              dc = Math.hypot(c[0], c[1]);
        vec3.set(an,
            a[0]*Math.cos(da*radTwist) - a[1]*Math.sin(da*radTwist),
            a[0]*Math.sin(da*radTwist) + a[1]*Math.cos(da*radTwist), 0);
        vec3.set(bn,
            b[0]*Math.cos(db*radTwist) - b[1]*Math.sin(db*radTwist),
            b[0]*Math.sin(db*radTwist) + b[1]*Math.cos(db*radTwist), 0);
        vec3.set(cn,
            c[0]*Math.cos(dc*radTwist) - c[1]*Math.sin(dc*radTwist),
            c[0]*Math.sin(dc*radTwist) + c[1]*Math.cos(dc*radTwist), 0);
        // 再整体旋转
        vec3.rotateZ(an, an, zer, radRot);
        vec3.rotateZ(bn, bn, zer, radRot);
        vec3.rotateZ(cn, cn, zer, radRot);
    }

    // 输出 6 顶点（线框）
    points.push(an[0],an[1],an[2], bn[0],bn[1],bn[2],
                bn[0],bn[1],bn[2], cn[0],cn[1],cn[2],
                cn[0],cn[1],cn[2], an[0],an[1],an[2]);
}