/* ============================================================
   app.js — DICOM 医学影像浏览器 · 主应用控制器
   修复：简化的 cornerstone 配置、工具绑定、导出功能
   ============================================================ */

(function () {
  'use strict';

  let _cineInterval = null;

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _setup);
    } else {
      _setup();
    }
  }

  function _setup() {
    console.log('DICOM Viewer 初始化开始...');

    // 1. 配置 Cornerstone
    _configureCornerstone();

    // 2. 初始化视口管理器
    var grid = document.getElementById('viewportGrid');
    if (grid) {
      ViewportManager.init(grid);
      ViewportManager.createViewports('1x1');
    }

    // 3. 初始化工具（必须在视口创建之后）
    DICOMTools.init();

    // 4. 绑定 UI 事件
    _bindUIEvents();

    // 5. 绑定键盘快捷键
    _bindKeyboard();

    console.log('DICOM Viewer 初始化完成');
  }

  // ---------- 简化版 Cornerstone 配置 ----------
  function _configureCornerstone() {
    try {
      // 配置外部引用
      cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
      cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
      cornerstoneWebImageLoader.external.cornerstone = cornerstone;

      // 初始化 Web Worker 管理器（不加载外部文件，使用内联解码）
      var config = {
        maxWebWorkers: Math.max(1, navigator.hardwareConcurrency || 1),
        startWebWorkersOnDemand: true,
        taskConfiguration: {
          decodeTask: {
            initializeCodecsOnStartup: false,
            usePDFJS: false,
            strict: false
          }
        }
      };
      cornerstoneWADOImageLoader.webWorkerManager.initialize(config);

      console.log('Cornerstone 配置完成');
    } catch (e) {
      console.warn('Cornerstone 配置降级:', e.message);
      try {
        cornerstoneWADOImageLoader.webWorkerManager.initialize({
          maxWebWorkers: 0
        });
      } catch (e2) {
        console.error('Cornerstone 配置彻底失败:', e2.message);
      }
    }
  }

  // ---------- 绑定 UI 事件 ----------
  function _bindUIEvents() {
    // 布局切换
    document.querySelectorAll('[data-layout]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var layout = this.dataset.layout;
        document.querySelectorAll('[data-layout]').forEach(function (b) {
          b.classList.remove('active');
        });
        this.classList.add('active');
        ViewportManager.setLayout(layout);
        // 重新绑定工具到新视口
        DICOMTools.rebindToElements();
        _restoreActiveTool();
      });
    });

    // 工具按钮
    document.querySelectorAll('[data-tool]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tool = this.dataset.tool;
        document.querySelectorAll('[data-tool]').forEach(function (b) {
          b.classList.remove('active');
        });
        this.classList.add('active');
        DICOMTools.setActiveTool(tool);
        // 切换测量工具时，将当前工具名保存到状态
        AppState.setActiveTool(tool);
      });
    });

    // 同步开关
    document.querySelectorAll('[data-sync]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = this.dataset.sync;
        var current = AppState.getSync()[key];
        AppState.setSync(key, !current);
        this.classList.toggle('sync-on', !current);
        this.classList.toggle('sync-off', current);
      });
    });

    // 预设选择
    var presetSelect = document.getElementById('presetSelect');
    if (presetSelect) {
      var presets = DICOMTools.getPresetNames();
      presets.forEach(function (name) {
        var opt = document.createElement('option');
        opt.value = name;
        opt.textContent = DICOMTools.getPresetLabel(name);
        presetSelect.appendChild(opt);
      });
      presetSelect.addEventListener('change', function () {
        DICOMTools.applyPreset(this.value);
      });
    }

    // 文件夹导入
    var importBtn = document.getElementById('importBtn');
    var folderInput = document.getElementById('folderInput');
    if (importBtn && folderInput) {
      importBtn.addEventListener('click', function () { folderInput.click(); });
      folderInput.addEventListener('change', function (e) {
        if (e.target.files.length > 0) _loadDICOMFiles(e.target.files);
      });
    }

    // 拖拽导入
    var viewportArea = document.querySelector('.viewport-area');
    if (viewportArea) {
      viewportArea.addEventListener('dragover', function (e) { e.preventDefault(); });
      viewportArea.addEventListener('drop', function (e) {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) _loadDICOMFiles(e.dataTransfer.files);
      });
    }

    // 叠加层显隐
    var overlayToggle = document.getElementById('toggleOverlay');
    if (overlayToggle) {
      overlayToggle.addEventListener('click', function () {
        var visible = OverlayManager.toggle();
        this.classList.toggle('active', visible);
      });
    }

    // 重置视图
    document.getElementById('resetViewBtn')?.addEventListener('click', function () {
      ViewportManager.resetViewports();
    });

    // 清除测量
    document.getElementById('clearMeasurementsBtn')?.addEventListener('click', function () {
      DICOMTools.clearAllMeasurements();
      _showMessage('已清除所有测量和标注', 'info');
    });

    // 切片导航
    document.getElementById('prevSliceBtn')?.addEventListener('click', function () {
      ViewportManager.navigateViewport(0, -1);
    });
    document.getElementById('nextSliceBtn')?.addEventListener('click', function () {
      ViewportManager.navigateViewport(0, 1);
    });

    // 序列列表点击
    document.addEventListener('click', function (e) {
      var item = e.target.closest('.series-item');
      if (item) {
        var idx = parseInt(item.dataset.index);
        if (!isNaN(idx)) {
          AppState.setCurrentSeriesIndex(idx);
          _renderSeriesList();
          // 加载到所有视口
          ViewportManager.getAllViewportData().forEach(function (vp, i) {
            ViewportManager.loadImageToViewport(i, idx, 0);
          });
        }
      }
    });

    // 序列列表拖拽（支持拖到视口替换）
    document.addEventListener('mousedown', function (e) {
      // 使用 mousedown 模拟 dragstart，因为原生 drag 在移动端有兼容问题
    });

    // 监听 dicoms-dropped 事件（来自视口拖拽导入）
    document.addEventListener('dicoms-dropped', function (e) {
      if (e.detail && e.detail.files) {
        _loadDICOMFiles(e.detail.files);
      }
    });

    // 导出按钮
    document.getElementById('exportBtn')?.addEventListener('click', function () {
      ExportManager.showExportDialog();
    });
  }

  // ---------- 键盘快捷键 ----------
  function _bindKeyboard() {
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); ViewportManager.navigateViewport(0, -1); break;
        case 'ArrowRight': e.preventDefault(); ViewportManager.navigateViewport(0, 1); break;
        case '+': case '=': e.preventDefault(); _adjustZoom(0.1); break;
        case '-': e.preventDefault(); _adjustZoom(-0.1); break;
        case 'r': case 'R': e.preventDefault(); ViewportManager.resetViewports(); break;
        case ' ': e.preventDefault(); _toggleCine(); break;
        case 'o': case 'O': e.preventDefault(); OverlayManager.toggle(); break;
        case '1': ViewportManager.setLayout('1x1'); DICOMTools.rebindToElements(); _restoreActiveTool(); break;
        case '2': ViewportManager.setLayout('1x2'); DICOMTools.rebindToElements(); _restoreActiveTool(); break;
        case '4': ViewportManager.setLayout('2x2'); DICOMTools.rebindToElements(); _restoreActiveTool(); break;
      }
    });
  }

  // ---------- 加载 DICOM 文件 ----------
  async function _loadDICOMFiles(files) {
    try {
      _showMessage('正在解析 ' + files.length + ' 个文件...', 'info');
      var series = await DICOMLoader.loadFromFiles(files);
      if (series.length === 0) {
        _showMessage('未识别到有效的 DICOM 文件', 'error');
        return;
      }
      _renderSeriesList();
      ViewportManager.loadViewports();
      // 重新绑定工具
      DICOMTools.rebindToElements();
      DICOMTools.setActiveTool(AppState.getActiveTool());
      _showMessage('加载完成: ' + series.length + ' 个序列, ' + files.length + ' 张切片', 'success');
    } catch (error) {
      _showMessage('加载失败: ' + error.message, 'error');
    }
  }

  // ---------- 渲染序列列表 ----------
  function _renderSeriesList() {
    var container = document.getElementById('seriesList');
    if (!container) return;
    var tree = DICOMLoader.getSeriesTree();
    var currentIndex = AppState.getCurrentSeriesIndex();
    var countEl = document.getElementById('seriesCount');
    if (countEl) countEl.textContent = tree.length;

    if (tree.length === 0) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">暂无数据<br>点击下方按钮导入 DICOM 文件夹</div>';
      return;
    }

    container.innerHTML = '';
    tree.forEach(function (item) {
      var div = document.createElement('div');
      div.className = 'series-item' + (item.isActive ? ' active' : '');
      div.dataset.index = item.index;
      div.draggable = true;
      div.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', String(item.index));
        e.dataTransfer.effectAllowed = 'copy';
        this.style.opacity = '0.5';
      });
      div.addEventListener('dragend', function () {
        this.style.opacity = '1';
      });
      var icons = { CT: '🫁', MR: '🧠', XA: '🩸', US: '🔊', PET: '⚡', NM: '☢' };
      var icon = icons[item.modality] || '📋';
      div.innerHTML = '<div class="series-icon">' + icon + '</div>' +
        '<div class="series-info">' +
        '<div class="series-name">' + (item.seriesDescription && item.seriesDescription !== '未知序列' ? item.seriesDescription : '序列 ' + (item.index + 1) + ' (' + item.imageCount + ' 张)') + '</div>' +
        '<div class="series-meta">' + item.modality + ' · ' + item.imageCount + ' 张</div></div>' +
        '<span class="series-count">' + item.imageCount + '</span>';
      container.appendChild(div);
    });
  }

  // ---------- 缩放辅助 ----------
  function _adjustZoom(delta) {
    var vp = ViewportManager.getViewportData(0);
    if (!vp || !vp.element) return;
    try {
      var enabled = cornerstone.getEnabledElement(vp.element);
      if (enabled && enabled.viewport) {
        enabled.viewport.scale = Math.max(0.1, Math.min(10, (enabled.viewport.scale || 1) + delta));
        cornerstone.setViewport(vp.element, enabled.viewport);
        ViewportManager.updateStatusBar();
        OverlayManager.updateAll();
      }
    } catch (e) { /* ignore */ }
  }

  // ---------- Cine 播放 ----------
  function _toggleCine() {
    if (_cineInterval) {
      clearInterval(_cineInterval);
      _cineInterval = null;
      _showMessage('Cine 播放已停止', 'info');
      return;
    }
    var series = AppState.getCurrentSeries();
    if (!series || series.images.length <= 1) {
      _showMessage('切片不足，无法播放', 'warning');
      return;
    }
    _showMessage('Cine 播放中...', 'info');
    _cineInterval = setInterval(function () {
      ViewportManager.navigateViewport(0, 1);
    }, 200);
  }

  // ---------- 消息提示 ----------
  function _showMessage(msg, type) {
    var existing = document.querySelectorAll('.message');
    existing.forEach(function (m) { m.remove(); });
    var div = document.createElement('div');
    div.className = 'message ' + (type || 'info');
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(function () {
      if (document.body.contains(div)) document.body.removeChild(div);
    }, 3000);
  }

  // ---------- 恢复活动工具按钮状态 ----------
  function _restoreActiveTool() {
    var tool = AppState.getActiveTool();
    document.querySelectorAll('[data-tool]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
    DICOMTools.setActiveTool(tool);
  }

  // 暴露消息函数给其他模块
  window.showMessage = _showMessage;

  init();
})();