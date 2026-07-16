/* ============================================================
   viewportManager.js — 多视口管理器
   修复：工具绑定到元素、imageRendered 事件触发叠加层
   ============================================================ */

const ViewportManager = (function () {
  'use strict';

  let _gridEl = null;
  let _elements = [];
  let _viewportData = [];

  // ---------- 初始化 ----------
  function init(gridElement) {
    _gridEl = gridElement;
    _elements = [];
    _viewportData = [];
  }

  // ---------- 创建视口 ----------
  function createViewports(layout) {
    if (!_gridEl) return;
    destroyViewports();

    var config = AppState.getLayoutConfigs()[layout] || AppState.getLayoutConfigs()['1x1'];
    var count = config.count;

    _gridEl.className = 'viewport-grid layout-' + layout;

    for (var i = 0; i < count; i++) {
      var cell = document.createElement('div');
      cell.className = 'viewport-cell';
      cell.dataset.viewportIndex = i;

      // 视口标签
      var label = document.createElement('div');
      label.className = 'viewport-label';
      label.textContent = '视口 ' + (i + 1);
      cell.appendChild(label);

      // cornerstone 元素
      var ce = document.createElement('div');
      ce.className = 'cornerstone-element';
      ce.id = 'cornerstone-element-' + i;
      cell.appendChild(ce);

      // 空状态
      var empty = document.createElement('div');
      empty.className = 'viewport-empty';
      empty.textContent = '导入 DICOM 文件\n或拖拽到此处';
      cell.appendChild(empty);

      _gridEl.appendChild(cell);

      // 启用 cornerstone
      try {
        cornerstone.enable(ce);
        _elements.push(ce);
        _viewportData.push({
          element: ce,
          seriesIndex: 0,
          imageIdIndex: 0,
          cell: cell,
          label: label,
          empty: empty
        });

        // 绑定 imageRendered 事件 → 更新叠加层
        _bindOverlayEvent(ce, i);

        // 绑定拖拽事件（支持从侧边栏拖入）
        _bindDropEvents(cell, i);

      } catch (e) {
        console.error('启用 cornerstone 元素失败:', i, e);
      }
    }

    AppState.setLayout(layout);
    AppState.setViewports(_viewportData.map(function (v) {
      return { element: v.element, seriesIndex: v.seriesIndex, imageIdIndex: v.imageIdIndex };
    }));

    return _viewportData;
  }

  // ---------- 绑定叠加层事件 ----------
  function _bindOverlayEvent(element, viewportIndex) {
    element.addEventListener('cornerstoneimagerendered', function (e) {
      var detail = e.detail;
      if (detail && detail.image && detail.image.imageId) {
        OverlayManager.render(element, detail.image.imageId, viewportIndex);
        _updateStatusBarForViewport(viewportIndex);
      }
    });
  }

  // ---------- 绑定拖拽事件到视口 ----------
  function _bindDropEvents(cell, viewportIndex) {
    cell.addEventListener('dragover', function (e) {
      e.preventDefault();
      cell.style.borderColor = 'var(--brand-blue, #4a9eff)';
      cell.style.borderStyle = 'solid';
    });

    cell.addEventListener('dragleave', function () {
      cell.style.borderColor = '';
      cell.style.borderStyle = '';
    });

    cell.addEventListener('drop', function (e) {
      e.preventDefault();
      cell.style.borderColor = '';
      cell.style.borderStyle = '';

      // 检查是否是侧边栏序列拖入
      var seriesIndex = e.dataTransfer.getData('text/plain');
      if (seriesIndex) {
        var idx = parseInt(seriesIndex);
        if (!isNaN(idx) && idx >= 0) {
          loadImageToViewport(viewportIndex, idx, 0);
          return;
        }
      }

      // 检查是否是 DICOM 文件拖入
      if (e.dataTransfer.files.length > 0) {
        // 触发全局加载
        var event = new CustomEvent('dicoms-dropped', { detail: { files: e.dataTransfer.files } });
        document.dispatchEvent(event);
      }
    });
  }

  // ---------- 销毁视口 ----------
  function destroyViewports() {
    _elements.forEach(function (el) {
      try { cornerstone.disable(el); } catch (e) { /* ignore */ }
    });
    _elements = [];
    _viewportData = [];
    if (_gridEl) _gridEl.innerHTML = '';
  }

  // ---------- 加载图像到指定视口 ----------
  function loadImageToViewport(viewportIndex, seriesIndex, imageIdIndex) {
    var vp = _viewportData[viewportIndex];
    if (!vp) return;

    var series = AppState.getSeries();
    if (!series[seriesIndex]) return;
    var images = series[seriesIndex].images;
    if (!images[imageIdIndex]) return;

    var imageId = images[imageIdIndex].imageId;
    vp.seriesIndex = seriesIndex;
    vp.imageIdIndex = imageIdIndex;
    AppState.setViewport(viewportIndex, { seriesIndex: seriesIndex, imageIdIndex: imageIdIndex });

    // 隐藏空状态
    if (vp.empty) vp.empty.style.display = 'none';
    if (vp.label) vp.label.textContent = '视口 ' + (viewportIndex + 1) + ' | S' + (seriesIndex + 1) + ':' + (imageIdIndex + 1);

    // 加载并显示图像
    cornerstone.loadImage(imageId).then(function (image) {
      cornerstone.displayImage(vp.element, image);
      // 更新序列列表高亮
      _updateSeriesHighlight();
    }).catch(function (err) {
      console.error('加载图像失败:', viewportIndex, err);
      if (vp.empty) vp.empty.textContent = '加载失败: ' + (err.message || '未知错误');
    });
  }

  // ---------- 加载所有视口 ----------
  function loadViewports() {
    var series = AppState.getSeries();
    var currentIdx = AppState.getCurrentSeriesIndex();
    if (series.length === 0) return;

    _viewportData.forEach(function (vp, i) {
      var si = vp.seriesIndex >= series.length ? 0 : vp.seriesIndex;
      loadImageToViewport(i, si, vp.imageIdIndex);
    });

    _updateSeriesHighlight();
  }

  // ---------- 切换布局 ----------
  function setLayout(layout) {
    var series = AppState.getSeries();
    var hasData = series.length > 0;
    createViewports(layout);
    if (hasData) loadViewports();
  }

  // ---------- 导航 ----------
  function navigateViewport(viewportIndex, direction) {
    var vp = _viewportData[viewportIndex];
    if (!vp) return;
    var series = AppState.getSeries();
    if (!series[vp.seriesIndex]) return;
    var images = series[vp.seriesIndex].images;
    var newIdx = vp.imageIdIndex + direction;
    if (newIdx < 0 || newIdx >= images.length) return;

    loadImageToViewport(viewportIndex, vp.seriesIndex, newIdx);

    // 同步滚动
    if (AppState.getSync().scroll) {
      _viewportData.forEach(function (other, i) {
        if (i !== viewportIndex && other.seriesIndex === vp.seriesIndex) {
          loadImageToViewport(i, other.seriesIndex, newIdx);
        }
      });
    }
  }

  // ---------- 切换序列 ----------
  function switchSeries(viewportIndex, seriesIndex) {
    loadImageToViewport(viewportIndex, seriesIndex, 0);
  }

  // ---------- 更新序列高亮 ----------
  function _updateSeriesHighlight() {
    var currentIdx = AppState.getCurrentSeriesIndex();
    document.querySelectorAll('.series-item').forEach(function (el) {
      var idx = parseInt(el.dataset.index);
      el.classList.toggle('active', idx === currentIdx);
    });
  }

  // ---------- 更新状态栏 ----------
  function _updateStatusBarForViewport(viewportIndex) {
    var vp = _viewportData[viewportIndex];
    if (!vp) return;
    var series = AppState.getSeries();
    if (!series[vp.seriesIndex]) return;
    var images = series[vp.seriesIndex].images;
    var current = vp.imageIdIndex + 1;
    var total = images.length;

    document.getElementById('statusSlice').textContent = current + '/' + total;

    try {
      var enabled = cornerstone.getEnabledElement(vp.element);
      if (enabled && enabled.viewport) {
        var v = enabled.viewport;
        document.getElementById('statusWW').textContent = Math.round(v.voi.windowWidth || 0);
        document.getElementById('statusWL').textContent = Math.round(v.voi.windowCenter || 0);
        document.getElementById('statusZoom').textContent = Math.round((v.scale || 1) * 100) + '%';
      }
    } catch (e) { /* ignore */ }
  }

  function updateStatusBar() {
    if (_viewportData.length > 0) _updateStatusBarForViewport(0);
  }

  // ---------- 重置所有视口 ----------
  function resetViewports() {
    _viewportData.forEach(function (vp) {
      try {
        var enabled = cornerstone.getEnabledElement(vp.element);
        if (enabled && enabled.image) {
          var def = cornerstone.getDefaultViewport(vp.element, enabled.image);
          cornerstone.setViewport(vp.element, def);
        }
      } catch (e) { /* ignore */ }
    });
  }

  // ---------- 获取视口数据 ----------
  function getViewportData(index) { return _viewportData[index] || null; }
  function getAllViewportData() { return _viewportData; }
  function getElements() { return _elements; }

  // ---------- 导出当前视口 canvas ----------
  function getViewportCanvas(viewportIndex) {
    var vp = _viewportData[viewportIndex];
    if (!vp || !vp.element) return null;
    var canvas = vp.element.querySelector('canvas');
    return canvas || null;
  }

  function getViewportCount() { return _viewportData.length; }

  // ---------- 公开 API ----------
  return {
    init: init,
    createViewports: createViewports,
    destroyViewports: destroyViewports,
    setLayout: setLayout,
    loadViewports: loadViewports,
    loadImageToViewport: loadImageToViewport,
    navigateViewport: navigateViewport,
    switchSeries: switchSeries,
    updateStatusBar: updateStatusBar,
    resetViewports: resetViewports,
    getViewportData: getViewportData,
    getAllViewportData: getAllViewportData,
    getElements: getElements,
    getViewportCanvas: getViewportCanvas,
    getViewportCount: getViewportCount
  };
})();