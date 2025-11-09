// 全局状态
const state = {
    files: [], // 存储所有文件 {name, content}
    currentFileIndex: -1, // 当前选中的文件索引
    isDoubleColumn: false, // 是否双列模式
    leftColumnFileIndex: -1, // 左列显示的文件索引
    rightColumnFileIndex: -1 // 右列显示的文件索引
};

// DOM元素
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const singleColumn = document.getElementById('singleColumn');
const doubleColumn = document.getElementById('doubleColumn');
const leftColumn = document.getElementById('leftColumn');
const rightColumn = document.getElementById('rightColumn');
const toggleViewBtn = document.getElementById('toggleView');
const vsdxModal = document.getElementById('vsdxModal');
const closeModalBtn = document.getElementById('closeModal');
const vsdxContent = document.getElementById('vsdxContent');

// 初始化
function init() {
    // 绑定事件监听器
    fileInput.addEventListener('change', handleFileSelect);
    toggleViewBtn.addEventListener('click', toggleView);
    closeModalBtn.addEventListener('click', closeVsdxModal);

    // 初始化VSX浮窗拖拽功能
    initModalDrag();
}

// 处理文件选择
function handleFileSelect(event) {
    const selectedFiles = event.target.files;

    if (selectedFiles.length === 0) return;

    // 读取每个选中的文件
    Array.from(selectedFiles).forEach(file => {
        // 检查是否已存在同名文件
        if (state.files.some(f => f.name === file.name)) {
            alert(`文件 "${file.name}" 已存在！`);
            return;
        }

        const reader = new FileReader();

        reader.onload = function(e) {
            const content = e.target.result;

            // 添加到状态
            state.files.push({
                name: file.name,
                content: content
            });

            // 更新文件列表
            updateFileList();

            // 如果是第一个文件，自动显示
            if (state.files.length === 1) {
                displayFile(0);
            }
        };

        reader.readAsText(file);
    });

    // 重置文件输入，允许选择相同的文件
    fileInput.value = '';
}

// 更新文件列表UI
function updateFileList() {
    fileList.innerHTML = '';

    state.files.forEach((file, index) => {
        const li = document.createElement('li');
        li.className = 'file-item';
        if (index === state.currentFileIndex ||
            index === state.leftColumnFileIndex ||
            index === state.rightColumnFileIndex) {
            li.classList.add('active');
        }
        li.textContent = file.name;
        li.addEventListener('click', () => displayFile(index));
        fileList.appendChild(li);
    });
}

// 显示文件内容
function displayFile(index) {
    if (index < 0 || index >= state.files.length) return;

    const file = state.files[index];

    if (state.isDoubleColumn) {
        // 双列模式
        // 如果当前没有文件在左列，放在左列
        if (state.leftColumnFileIndex === -1) {
            state.leftColumnFileIndex = index;
            leftColumn.innerHTML = `<div class="markdown-content">${parseMarkdown(file.content)}</div>`;
        }
        // 如果左列已有文件，放在右列
        else if (state.rightColumnFileIndex === -1) {
            state.rightColumnFileIndex = index;
            rightColumn.innerHTML = `<div class="markdown-content">${parseMarkdown(file.content)}</div>`;
        }
        // 如果两列都有文件，替换当前非活动列
        else {
            // 简单的替换策略：替换与当前点击不同的列
            if (state.leftColumnFileIndex === state.currentFileIndex) {
                state.rightColumnFileIndex = index;
                rightColumn.innerHTML = `<div class="markdown-content">${parseMarkdown(file.content)}</div>`;
            } else {
                state.leftColumnFileIndex = index;
                leftColumn.innerHTML = `<div class="markdown-content">${parseMarkdown(file.content)}</div>`;
            }
        }

        // 更新当前文件索引
        state.currentFileIndex = index;

        // 确保双列视图可见
        if (singleColumn.classList.contains('hidden') === false) {
            singleColumn.classList.add('hidden');
            doubleColumn.classList.remove('hidden');
        }
    } else {
        // 单列模式
        state.currentFileIndex = index;
        singleColumn.innerHTML = `<div class="markdown-content">${parseMarkdown(file.content)}</div>`;

        // 确保单列视图可见
        if (doubleColumn.classList.contains('hidden') === false) {
            doubleColumn.classList.add('hidden');
            singleColumn.classList.remove('hidden');
        }
    }

    // 更新文件列表高亮
    updateFileList();

    // 为VSX图片添加点击事件
    setTimeout(() => {
        addVsdxClickHandlers();
    }, 100);
}

// 解析Markdown
function parseMarkdown(content) {
    // 使用marked.js解析Markdown
    return marked.parse(content);
}

// 切换单列/双列视图
function toggleView() {
    state.isDoubleColumn = !state.isDoubleColumn;

    if (state.isDoubleColumn) {
        // 切换到双列模式
        singleColumn.classList.add('hidden');
        doubleColumn.classList.remove('hidden');
        toggleViewBtn.textContent = '切换单列视图';

        // 如果有当前文件，将其放在左列
        if (state.currentFileIndex !== -1) {
            state.leftColumnFileIndex = state.currentFileIndex;
            leftColumn.innerHTML = `<div class="markdown-content">${parseMarkdown(state.files[state.currentFileIndex].content)}</div>`;
            state.rightColumnFileIndex = -1;
            rightColumn.innerHTML = '';
        }
    } else {
        // 切换到单列模式
        doubleColumn.classList.add('hidden');
        singleColumn.classList.remove('hidden');
        toggleViewBtn.textContent = '切换双列视图';

        // 显示当前文件或左列文件
        const displayIndex = state.currentFileIndex !== -1 ?
            state.currentFileIndex : state.leftColumnFileIndex;

        if (displayIndex !== -1) {
            singleColumn.innerHTML = `<div class="markdown-content">${parseMarkdown(state.files[displayIndex].content)}</div>`;
        }

        // 重置双列状态
        state.leftColumnFileIndex = -1;
        state.rightColumnFileIndex = -1;
    }

    // 更新文件列表高亮
    updateFileList();

    // 为VSX图片添加点击事件
    setTimeout(() => {
        addVsdxClickHandlers();
    }, 100);
}

// 为VSX图片添加点击事件处理
function addVsdxClickHandlers() {
    // 查找所有图片
    const images = document.querySelectorAll('.markdown-content img');

    images.forEach(img => {
        // 检查是否是VSX格式图片
        if (img.src.toLowerCase().endsWith('.vsdx') ||
            img.alt.toLowerCase().includes('vsdx')) {

            img.style.cursor = 'pointer';
            img.addEventListener('click', () => showVsdxModal(img.src, img.alt));
        }
    });
}

// 显示VSX图片浮窗
function showVsdxModal(src, alt) {
    vsdxContent.innerHTML = `
        <h3>${alt || 'VSX图片'}</h3>
        <p>这是一个VSX格式的图片预览。</p>
        <p>源文件: ${src}</p>
        <div class="placeholder">
            <p>VSX图片预览区域</p>
            <p>在实际应用中，这里会显示VSX图片内容</p>
        </div>
    `;

    vsdxModal.classList.remove('hidden');
}

// 关闭VSX图片浮窗
function closeVsdxModal() {
    vsdxModal.classList.add('hidden');
}

// 初始化浮窗拖拽功能
function initModalDrag() {
    const modalHeader = vsdxModal.querySelector('.modal-header');
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    modalHeader.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);

    function startDrag(e) {
        if (e.target === closeModalBtn) return;

        isDragging = true;
        const rect = vsdxModal.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;

        vsdxModal.style.cursor = 'grabbing';
        e.preventDefault();
    }

    function drag(e) {
        if (!isDragging) return;

        vsdxModal.style.left = (e.clientX - dragOffset.x) + 'px';
        vsdxModal.style.top = (e.clientY - dragOffset.y) + 'px';
    }

    function stopDrag() {
        isDragging = false;
        vsdxModal.style.cursor = 'default';
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);