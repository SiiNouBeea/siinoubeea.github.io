/* ============================================================
   export.js — DICOM 导出管理器
   功能：导出当前层 PNG（含标注）、导出全部层 PNG、多视口截图
   ============================================================ */

const ExportManager = (function () {
  'use strict';

  // ---------- 导出当前视口为 PNG ----------
  function exportCurrentViewport(viewportIndex) {
    var canvas = ViewportManager.getViewportCanvas(viewportIndex || 0);
    if (!canvas) {
      window.showMessage && window.showMessage('没有可导出的图像', 'warning');
      return;
    }

    _downloadCanvas(canvas, 'dicom_viewport_' + (viewportIndex || 0) + '_' + _timestamp() + '.png');
    window.showMessage && window.showMessage('当前视图已导出', 'success');
  }

  // ---------- 导出所有视口为一张大图 ----------
  function exportAllViewports() {
    var count = ViewportManager.getViewportCount();
    if (count === 0) {
      window.showMessage && window.showMessage('没有可导出的视口', 'warning');
      return;
    }

    if (count === 1) {
      exportCurrentViewport(0);
      return;
    }

    // 收集所有视口 canvas
    var canvases = [];
    for (var i = 0; i < count; i++) {
      var c = ViewportManager.getViewportCanvas(i);
      if (c) canvases.push(c);
    }

    if (canvases.length === 0) {
      window.showMessage && window.showMessage('没有可导出的视口', 'warning');
      return;
    }

    // 计算布局
    var cols = count <= 2 ? count : 2;
    var rows = count <= 2 ? 1 : 2;
    var maxW = 0, maxH = 0;
    var cellW = [], cellH = [];
    canvases.forEach(function (c) {
      cellW.push(c.width);
      cellH.push(c.height);
      if (c.width > maxW) maxW = c.width;
      if (c.height > maxH) maxH = c.height;
    });

    // 创建合并 canvas
    var gap = 10;
    var totalW = cols * maxW + (cols - 1) * gap;
    var totalH = rows * maxH + (rows - 1) * gap;

    var merged = document.createElement('canvas');
    merged.width = totalW;
    merged.height = totalH;
    var ctx = merged.getContext('2d');

    // 黑色背景
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, totalW, totalH);

    canvases.forEach(function (c, idx) {
      var col = idx % cols;
      var row = Math.floor(idx / cols);
      var x = col * (maxW + gap);
      var y = row * (maxH + gap);
      // 居中绘制
      var ox = x + (maxW - c.width) / 2;
      var oy = y + (maxH - c.height) / 2;
      ctx.drawImage(c, ox, oy);

      // 视口标签
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '14px sans-serif';
      ctx.fillText('视口 ' + (idx + 1), x + 8, y + 20);
    });

    _downloadCanvas(merged, 'dicom_all_viewports_' + _timestamp() + '.png');
    window.showMessage && window.showMessage('所有视口已合并导出', 'success');
  }

  // ---------- 导出当前序列全部切片为 PNG 序列 ----------
  function exportCurrentSeries() {
    var series = AppState.getCurrentSeries();
    if (!series || series.images.length === 0) {
      window.showMessage && window.showMessage('当前没有可导出的序列', 'warning');
      return;
    }

    var seriesName = series.seriesDescription || ('series_' + (AppState.getCurrentSeriesIndex() + 1));
    var images = series.images;
    var total = images.length;
    var exported = 0;

    window.showMessage && window.showMessage('正在导出 ' + total + ' 张切片...', 'info');

    // 逐个加载并导出
    function exportNext(idx) {
      if (idx >= total) {
        window.showMessage && window.showMessage('导出完成: ' + exported + ' 张', 'success');
        return;
      }

      var imageId = images[idx].imageId;
      var element = _getTempElement();

      cornerstone.loadImage(imageId).then(function (image) {
        cornerstone.displayImage(element, image).then(function () {
          // 等待渲染
          setTimeout(function () {
            var canvas = element.querySelector('canvas');
            if (canvas) {
              var num = String(idx + 1).padStart(String(total).length, '0');
              _downloadCanvas(canvas, seriesName + '_' + num + '_' + _timestamp() + '.png');
              exported++;
            }
            // 继续下一张
            exportNext(idx + 1);
          }, 100);
        });
      }).catch(function (err) {
        console.warn('导出切片失败:', idx, err);
        exportNext(idx + 1);
      });
    }

    exportNext(0);
  }

  // ---------- 临时 cornerstone 元素（用于后台导出） ----------
  var _tempElement = null;
  function _getTempElement() {
    if (!_tempElement || !document.body.contains(_tempElement)) {
      _tempElement = document.createElement('div');
      _tempElement.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:512px;height:512px;';
      _tempElement.id = 'temp-export-element';
      document.body.appendChild(_tempElement);
      try {
        cornerstone.enable(_tempElement);
      } catch (e) { /* ignore */ }
    }
    return _tempElement;
  }

  // ---------- 下载 Canvas ----------
  function _downloadCanvas(canvas, filename) {
    try {
      var link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('下载失败:', e);
      window.showMessage && window.showMessage('下载失败: ' + e.message, 'error');
    }
  }

  // ---------- 时间戳 ----------
  function _timestamp() {
    var d = new Date();
    return d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') + '_' +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0') +
      String(d.getSeconds()).padStart(2, '0');
  }

  // ---------- 显示导出对话框 ----------
  function showExportDialog() {
    var series = AppState.getSeries();
    if (series.length === 0) {
      window.showMessage && window.showMessage('没有可导出的数据', 'warning');
      return;
    }

    // 创建模态框
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:center;justify-content:center;';

    var dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--bg-panel,#1a1a2e);border:1px solid var(--border-color,#2a2a40);border-radius:12px;padding:24px;max-width:500px;width:90%;max-height:80vh;overflow-y:auto;';

    var seriesList = '';
    series.forEach(function (s, idx) {
      seriesList += '<label style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-color,#2a2a40);cursor:pointer;">' +
        '<input type="radio" name="export-series" value="' + idx + '" ' + (idx === 0 ? 'checked' : '') + '>' +
        '<span>' + (s.seriesDescription || '序列 ' + (idx + 1)) + ' (' + s.images.length + ' 张)</span></label>';
    });

    dialog.innerHTML =
      '<h3 style="margin-bottom:16px;font-size:16px;color:var(--text-primary,#e0e0e0);">📤 导出影像</h3>' +
      '<div style="margin-bottom:16px;">' +
      '<label style="font-size:13px;color:var(--text-muted,#9090a8);display:block;margin-bottom:4px;">选择导出序列:</label>' +
      seriesList +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">' +
      '<button class="tool-btn" id="exportCurrentBtn" style="justify-content:center;height:36px;background:var(--brand-blue,#4a9eff);color:#fff;border:none;">导出当前切片 (PNG)</button>' +
      '<button class="tool-btn" id="exportAllViewportsBtn" style="justify-content:center;height:36px;">导出所有视口 (合并图)</button>' +
      '<button class="tool-btn" id="exportSeriesBtn" style="justify-content:center;height:36px;">导出全部切片 (逐张)</button>' +
      '</div>' +
      '<div style="text-align:right;"><button class="tool-btn" id="closeExportDialog" style="color:var(--text-muted);">关闭</button></div>';

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // 事件绑定
    dialog.querySelector('#exportCurrentBtn').addEventListener('click', function () {
      var selected = dialog.querySelector('input[name="export-series"]:checked');
      if (selected) {
        var idx = parseInt(selected.value);
        AppState.setCurrentSeriesIndex(idx);
        exportCurrentViewport(0);
      }
    });

    dialog.querySelector('#exportAllViewportsBtn').addEventListener('click', function () {
      exportAllViewports();
    });

    dialog.querySelector('#exportSeriesBtn').addEventListener('click', function () {
      var selected = dialog.querySelector('input[name="export-series"]:checked');
      if (selected) {
        var idx = parseInt(selected.value);
        AppState.setCurrentSeriesIndex(idx);
        exportCurrentSeries();
      }
    });

    dialog.querySelector('#closeExportDialog').addEventListener('click', function () {
      document.body.removeChild(overlay);
    });

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    });
  }

  // ---------- 公开 API ----------
  return {
    exportCurrentViewport: exportCurrentViewport,
    exportAllViewports: exportAllViewports,
    exportCurrentSeries: exportCurrentSeries,
    showExportDialog: showExportDialog
  };
})();