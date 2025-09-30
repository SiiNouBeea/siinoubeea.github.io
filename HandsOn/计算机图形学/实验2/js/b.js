"use strict";
const {vec3, vec4, mat4} = glMatrix;

let gl, program2D, program3D, buf;
let level = 3;
let dim   = 2;
let rotX  = -0.4, rotY = 0;

const tri2D = [
    vec3.fromValues(-1,-1,0),
    vec3.fromValues( 0, 1,0),
    vec3.fromValues( 1,-1,0)
];

const tet3D = [
    vec3.fromValues( 0.0000, 0.0000, -1.0000),
    vec3.fromValues( 0.0000, 0.9428, 0.3333),
    vec3.fromValues(-0.8165, -0.4714, 0.3333),
    vec3.fromValues( 0.8165, -0.4714, 0.3333)
];

window.onload = () => {
    const canvas = document.getElementById("gl-canvas");
    gl = canvas.getContext("webgl2", {antialias:true});
    if(!gl){ alert("WebGL2 unavailable"); return; }

    program2D = initShaders(gl, "vs2d", "fs2d");
    program3D = initShaders(gl, "vertex-shader", "fragment-shader");

    buf = gl.createBuffer();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1,1,1,1);
    gl.enable(gl.DEPTH_TEST);

    canvas.onmousemove = e => {
        if(e.buttons){
            rotY += e.movementX * 0.01;
            rotX += e.movementY * 0.01;
            redraw();
        }
    };

    syncUI();
};

function syncUI(){
    level = +document.getElementById("levelSlider").value;
    dim   = +document.getElementById("dimSel").value;
    document.getElementById("levShow").textContent = level;
    document.getElementById("dimText").textContent =
          dim===2 ? "2D Triangle" : "3D Tetrahedron";
    redraw();
}

function redraw(){
    if(dim === 2){
        gl.useProgram(program2D);
        const pts = [];
        gasket2D(tri2D[0],tri2D[1],tri2D[2], level, pts);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.STATIC_DRAW);
        const vPos = gl.getAttribLocation(program2D, "vPosition");
        gl.vertexAttribPointer(vPos, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(vPos);
        const id = mat4.create();
        gl.uniformMatrix4fv(gl.getUniformLocation(program2D, "uMVP"), false, id);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, pts.length/3);
    }else{
        gl.useProgram(program3D);

        let points = [];
        let colors = [];

        const t = tet3D[0];
        const u = tet3D[1];
        const v = tet3D[2];
        const w = tet3D[3];

        divideTetra(t, u, v, w, level, points, colors);

        // 创建并绑定顶点位置缓冲区
        const vBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);

        const vPosition = gl.getAttribLocation(program3D, "vPosition");
        gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(vPosition);

        // 创建并绑定顶点颜色缓冲区
        const cBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

        const aColor = gl.getAttribLocation(program3D, "aColor");
        gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(aColor);

        /* 添加 MVP 矩阵（保留鼠标旋转） */
        const proj = mat4.create();
        mat4.perspective(proj, Math.PI/3, 1, 0.1, 10);
        const view = mat4.create();
        mat4.lookAt(view, [0,0,3.5], [0,0,0], [0,1,0]);
        const model = mat4.create();
        mat4.rotateX(model, model, rotX);
        mat4.rotateY(model, model, rotY);
        let mvp = mat4.create();
        mat4.multiply(mvp, proj, view);
        mat4.multiply(mvp, mvp, model);
        gl.uniformMatrix4fv(gl.getUniformLocation(program3D, "uMVP"), false, mvp);

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, points.length/3);
    }
}


function gasket2D(a,b,c,depth,out){
    if(depth===0){
        out.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2]);
        return;
    }
    const ab=vec3.create(), ac=vec3.create(), bc=vec3.create();
    vec3.lerp(ab,a,b,0.5); vec3.lerp(ac,a,c,0.5); vec3.lerp(bc,b,c,0.5);
    --depth;
    gasket2D(a, ab,ac, depth,out);
    gasket2D(ab,b, bc, depth,out);
    gasket2D(ac,bc,c, depth,out);
}

function triangle(a, b, c, color, points, colors) {
    var baseColor = [
        1.0, 0.0, 0.0, 1.0,
        0.0, 1.0, 0.0, 1.0,
        0.0, 0.0, 1.0, 1.0,
        1.0, 1.0, 0.0, 1.0
    ];

    for (var k = 0; k < 4; k++) {
        colors.push(baseColor[color * 4 + k]);
    }
    for (var k = 0; k < 3; k++)
        points.push(a[k]);

    for (var k = 0; k < 4; k++) {
        colors.push(baseColor[color * 4 + k]);
    }
    for (var k = 0; k < 3; k++)
        points.push(b[k]);

    for (var k = 0; k < 4; k++) {
        colors.push(baseColor[color * 4 + k]);
    }
    for (var k = 0; k < 3; k++)
        points.push(c[k]);
}

function tetra(a, b, c, d, points, colors) {
    triangle(a, c, b, 0, points, colors);
    triangle(a, c, d, 1, points, colors);
    triangle(a, b, d, 2, points, colors);
    triangle(b, c, d, 3, points, colors);
}

function divideTetra(a, b, c, d, count, points, colors) {
    if (count == 0) {
        tetra(a, b, c, d, points, colors);
    } else {
        var ab = vec3.create();
        glMatrix.vec3.lerp(ab, a, b, 0.5);
        var ac = vec3.create();
        glMatrix.vec3.lerp(ac, a, c, 0.5);
        var ad = vec3.create();
        glMatrix.vec3.lerp(ad, a, d, 0.5);
        var bc = vec3.create();
        glMatrix.vec3.lerp(bc, b, c, 0.5);
        var bd = vec3.create();
        glMatrix.vec3.lerp(bd, b, d, 0.5);
        var cd = vec3.create();
        glMatrix.vec3.lerp(cd, c, d, 0.5);

        --count;

        divideTetra(a, ab, ac, ad, count, points, colors);
        divideTetra(ab, b, bc, bd, count, points, colors);
        divideTetra(ac, bc, c, cd, count, points, colors);
        divideTetra(ad, bd, cd, d, count, points, colors);
    }
}
