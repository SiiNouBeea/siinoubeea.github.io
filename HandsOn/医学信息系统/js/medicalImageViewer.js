(() => {
    /* ---------- 全局变量 ---------- */
    let imgDom, canvas, ctx, imageContainer;
    let currentImageName = '';   // 不含扩展名
    let markers          = [];   // 标记数组
    let scale            = 1;
    let rotation         = 0;    // 旋转角度
    let translateX       = 0;    // X轴平移
    let translateY       = 0;    // Y轴平移
    let pendingMarker    = null;
    let hoverPopup       = null; // 悬浮小窗
    let selectedIdx      = -1;   // 当前编辑的标记索引
    let highlightedMarker = -1;  // 当前高亮的标记索引
    let isDragging       = false; // 是否正在拖动
    let lastMouseX       = 0;    // 上次鼠标X位置
    let lastMouseY       = 0;    // 上次鼠标Y位置

    /* ---------- 初始化 ---------- */
    function init() {
        console.log('初始化医学影像浏览器');
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => { initializeElements(); });
        } else { initializeElements(); }
    }

    function initializeElements() {
        imgDom           = document.getElementById('medicalImage');
        canvas           = document.getElementById('markerCanvas');
        ctx              = canvas.getContext('2d');
        imageContainer   = document.getElementById('imageContainer');

        if (!canvas) { console.error('未找到canvas元素！'); return; }

        bindEvents();
        resizeCanvas();
        createHoverPopup();
        createEditDrawer();
        setupSliders();
    }

    /* ---------- 创建悬浮小窗 DOM ---------- */
    function createHoverPopup() {
        hoverPopup = document.createElement('div');
        hoverPopup.className = 'marker-hover-popup';
        hoverPopup.style.display = 'none';
        document.body.appendChild(hoverPopup);
    }

    /* ---------- 创建右侧编辑抽屉 DOM ---------- */
    function createEditDrawer() {
        const drawer = document.createElement('div');
        drawer.id = 'editDrawer';
        drawer.innerHTML = `
            <h3>编辑标记</h3>
            <div class="field">
                <label>名称</label>
                <input type="text" id="editName">
            </div>
            <div class="field">
                <label>描述</label>
                <textarea id="editDesc" rows="3"></textarea>
            </div>
            <div class="field">
                <label>颜色</label>
                <input type="color" id="editColor" class="color-preview">
            </div>
            <button id="saveMarkerEdit">保存</button>
            <button id="closeDrawer" style="margin-left:10px">关闭</button>
        `;
        document.body.appendChild(drawer);

        // 确保关闭按钮正确绑定
        document.getElementById('closeDrawer').addEventListener('click', () => {
            drawer.classList.remove('open');
        });
        document.getElementById('saveMarkerEdit').onclick = saveMarkerEdit;
    }

    /* ---------- 设置滑块事件 ---------- */
    function setupSliders() {
        const zoomSlider = document.getElementById('zoomSlider');
        const rotateSlider = document.getElementById('rotateSlider');

        if (zoomSlider) {
            zoomSlider.addEventListener('input', (e) => {
                scale = parseFloat(e.target.value);
                applyTransform();
            });
        }

        if (rotateSlider) {
            rotateSlider.addEventListener('input', (e) => {
                rotation = parseInt(e.target.value);
                applyTransform();
            });
        }
    }

    /* ---------- 事件绑定 ---------- */
    function bindEvents() {
        console.log('绑定事件监听器');

        // 绑定文件输入事件
        const imageInput = document.getElementById('imageInput');
        const noteInput = document.getElementById('noteInput');

        if (imageInput) {
            imageInput.addEventListener('change', handleImageSelect);
        }

        if (noteInput) {
            noteInput.addEventListener('change', handleNoteImport);
        }

        // 绑定按钮事件
        const resetZoomBtn = document.getElementById('resetZoom');
        const resetRotateBtn = document.getElementById('resetRotate');
        const exportNoteBtn = document.getElementById('exportNote');

        if (resetZoomBtn) resetZoomBtn.addEventListener('click', resetZoom);
        if (resetRotateBtn) resetRotateBtn.addEventListener('click', resetRotate);
        if (exportNoteBtn) exportNoteBtn.addEventListener('click', exportNote);

        // 修改鼠标事件监听器 - 确保canvas存在
        if (canvas) {
            console.log('绑定canvas事件');
            canvas.addEventListener('contextmenu', onCanvasRightClick); // 右键点击添加标记
            canvas.addEventListener('click', onCanvasClick); // 左键点击选择标记
            canvas.addEventListener('mousemove', onCanvasMouseMove);
            canvas.addEventListener('mouseleave', hideHoverPopup);

            // 添加鼠标拖动事件
            canvas.addEventListener('mousedown', onCanvasMouseDown);
            canvas.addEventListener('mouseup', onCanvasMouseUp);
            canvas.addEventListener('mouseleave', onCanvasMouseUp);

            // 设置canvas为可接收指针事件
            canvas.style.pointerEvents = 'auto';
            canvas.style.cursor = 'grab'; // 默认显示抓取光标
        } else {
            console.error('Canvas元素未找到，无法绑定事件');
        }

        window.addEventListener('resize', resizeCanvas);

        // 阻止图像容器的默认右键菜单
        if (imageContainer) {
            imageContainer.addEventListener('contextmenu', (ev) => {
                console.log('阻止图像容器右键菜单');
                ev.preventDefault();
            });
        }

        // 阻止图片本身的默认右键菜单
        if (imgDom) {
            imgDom.addEventListener('contextmenu', (ev) => {
                console.log('阻止图片右键菜单');
                ev.preventDefault();
            });
        }

        console.log('事件绑定完成');
    }

    /* ---------- 鼠标拖动事件处理 ---------- */
    function onCanvasMouseDown(ev) {
        // 只在左键按下时开始拖动
        if (ev.button !== 0) return;

        // 检查是否点击到了标记，如果是则不开始拖动
        const idx = markerIndexAt(ev);
        if (idx >= 0) return;

        isDragging = true;
        lastMouseX = ev.clientX;
        lastMouseY = ev.clientY;
        canvas.style.cursor = 'grabbing'; // 拖动时显示抓取中光标
        ev.preventDefault();
    }

    function onCanvasMouseMove(ev) {
        // 处理悬浮提示
        const idx = markerIndexAt(ev);
        if (idx >= 0) {
            highlightedMarker = idx;
            showHoverPopup(ev.clientX, ev.clientY, markers[idx], idx);
            renderMarkers(); // 重新渲染以显示高亮效果
        } else {
            if (highlightedMarker !== -1) {
                highlightedMarker = -1;
                hideHoverPopup();
                renderMarkers(); // 重新渲染以移除高亮效果
            }
        }

        // 处理拖动
        if (isDragging) {
            const deltaX = ev.clientX - lastMouseX;
            const deltaY = ev.clientY - lastMouseY;

            translateX += deltaX;
            translateY += deltaY;

            lastMouseX = ev.clientX;
            lastMouseY = ev.clientY;

            applyTransform();
            ev.preventDefault();
        }
    }

    function onCanvasMouseUp(ev) {
        if (isDragging) {
            isDragging = false;
            canvas.style.cursor = 'grab'; // 恢复默认光标
        }
    }

    /* ---------- 右键点击画布添加标记 ---------- */
    function onCanvasRightClick(ev) {
        console.log('右键点击canvas事件触发', ev);
        ev.preventDefault(); // 阻止默认右键菜单

        if (!imgDom || !imgDom.src) {
            console.log('没有加载图像，无法添加标记');
            alert('请先打开一张医学影像！');
            return;
        }

        console.log('开始添加标记');
        addMarker(ev);
    }

    /* ---------- 左键点击画布选择标记 ---------- */
    function onCanvasClick(ev) {
        console.log('左键点击canvas事件触发');
        // 检测是否点击到现有标记，打开编辑抽屉
        const idx = markerIndexAt(ev);
        if (idx >= 0) {
            console.log('点击到标记，索引:', idx);
            selectedIdx = idx;
            openEditDrawer(markers[idx]);
        } else {
            console.log('未点击到标记');
        }
    }

    /* ---------- 图像加载 ---------- */
    function handleImageSelect(ev) {
        console.log('选择图像文件', ev.target.files[0]);
        const file = ev.target.files[0];
        if (!file) return;
        currentImageName = file.name.replace(/\.[^/.]+$/, "");
        const url = URL.createObjectURL(file);

        // 确保imgDom已初始化
        if (!imgDom) {
            imgDom = document.getElementById('medicalImage');
        }

        imgDom.onload = () => {
            console.log('图像加载完成');
            resetZoom();
            resetRotate();
            resizeCanvas();
            markers = [];
            renderMarkers();
            renderMarkerList();
        };
        imgDom.src = url;
    }

    /* ---------- 缩放 ---------- */
    function resetZoom() {
        scale = 1;
        translateX = 0;
        translateY = 0;
        const zoomSlider = document.getElementById('zoomSlider');
        if (zoomSlider) zoomSlider.value = scale;
        applyTransform();
    }

    function applyTransform() {
        if (imgDom) {
            imgDom.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale}) rotate(${rotation}deg)`;
        }
        renderMarkers(); // 立即重新渲染标记
    }

    /* ---------- 旋转 ---------- */
    function resetRotate() {
        rotation = 0;
        const rotateSlider = document.getElementById('rotateSlider');
        if (rotateSlider) rotateSlider.value = rotation;
        applyTransform();
    }

    /* ---------- 画布尺寸 ---------- */
    function resizeCanvas() {
        console.log('调整画布尺寸');
        if (!canvas) return;

        // 固定画布尺寸为1200x1200
        canvas.width = 1200;
        canvas.height = 1200;
        canvas.style.width = '1200px';
        canvas.style.height = '1200px';
        renderMarkers();
    }

    /* ---------- 添加标记 ---------- */
    function addMarker(ev) {
        console.log('开始添加标记处理');
        const mk = markerFromEvent(ev);
        console.log('从事件获取的标记坐标:', mk);

        const markerCount = markers.length + 1;
        const newMarker = {
            ...mk,
            name: `标记${markerCount}`,
            desc: '',
            createTime: formatDateTime(new Date()),
            updateTime: ''
        };

        console.log('新标记对象:', newMarker);
        markers.push(newMarker);
        console.log('标记数组当前长度:', markers.length);

        renderMarkers();
        renderMarkerList();
        console.log('标记添加完成');
    }

    /* ---------- 悬浮/隐藏小窗 ---------- */
    function showHoverPopup(clientX, clientY, mk, idx) {
        if (!hoverPopup) return;

        hoverPopup.innerHTML = `
            <div class="title">${mk.name || '标记' + (idx + 1)}</div>
            <div>${mk.desc || '无描述'}</div>
            <div class="time">创建：${mk.createTime}<br>更新：${mk.updateTime || '无'}</div>
        `;

        // 先显示元素以获取其尺寸
        hoverPopup.style.display = 'block';

        // 计算悬浮窗位置，避免超出屏幕
        const popupWidth = hoverPopup.offsetWidth;
        const popupHeight = hoverPopup.offsetHeight;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        let left = clientX + 10;
        let top = clientY - popupHeight - 10;

        // 如果悬浮窗超出右边界，调整到左侧
        if (left + popupWidth > windowWidth) {
            left = clientX - popupWidth - 10;
        }

        // 如果悬浮窗超出上边界，调整到下方
        if (top < 0) {
            top = clientY + 20;
        }

        hoverPopup.style.left = left + 'px';
        hoverPopup.style.top = top + 'px';
    }

    function hideHoverPopup() {
        if (hoverPopup) {
            hoverPopup.style.display = 'none';
        }
    }

    /* ---------- 编辑抽屉打开/保存 ---------- */
    function openEditDrawer(mk, idx) {
        const editName = document.getElementById('editName');
        const editDesc = document.getElementById('editDesc');
        const editColor = document.getElementById('editColor');
        const editDrawer = document.getElementById('editDrawer');

        if (editName) editName.value = mk.name;
        if (editDesc) editDesc.value = mk.desc;
        if (editColor) editColor.value = mk.color;
        if (editDrawer) editDrawer.classList.add('open');

        // 更新选中状态
        updateSelectedMarker(idx);
    }

    function updateSelectedMarker(idx) {
        // 移除所有选中状态
        const markerItems = document.querySelectorAll('.marker-item');
        markerItems.forEach(item => {
            item.classList.remove('selected');
        });

        // 添加当前选中状态
        if (idx >= 0) {
            const selectedItem = document.querySelector(`.marker-content[data-idx="${idx}"]`)?.closest('.marker-item');
            if (selectedItem) {
                selectedItem.classList.add('selected');
            }
        }
    }

    function saveMarkerEdit() {
        if (selectedIdx < 0) return;
        const mk = markers[selectedIdx];

        const editName = document.getElementById('editName');
        const editDesc = document.getElementById('editDesc');
        const editColor = document.getElementById('editColor');
        const editDrawer = document.getElementById('editDrawer');

        if (editName) mk.name = editName.value.trim();
        if (editDesc) mk.desc = editDesc.value.trim();
        if (editColor) mk.color = editColor.value;

        mk.updateTime = formatDateTime(new Date());

        if (editDrawer) editDrawer.classList.remove('open');

        renderMarkers();
        renderMarkerList(); // 重新渲染列表以更新显示
    }

    /* ---------- 绘制标记（倒立水滴形状） ---------- */
    function renderMarkers() {
        console.log('开始渲染标记，标记数量:', markers.length);
        if (!ctx || !canvas) {
            console.error('Canvas上下文不可用');
            return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!imgDom || !imgDom.src) {
            console.log('没有图像源，跳过渲染');
            return;
        }

        // 保存当前canvas状态
        ctx.save();

        // 获取图像在容器中的位置
        const containerWidth = 1200;
        const containerHeight = 1200;
        const imgWidth = imgDom.offsetWidth;
        const imgHeight = imgDom.offsetHeight;
        const offsetX = (containerWidth - imgWidth) / 2;
        const offsetY = (containerHeight - imgHeight) / 2;

        // 计算图像中心点
        const centerX = offsetX + imgWidth / 2;
        const centerY = offsetY + imgHeight / 2;

        // 应用与图像完全相同的变换
        // 1. 先平移到图像中心
        ctx.translate(centerX, centerY);
        // 2. 应用旋转（与图像相同）
        ctx.rotate(rotation * Math.PI / 180);
        // 3. 应用缩放（与图像相同）
        ctx.scale(scale, scale);
        // 4. 应用平移（与图像相同）
        ctx.translate(translateX / scale, translateY / scale);
        // 5. 平移回图像中心
        ctx.translate(-centerX, -centerY);

        // 计算缩放比例
        const scaleX = imgWidth / imgDom.naturalWidth;
        const scaleY = imgHeight / imgDom.naturalHeight;

        markers.forEach((m, idx) => {
            // 计算标记在画布上的位置
            const cx = m.x * scaleX + offsetX;
            const cy = m.y * scaleY + offsetY;

            // 如果是高亮标记，则放大绘制
            if (idx === highlightedMarker) {
                drawMarker(cx, cy, m.color, 1.5);
            } else {
                drawMarker(cx, cy, m.color);
            }
        });

        // 恢复canvas状态
        ctx.restore();
        console.log('标记渲染完成');
    }

    function drawMarker(x, y, color, scaleFactor = 1) {
        console.log('绘制标记:', {x, y, color, scaleFactor});

        // 保存标记绘制前的状态
        ctx.save();

        ctx.fillStyle = color;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;

        const size = 12 * scaleFactor; // 减小基础尺寸

        // 绘制倒立水滴形状（类似地图标记）
        ctx.beginPath();

        // 上部圆形部分
        ctx.arc(x, y - size * 0.3, size * 0.6, 0, Math.PI * 2, false);

        // 下部尖角部分
        ctx.moveTo(x - size * 0.4, y - size * 0.3);
        ctx.lineTo(x, y + size * 0.7);
        ctx.lineTo(x + size * 0.4, y - size * 0.3);

        ctx.closePath();

        ctx.fill();
        ctx.stroke();

        // 添加内部高光效果
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(x - size * 0.15, y - size * 0.45, size * 0.2, 0, Math.PI * 2, false);
        ctx.fill();

        // 恢复标记绘制前的状态
        ctx.restore();
    }

    /* ---------- 标记列表 ---------- */
    function renderMarkerList() {
        console.log('渲染标记列表，标记数量:', markers.length);
        const box = document.getElementById('markerItems');
        if (!box) {
            console.error('未找到markerItems元素');
            return;
        }

        box.innerHTML = '';
        markers.forEach((m, idx) => {
            const div = document.createElement('div');
            div.className = 'marker-item';
            div.innerHTML = `
                <div class="marker-content" data-idx="${idx}">
                    <div style="display:flex;align-items:center">
                        <span class="color-box" style="background:${m.color}"></span>
                        <span>${m.name || '标记' + (idx + 1)}</span>
                    </div>
                </div>
                <button data-idx="${idx}" style="padding:2px 6px;font-size:12px">删除</button>
            `;

            // 为标记内容添加点击事件
            const markerContent = div.querySelector('.marker-content');
            markerContent.addEventListener('click', (ev) => {
                console.log('点击标记列表项，索引:', idx);
                selectedIdx = idx;
                openEditDrawer(markers[idx]);
                ev.stopPropagation(); // 阻止事件冒泡
            });

            // 为删除按钮添加点击事件
            div.querySelector('button').addEventListener('click', (ev) => {
                markers.splice(parseInt(ev.target.dataset.idx), 1);
                renderMarkers();
                renderMarkerList();
                ev.stopPropagation(); // 阻止事件冒泡
            });

            box.appendChild(div);
        });
    }

    /* ---------- 导出 .note ---------- */
    function exportNote() {
        if (!currentImageName) {
            alert('请先打开一张医学影像！'); return;
        }
        const noteObj = {
            version: 1,
            imageName: currentImageName,
            createTime: new Date().toISOString(),
            markers: markers
        };
        const blob = new Blob([JSON.stringify(noteObj, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.style.display = 'none';
        document.body.appendChild(a);
        a.href = url;
        a.download = currentImageName + '.note';
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /* ---------- 导入 .note ---------- */
    function handleNoteImport(ev) {
        const file = ev.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const obj = JSON.parse(e.target.result);
                if (!obj.imageName || !Array.isArray(obj.markers)) throw new Error('格式错误');
                if (obj.imageName !== currentImageName) {
                    if (!confirm(`note 对应图像为 "${obj.imageName}"，与当前图像不匹配，仍要加载吗？`)) return;
                }
                markers = obj.markers;
                renderMarkers();
                renderMarkerList();
            } catch (err) {
                alert('note 文件解析失败：' + err.message);
            }
        };
        reader.readAsText(file);
    }

    /* ---------- 工具函数 ---------- */
    function markerFromEvent(ev) {
        console.log('从事件计算标记坐标');
        if (!canvas) {
            console.error('Canvas未初始化');
            return {x: 0, y: 0, color: '#ff0000'};
        }

        const rect = imageContainer.getBoundingClientRect();
        const containerScrollLeft = imageContainer.scrollLeft;
        const containerScrollTop = imageContainer.scrollTop;

        // 获取鼠标在容器中的位置（考虑滚动）
        const mouseX = ev.clientX - rect.left + containerScrollLeft;
        const mouseY = ev.clientY - rect.top + containerScrollTop;

        console.log('鼠标位置:', {mouseX, mouseY, translateX, translateY, scale});

        // 计算图像在容器中的位置
        const containerWidth = 1200;
        const containerHeight = 1200;
        const imgWidth = imgDom.offsetWidth;
        const imgHeight = imgDom.offsetHeight;
        const offsetX = (containerWidth - imgWidth) / 2;
        const offsetY = (containerHeight - imgHeight) / 2;

        // 计算图像中心点
        const centerX = offsetX + imgWidth / 2;
        const centerY = offsetY + imgHeight / 2;

        // 应用反向变换（与渲染时相反的顺序）
        // 1. 先减去平移
        let x = mouseX - translateX;
        let y = mouseY - translateY;

        // 2. 平移到图像中心
        x = x - centerX;
        y = y - centerY;

        // 3. 应用反向缩放
        x = x / scale;
        y = y / scale;

        // 4. 应用反向旋转
        const rad = -rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const rotatedX = x * cos - y * sin;
        const rotatedY = x * sin + y * cos;

        // 5. 平移回原位置
        x = rotatedX + centerX;
        y = rotatedY + centerY;

        console.log('应用反向变换后的坐标:', {x, y});

        // 转换为相对于图像的坐标
        const imgX = x - offsetX;
        const imgY = y - offsetY;

        console.log('相对于图像的坐标:', {imgX, imgY});

        // 转换为原始图像坐标
        const originalX = (imgX / imgWidth) * imgDom.naturalWidth;
        const originalY = (imgY / imgHeight) * imgDom.naturalHeight;

        console.log('原始图像坐标:', {originalX, originalY});

        return {
            x: originalX,
            y: originalY,
            color: document.getElementById('markerColor') ? document.getElementById('markerColor').value : '#ff0000'
        };
    }

    function markerIndexAt(ev) {
        if (!canvas || !imgDom) return -1;

        const rect = imageContainer.getBoundingClientRect();
        const containerScrollLeft = imageContainer.scrollLeft;
        const containerScrollTop = imageContainer.scrollTop;

        // 获取鼠标在容器中的位置（考虑滚动）
        const mouseX = ev.clientX - rect.left + containerScrollLeft;
        const mouseY = ev.clientY - rect.top + containerScrollTop;

        // 计算图像在容器中的位置
        const containerWidth = 1200;
        const containerHeight = 1200;
        const imgWidth = imgDom.offsetWidth;
        const imgHeight = imgDom.offsetHeight;
        const offsetX = (containerWidth - imgWidth) / 2;
        const offsetY = (containerHeight - imgHeight) / 2;

        // 计算图像中心点
        const centerX = offsetX + imgWidth / 2;
        const centerY = offsetY + imgHeight / 2;

        // 计算缩放比例
        const scaleX = imgWidth / imgDom.naturalWidth;
        const scaleY = imgHeight / imgDom.naturalHeight;

        for (let i = markers.length - 1; i >= 0; i--) {
            const m = markers[i];

            // 计算标记在画布上的基本位置（不考虑变换）
            const markerBaseX = m.x * scaleX + offsetX;
            const markerBaseY = m.y * scaleY + offsetY;

            // 应用与渲染相同的变换到标记位置
            // 1. 平移到图像中心
            let markerX = markerBaseX - centerX;
            let markerY = markerBaseY - centerY;

            // 2. 应用旋转
            const rad = rotation * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const rotatedMarkerX = markerX * cos - markerY * sin;
            const rotatedMarkerY = markerX * sin + markerY * cos;

            // 3. 应用缩放
            markerX = rotatedMarkerX * scale;
            markerY = rotatedMarkerY * scale;

            // 4. 应用平移
            markerX = markerX + centerX + translateX;
            markerY = markerY + centerY + translateY;

            // 检测点击位置是否在标记附近
            const distance = Math.hypot(mouseX - markerX, mouseY - markerY);
            const hitRadius = 20 / scale; // 根据缩放调整检测半径

            if (distance < hitRadius) return i;
        }
        return -1;
    }

    function formatDateTime(dt) {
        const pad = n => n.toString().padStart(2, '0');
        return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())} ` +
               `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
    }

    /* ---------- 启动 ---------- */
    console.log('启动医学影像浏览器');
    init();
})();