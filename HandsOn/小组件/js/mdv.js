/* ============================================================
   Markdown 工作台（MDV v2）
   - 编辑 / 阅读 / 双列对照三种模式
   - 标签页可拖拽排序；侧栏文件可拖入对照列
   - 侧栏、编辑/预览、对照左右分隔条自由拖动
   - 系统文件拖放导入；localStorage 自动保存
   ============================================================ */

const STORAGE_KEY = 'mdv-studio-v2';

// ---------- 状态 ----------
let state = {
    files: [],            // [{id, name, content}]
    openTabs: [],         // [fileId]
    activeId: null,       // 当前编辑/阅读的文件
    mode: 'edit',         // edit | read | dual
    dual: { left: null, right: null },
    sidebarPct: 18,
    editPct: 50,
    dualPct: 50,
    sidebarCollapsed: false
};

let saveTimer = null;     // localStorage 防抖
let renderTimer = null;   // 预览渲染防抖
let idSeed = Date.now();

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const fileListEl = $('fileList');
const tabsBar = $('tabsBar');
const editor = $('editor');
const previewEdit = $('previewEdit');
const previewEditPane = $('previewEditPane');
const previewRead = $('previewRead');
const panesEdit = $('panesEdit');
const panesRead = $('panesRead');
const panesDual = $('panesDual');
const dualLeft = $('dualLeft');
const dualRight = $('dualRight');
const statInfo = $('statInfo');
const statSave = $('statSave');
const dropOverlay = $('dropOverlay');
const fileInput = $('fileInput');

const fileById = id => state.files.find(f => f.id === id);

/* ============================================================
   持久化
   ============================================================ */
function persist() {
    clearTimeout(saveTimer);
    statSave.textContent = '保存中…';
    statSave.classList.add('saving');
    saveTimer = setTimeout(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            statSave.textContent = '已自动保存';
        } catch (e) {
            statSave.textContent = '保存失败（存储空间不足？）';
        }
        statSave.classList.remove('saving');
    }, 300);
}

function restore() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const saved = JSON.parse(raw);
        if (!Array.isArray(saved.files)) return false;
        state = { ...state, ...saved };
        // 清理引用失效的 id
        state.openTabs = state.openTabs.filter(id => fileById(id));
        if (state.activeId && !fileById(state.activeId)) state.activeId = null;
        state.dual.left = fileById(state.dual.left) ? state.dual.left : null;
        state.dual.right = fileById(state.dual.right) ? state.dual.right : null;
        return true;
    } catch (e) { return false; }
}

/* ============================================================
   Markdown 渲染（marked 不可用时降级）
   ============================================================ */
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderMd(src) {
    if (window.marked) {
        try {
            return marked.parse(src, { gfm: true, breaks: true });
        } catch (e) { /* fallthrough */ }
    }
    return '<pre>' + escapeHtml(src) + '</pre>';
}

function renderVsdxAfter(container) {
    container.querySelectorAll('img').forEach(img => {
        if (img.src.toLowerCase().endsWith('.vsdx') ||
            (img.alt || '').toLowerCase().includes('vsdx')) {
            img.style.cursor = 'pointer';
            img.addEventListener('click', () => showVsdxModal(img.src, img.alt));
        }
    });
}

/* ============================================================
   侧栏文件列表
   ============================================================ */
function renderFileList() {
    fileListEl.innerHTML = '';
    state.files.forEach(f => {
        const li = document.createElement('li');
        li.className = 'mdv-file-item';
        li.draggable = true;
        li.dataset.fileId = f.id;
        if (f.id === state.activeId) li.classList.add('active');

        const name = document.createElement('span');
        name.className = 'fi-name';
        name.textContent = f.name;
        name.title = f.name;

        const del = document.createElement('button');
        del.className = 'fi-del';
        del.textContent = '×';
        del.title = '删除该文档';
        del.addEventListener('click', e => { e.stopPropagation(); deleteFile(f.id); });

        li.append(name, del);
        li.addEventListener('click', () => openFile(f.id));
        li.addEventListener('dblclick', () => renameFile(f.id));

        // 拖到对照列
        li.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/x-mdv-file', f.id);
            e.dataTransfer.effectAllowed = 'copy';
        });
        fileListEl.appendChild(li);
    });
    if (!state.files.length) {
        const tip = document.createElement('li');
        tip.className = 'mdv-tabs-empty';
        tip.textContent = '还没有文档，点右上角 ＋ 新建';
        fileListEl.appendChild(tip);
    }
}

function openFile(id) {
    state.activeId = id;
    if (!state.openTabs.includes(id)) state.openTabs.push(id);
    if (state.mode === 'dual') {
        // 对照模式下点击：优先填空位
        if (!state.dual.left) state.dual.left = id;
        else if (!state.dual.right) state.dual.right = id;
        renderDual();
    }
    renderTabs();
    renderFileList();
    loadActiveToEditor();
    persist();
}

function loadActiveToEditor() {
    const f = fileById(state.activeId);
    editor.value = f ? f.content : '';
    editor.disabled = !f;
    renderPreviewActive();
    updateStatus();
}

function createFile(name, content = '', openNow = true) {
    const f = { id: 'f' + (idSeed++), name, content };
    state.files.push(f);
    if (openNow) {
        state.activeId = f.id;
        state.openTabs.push(f.id);
    }
    renderFileList();
    renderTabs();
    loadActiveToEditor();
    persist();
    return f;
}

function deleteFile(id) {
    const f = fileById(id);
    if (!f) return;
    if (!confirm(`确定删除「${f.name}」吗？`)) return;
    state.files = state.files.filter(x => x.id !== id);
    state.openTabs = state.openTabs.filter(x => x !== id);
    if (state.dual.left === id) state.dual.left = null;
    if (state.dual.right === id) state.dual.right = null;
    if (state.activeId === id) {
        state.activeId = state.openTabs[0] || null;
    }
    renderFileList();
    renderTabs();
    renderDual();
    loadActiveToEditor();
    persist();
}

function renameFile(id) {
    const f = fileById(id);
    if (!f) return;
    const name = prompt('重命名：', f.name);
    if (!name || name === f.name) return;
    f.name = name.trim();
    renderFileList();
    renderTabs();
    persist();
}

/* ============================================================
   标签页（可拖拽排序）
   ============================================================ */
function renderTabs() {
    tabsBar.innerHTML = '';
    if (!state.openTabs.length) {
        const tip = document.createElement('span');
        tip.className = 'mdv-tabs-empty';
        tip.textContent = '没有打开的文档 — 从左侧新建或导入';
        tabsBar.appendChild(tip);
        return;
    }
    state.openTabs.forEach((id, idx) => {
        const f = fileById(id);
        if (!f) return;
        const tab = document.createElement('div');
        tab.className = 'mdv-tab';
        tab.draggable = true;
        tab.dataset.idx = idx;
        if (id === state.activeId) tab.classList.add('active');

        const name = document.createElement('span');
        name.className = 'tab-name';
        name.textContent = f.name;
        name.title = f.name;

        const close = document.createElement('button');
        close.className = 'tab-close';
        close.textContent = '×';
        close.title = '关闭标签';
        close.addEventListener('click', e => {
            e.stopPropagation();
            closeTab(id);
        });

        tab.append(name, close);
        tab.addEventListener('click', () => openFile(id));

        // ---- 拖拽排序 ----
        tab.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/x-mdv-tab', String(idx));
            e.dataTransfer.effectAllowed = 'move';
            tab.classList.add('dragging');
        });
        tab.addEventListener('dragend', () => {
            tab.classList.remove('dragging');
            tabsBar.querySelectorAll('.mdv-tab').forEach(t =>
                t.classList.remove('tab-drop-before', 'tab-drop-after'));
        });
        tab.addEventListener('dragover', e => {
            if (!e.dataTransfer.types.includes('text/x-mdv-tab')) return;
            e.preventDefault();
            const rect = tab.getBoundingClientRect();
            const before = e.clientX < rect.left + rect.width / 2;
            tab.classList.toggle('tab-drop-before', before);
            tab.classList.toggle('tab-drop-after', !before);
        });
        tab.addEventListener('dragleave', () =>
            tab.classList.remove('tab-drop-before', 'tab-drop-after'));
        tab.addEventListener('drop', e => {
            e.preventDefault();
            const from = parseInt(e.dataTransfer.getData('text/x-mdv-tab'), 10);
            tab.classList.remove('tab-drop-before', 'tab-drop-after');
            if (isNaN(from) || from === idx) return;
            const moved = state.openTabs.splice(from, 1)[0];
            let to = idx;
            // 移除后索引偏移
            if (from < idx) to = idx - 1;
            const rect = tab.getBoundingClientRect();
            const before = e.clientX < rect.left + rect.width / 2;
            state.openTabs.splice(before ? to : to + 1, 0, moved);
            renderTabs();
            persist();
        });

        tabsBar.appendChild(tab);
    });
}

function closeTab(id) {
    state.openTabs = state.openTabs.filter(x => x !== id);
    if (state.activeId === id) {
        state.activeId = state.openTabs[state.openTabs.length - 1] || null;
    }
    renderTabs();
    renderFileList();
    loadActiveToEditor();
    persist();
}

/* ============================================================
   编辑器
   ============================================================ */
function insertText(text) {
    editor.focus();
    // execCommand 保留原生撤销栈（Ctrl+Z 可整体撤销）
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok) {
        const s = editor.selectionStart, epos = editor.selectionEnd;
        editor.setRangeText(text, s, epos, 'end');
    }
    onEditorInput();
}

function getSel() {
    return { s: editor.selectionStart, e: editor.selectionEnd, text: editor.value.slice(editor.selectionStart, editor.selectionEnd) };
}

function wrapInline(before, after) {
    const { s, e, text } = getSel();
    if (text) {
        insertText(before + text + after);
    } else {
        insertText(before + after);
        // 光标移到中间
        const pos = editor.selectionStart - after.length;
        editor.setSelectionRange(pos, pos);
    }
    void s; void e;
}

function lineBounds() {
    const { s, e } = getSel();
    const v = editor.value;
    const start = v.lastIndexOf('\n', s - 1) + 1;
    let end = v.indexOf('\n', e);
    if (end === -1) end = v.length;
    return { start, end };
}

function applyLinePrefixes(mode, prefix) {
    const { start, end } = lineBounds();
    const lines = editor.value.slice(start, end).split('\n');
    const out = lines.map((line, i) => {
        const bare = line.replace(/^(\s*)(#{1,6}\s|>\s?|[-*]\s\[[ x]\]\s|[-*]\s|\d+[.)]\s)/, '$1');
        if (mode === 'set') {
            const p = typeof prefix === 'function' ? prefix(i) : prefix;
            return bare.replace(/^(\s*)/, `$1${p}`);
        }
        if (mode === 'toggle') {
            // 已有目标前缀则移除，否则添加
            if (line.trimStart().startsWith(prefix)) {
                return line.replace(prefix, '');
            }
            return bare.replace(/^(\s*)/, `$1${prefix}`);
        }
        return line;
    });
    editor.focus();
    editor.setSelectionRange(start, end);
    insertText(out.join('\n'));
}

function fmtAction(kind) {
    const { text } = getSel();
    switch (kind) {
        case 'bold': wrapInline('**', '**'); break;
        case 'italic': wrapInline('*', '*'); break;
        case 'strike': wrapInline('~~', '~~'); break;
        case 'code': wrapInline('`', '`'); break;
        case 'h1': applyLinePrefixes('set', '# '); break;
        case 'h2': applyLinePrefixes('set', '## '); break;
        case 'h3': applyLinePrefixes('set', '### '); break;
        case 'quote': applyLinePrefixes('toggle', '> '); break;
        case 'ul': applyLinePrefixes('toggle', '- '); break;
        case 'ol': applyLinePrefixes('set', i => `${i + 1}. `); break;
        case 'task': applyLinePrefixes('set', '- [ ] '); break;
        case 'link': {
            const url = prompt('链接地址：', 'https://');
            if (url === null) return;
            insertText(`[${text || '链接'}](${url})`);
            break;
        }
        case 'image': {
            const url = prompt('图片地址：', 'https://');
            if (url === null) return;
            const alt = prompt('图片描述（可选）：', '') || '图片';
            insertText(`![${alt}](${url})`);
            break;
        }
        case 'table':
            insertText('\n| 列一 | 列二 | 列三 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n');
            break;
        case 'codeblock':
            insertText('\n```js\n' + (text || '// 代码') + '\n```\n');
            break;
        case 'hr':
            insertText('\n---\n');
            break;
    }
}

let scSyncing = false;
function onEditorInput() {
    const f = fileById(state.activeId);
    if (f) {
        f.content = editor.value;
        persist();
    }
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderPreviewActive, 150);
    updateStatus();
}

function renderPreviewActive() {
    const html = renderMd(editor.value || '');
    previewEdit.innerHTML = html;
    renderVsdxAfter(previewEdit);
    if (state.mode === 'read') {
        previewRead.innerHTML = html;
        renderVsdxAfter(previewRead);
    }
}

// 编辑 → 预览 同步滚动
editor.addEventListener('input', onEditorInput);
editor.addEventListener('scroll', () => {
    if (state.mode !== 'edit' || scSyncing) return;
    const maxS = editor.scrollHeight - editor.clientHeight;
    if (maxS <= 0) return;
    const ratio = editor.scrollTop / maxS;
    const maxP = previewEditPane.scrollHeight - previewEditPane.clientHeight;
    scSyncing = true;
    previewEditPane.scrollTop = ratio * maxP;
    requestAnimationFrame(() => { scSyncing = false; });
});

function updateStatus() {
    const v = editor.value || '';
    const chars = v.length;
    const cjk = (v.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || []).length;
    const latin = (v.replace(/[\u4e00-\u9fff\u3040-\u30ff]/g, ' ')
                    .split(/\s+/).filter(Boolean)).length;
    const f = fileById(state.activeId);
    statInfo.textContent = (f ? f.name + '　·　' : '') +
        `字数 ${cjk + latin} · 字符 ${chars}`;
}

/* ============================================================
   模式切换
   ============================================================ */
function setMode(mode) {
    state.mode = mode;
    $('modeSwitch').querySelectorAll('.mode-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === mode));
    $('fmtToolbar').style.display = mode === 'edit' ? '' : 'none';
    panesEdit.classList.toggle('hidden', mode !== 'edit');
    panesRead.classList.toggle('hidden', mode !== 'read');
    panesDual.classList.toggle('hidden', mode !== 'dual');
    if (mode === 'read') {
        const f = fileById(state.activeId);
        previewRead.innerHTML = f ? renderMd(f.content) : '<p style="color:var(--text-muted)">没有打开的文档</p>';
        renderVsdxAfter(previewRead);
    }
    if (mode === 'dual') renderDual();
    persist();
}

/* ============================================================
   对照模式（双列，可拖放）
   ============================================================ */
function renderDual() {
    [['left', dualLeft, $('dualLeftBody')], ['right', dualRight, $('dualRightBody')]].forEach(([key, col, body]) => {
        const f = fileById(state.dual[key]);
        if (f) {
            body.innerHTML = renderMd(f.content);
            renderVsdxAfter(body);
            col.classList.add('has-content');
        } else {
            body.innerHTML = '';
            col.classList.remove('has-content');
        }
    });
}

function setupDualDrop(col, key) {
    col.addEventListener('dragover', e => {
        if (!e.dataTransfer.types.includes('text/x-mdv-file')) return;
        e.preventDefault();
        col.classList.add('drop-target');
    });
    col.addEventListener('dragleave', () => col.classList.remove('drop-target'));
    col.addEventListener('drop', e => {
        e.preventDefault();
        col.classList.remove('drop-target');
        const id = e.dataTransfer.getData('text/x-mdv-file');
        if (id && fileById(id)) {
            state.dual[key] = id;
            renderDual();
            persist();
        }
    });
}
setupDualDrop(dualLeft, 'left');
setupDualDrop(dualRight, 'right');

// 双击对照列空白处可清空（不影响正文双击选词）
[dualLeft, dualRight].forEach(col =>
    col.addEventListener('dblclick', e => {
        if (e.target.closest('.markdown-content')) return;
        const key = col.dataset.col;
        if (!state.dual[key]) return;
        state.dual[key] = null;
        renderDual();
        persist();
    }));

/* ============================================================
   分隔条拖动（侧栏 / 编辑预览 / 对照左右）
   ============================================================ */
function makeResizer(handle, getContainer, applyPct, getPct, min, max) {
    handle.addEventListener('mousedown', e => {
        e.preventDefault();
        handle.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        const rect = getContainer().getBoundingClientRect();

        const move = ev => {
            let pct = ((ev.clientX - rect.left) / rect.width) * 100;
            pct = Math.max(min, Math.min(max, pct));
            applyPct(pct);
        };
        const up = () => {
            handle.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            persist();
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    });
}

const sidebar = $('mdvSidebar');
function applySidebarPct(pct) {
    state.sidebarPct = pct;
    sidebar.style.width = pct + '%';
}
function applyEditPct(pct) {
    state.editPct = pct;
    $('editorPane').style.flex = `0 0 ${pct}%`;
    previewEditPane.style.flex = '1';
}
function applyDualPct(pct) {
    state.dualPct = pct;
    dualLeft.style.flex = `0 0 calc(${pct}% - 7px)`;
    dualRight.style.flex = '1';
}

makeResizer($('sidebarResizer'), () => $('mdvApp'),
    applySidebarPct, null, 10, 40);
makeResizer($('editResizer'), () => panesEdit,
    applyEditPct, null, 20, 80);
makeResizer($('dualResizer'), () => panesDual,
    applyDualPct, null, 20, 80);

// 窗口缩放：重新夹紧比例（百分比布局本身自适应，这里只处理极限值）
window.addEventListener('resize', () => {
    if (state.sidebarPct < 10) applySidebarPct(10);
    if (state.editPct < 20) applyEditPct(20);
    if (state.editPct > 80) applyEditPct(80);
});

// 侧栏收起/展开
$('btnSidebarToggle').addEventListener('click', () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    sidebar.classList.toggle('collapsed', state.sidebarCollapsed);
    $('sidebarResizer').style.display = state.sidebarCollapsed ? 'none' : '';
    persist();
});

/* ============================================================
   文件导入导出
   ============================================================ */
function importFiles(files) {
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = e => {
            const f = state.files.find(x => x.name === file.name);
            if (f) {
                f.content = e.target.result; // 同名直接覆盖更新
            } else {
                createFile(file.name, e.target.result, false);
            }
            if (!state.activeId) {
                const nf = state.files.find(x => x.name === file.name);
                if (nf) openFile(nf.id);
            }
            renderFileList();
            persist();
        };
        reader.readAsText(file);
    });
}

fileInput.addEventListener('change', e => {
    if (e.target.files.length) importFiles(e.target.files);
    fileInput.value = '';
});
$('btnImport').addEventListener('click', () => fileInput.click());
$('btnNewFile').addEventListener('click', () => {
    let i = 1, name = '未命名.md';
    while (state.files.some(f => f.name === name)) name = `未命名${++i}.md`;
    createFile(name, '# ' + name.replace(/\.md$/, '') + '\n\n');
    editor.focus();
});
$('btnExportAll').addEventListener('click', exportAll);
$('btnDownload').addEventListener('click', downloadActive);

function download(name, text) {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function downloadActive() {
    const f = fileById(state.activeId);
    if (!f) return alert('没有可保存的文档');
    download(f.name.endsWith('.md') || f.name.endsWith('.txt') ? f.name : f.name + '.md', f.content);
    statSave.textContent = '已下载 ' + f.name;
}

function exportAll() {
    if (!state.files.length) return alert('没有可导出的文档');
    let delay = 0;
    state.files.forEach(f => {
        setTimeout(() => download(f.name.endsWith('.md') || f.name.endsWith('.txt') ? f.name : f.name + '.md', f.content), delay);
        delay += 400;
    });
}

/* ============================================================
   系统级文件拖放
   ============================================================ */
let dragDepth = 0;
document.addEventListener('dragenter', e => {
    if (Array.from(e.dataTransfer.types).includes('Files')) {
        dragDepth++;
        dropOverlay.classList.remove('hidden');
    }
});
document.addEventListener('dragleave', () => {
    if (--dragDepth <= 0) { dragDepth = 0; dropOverlay.classList.add('hidden'); }
});
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
    e.preventDefault();
    dragDepth = 0;
    dropOverlay.classList.add('hidden');
    if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files);
});

/* ============================================================
   快捷键
   ============================================================ */
editor.addEventListener('keydown', e => {
    if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 's') { e.preventDefault(); downloadActive(); }
        else if (k === 'b') { e.preventDefault(); fmtAction('bold'); }
        else if (k === 'i') { e.preventDefault(); fmtAction('italic'); }
    }
});
document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key.toLowerCase() === 's' && document.activeElement !== editor) {
        e.preventDefault(); downloadActive();
    }
});

/* ============================================================
   VSX 弹窗（保留原功能）
   ============================================================ */
const vsdxModal = $('vsdxModal');
function showVsdxModal(src, alt) {
    $('vsdxContent').innerHTML = `
        <h3>${escapeHtml(alt || 'VSX图片')}</h3>
        <p>源文件: ${escapeHtml(src)}</p>
        <div class="placeholder"><p>VSX图片预览区域</p></div>`;
    vsdxModal.classList.remove('hidden');
}
$('closeModal').addEventListener('click', () => vsdxModal.classList.add('hidden'));
(function initModalDrag() {
    const header = vsdxModal.querySelector('.modal-header');
    let dragging = false, ox = 0, oy = 0;
    header.addEventListener('mousedown', e => {
        if (e.target === $('closeModal')) return;
        dragging = true;
        const r = vsdxModal.getBoundingClientRect();
        ox = e.clientX - r.left; oy = e.clientY - r.top;
        vsdxModal.style.transform = 'none';
        e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        vsdxModal.style.left = (e.clientX - ox) + 'px';
        vsdxModal.style.top = (e.clientY - oy) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
})();

/* ============================================================
   工具栏事件绑定与初始化
   ============================================================ */
$('fmtToolbar').addEventListener('click', e => {
    const btn = e.target.closest('button[data-fmt]');
    if (btn) fmtAction(btn.dataset.fmt);
});
$('modeSwitch').addEventListener('click', e => {
    const btn = e.target.closest('.mode-btn');
    if (btn) setMode(btn.dataset.mode);
});

function init() {
    const restored = restore();
    if (!restored || !state.files.length) {
        // 首次使用：放一份欢迎文档
        createFile('欢迎使用.md', [
            '# Markdown 工作台',
            '',
            '> 这是一个**纯前端**的 Markdown 编辑器 + 阅读器，数据自动保存在浏览器本地。',
            '',
            '## 你可以',
            '',
            '- 在「编辑」模式下一边写一边看实时预览，中间分隔条可以**自由拖动**',
            '- 用「对照」模式把两个文档并排比较——把左侧文件**拖进**任意一列即可',
            '- 拖动标签页可以**重新排序**，双击侧栏文件名可以重命名',
            '- 把电脑里的 `.md` / `.txt` 文件直接**拖进页面**导入',
            '- 窗口随便缩放，布局自适应；`Ctrl+S` 下载当前文档',
            '',
            '## 快捷键',
            '',
            '| 快捷键 | 功能 |',
            '| --- | --- |',
            '| Ctrl+B | 加粗 |',
            '| Ctrl+I | 斜体 |',
            '| Ctrl+S | 下载保存 |',
            '',
            '```js',
            'console.log("祝你用得开心！");',
            '```',
            '',
            '---',
            '',
            '*这份文档可以随意修改或删除。*'
        ].join('\n'));
    } else {
        renderFileList();
        renderTabs();
        loadActiveToEditor();
    }
    // 应用布局
    applySidebarPct(state.sidebarPct);
    applyEditPct(state.editPct);
    applyDualPct(state.dualPct);
    sidebar.classList.toggle('collapsed', state.sidebarCollapsed);
    $('sidebarResizer').style.display = state.sidebarCollapsed ? 'none' : '';
    setMode(state.mode || 'edit');
}

document.addEventListener('DOMContentLoaded', init);
