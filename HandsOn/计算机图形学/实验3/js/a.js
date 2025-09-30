"use strict";

const geom = {
    square:  new Float32Array([ 0.5,0.5, -0.5,0.5, 0.5,-0.5, -0.5,-0.5 ]),
    triangle:new Float32Array([ 0.0,0.6, -0.5,-0.4, 0.5,-0.4 ]),
    circle:  (()=>{
        const v=[0,0], N=60;
        for(let i=0;i<=N;i++){
            const a = i/N * 2.0*Math.PI;
            v.push(0.5*Math.cos(a), 0.5*Math.sin(a));
        }
        return new Float32Array(v);
    })()
};

let gl, prog, vbo={}, param={tx:0,ty:0,rot:0,sx:1,sy:1,r:1,g:0,b:0,shape:'square'};

let autoRot = false, rotSpeed = 0, rotDir = 1;

function init2D(){
    const canvas = document.getElementById("glcanvas");
    gl = WebGLUtils.setupWebGL(canvas);
    if(!gl){ alert("WebGL 不可用"); return; }
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.clearColor(1,1,1,1);

    prog = initShaders(gl, "vertexShader", "fragmentShader");
    for(let k in geom){
        vbo[k] = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo[k]);
        gl.bufferData(gl.ARRAY_BUFFER, geom[k], gl.STATIC_DRAW);
    }

    document.getElementById("shapeSel").onchange = e => param.shape=e.target.value;
    const reg=(id,prop,scale)=>document.getElementById(id).addEventListener('input',e=>param[prop]=Number(e.target.value)/(scale||1));
    reg("colR","r",100); reg("colG","g",100); reg("colB","b",100);
    reg("tx","tx",100); reg("ty","ty",100);
    reg("sx","sx",100); reg("sy","sy",100);

    document.getElementById('autoX').onchange  = e => autoRot = e.target.checked;
    document.getElementById('speedX').oninput  = e => rotSpeed = Number(e.target.value)*0.1;
    document.getElementById('btnDirX').onclick = () => rotDir *= -1;
    document.getElementById('btnReset').onclick = resetAll;

    render();
}

function resetAll(){
    param = {tx:0,ty:0,rot:0,sx:1,sy:1,r:1,g:0,b:0,shape:'square'};
    ['shapeSel','colR','colG','colB','tx','ty','sx','sy'].forEach(id=>{
        const el=document.getElementById(id);
        if(id==='shapeSel') el.value='square';
        else                el.value=el.getAttribute('value');
    });
    autoRot=false; rotSpeed=0; rotDir=1;
    document.getElementById('autoX').checked=false;
    document.getElementById('speedX').value=0;
}

function render(){
    if(autoRot){
        param.rot += rotSpeed*rotDir;
    }

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);

    const g = geom[param.shape];
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo[param.shape]);
    const aloc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aloc);
    gl.vertexAttribPointer(aloc, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(gl.getUniformLocation(prog, "uRot"), param.rot * Math.PI/180);
    gl.uniform2f(gl.getUniformLocation(prog, "uTrans"), param.tx, param.ty);
    gl.uniform2f(gl.getUniformLocation(prog, "uScale"), param.sx, param.sy);
    gl.uniform3f(gl.getUniformLocation(prog, "uColor"), param.r, param.g, param.b);

    const mode = (param.shape==='circle') ? gl.TRIANGLE_FAN : gl.TRIANGLE_STRIP;
    gl.drawArrays(mode, 0, g.length/2);

    requestAnimationFrame(render);
}