/* ============================================================
   overlay.js — DICOM 信息叠加层
   修复：使用 cornerstone imageRendered 事件触发，简化标签提取
   ============================================================ */

const OverlayManager = (function () {
  'use strict';

  const _tagCache = {};

  // ---------- 提取 DICOM 标签（优先从 DICOMLoader 缓存获取） ----------
  function _extractTags(imageId) {
    if (_tagCache[imageId]) return _tagCache[imageId];

    // 从 DICOMLoader 缓存获取（dicomParser 直接解析，最快最可靠）
    var tags = DICOMLoader.extractDicomTags(imageId);
    if (tags && (tags.patientName || tags.patientId || tags.studyDate || tags.seriesDescription)) {
      _tagCache[imageId] = tags;
      return tags;
    }

    // 备用：通过 cornerstone 元数据
    try {
      var meta = cornerstone.metaData.get('generalSeriesModule', imageId) || {};
      var patient = cornerstone.metaData.get('patientModule', imageId) || {};
      var study = cornerstone.metaData.get('generalStudyModule', imageId) || {};
      var equip = cornerstone.metaData.get('generalEquipmentModule', imageId) || {};
      var tags2 = {
        patientName: patient.patientName, patientId: patient.patientId,
        patientBirthDate: patient.patientBirthDate, patientSex: patient.patientSex,
        patientAge: patient.patientAge, studyDate: study.studyDate,
        studyTime: study.studyTime, studyDescription: study.studyDescription,
        seriesDescription: meta.seriesDescription, seriesNumber: meta.seriesNumber,
        instanceNumber: meta.instanceNumber, modality: meta.modality,
        institutionName: equip.institutionName, manufacturer: equip.manufacturer,
        referringPhysician: study.referringPhysicianName
      };
      if (tags2.patientName || tags2.patientId || tags2.studyDate) {
        _tagCache[imageId] = tags2;
        return tags2;
      }
    } catch (e) { /* ignore */ }

    return null;
  }

  // ---------- 格式化工具 ----------
  function _formatName(name) {
    if (!name) return '-';
    if (typeof name === 'string') return name.replace(/\^/g, ' ');
    if (name.alphabetical) return name.alphabetical;
    return String(name);
  }

  function _formatDate(d) {
    if (!d) return '-';
    var s = String(d);
    if (s.length === 8) return s.slice(0,4) + '-' + s.slice(4,6) + '-' + s.slice(6,8);
    return s;
  }

  function _formatTime(t) {
    if (!t) return '';
    var s = String(t).slice(0,6);
    return s.length === 6 ? s.slice(0,2) + ':' + s.slice(2,4) + ':' + s.slice(4,6) : '';
  }

  function _calcAge(birthDate, studyDate) {
    if (!birthDate) return '';
    var b = String(birthDate);
    var s = String(studyDate || '');
    if (b.length < 4) return '';
    var by = parseInt(b.slice(0,4));
    var sy = s.length >= 4 ? parseInt(s.slice(0,4)) : new Date().getFullYear();
    return (sy - by) + 'Y';
  }

  // ---------- 获取视口窗宽窗位 ----------
  function _getViewportInfo(element) {
    try {
      var enabled = cornerstone.getEnabledElement(element);
      if (enabled && enabled.viewport) {
        var v = enabled.viewport;
        return {
          ww: Math.round(v.voi.windowWidth || 0),
          wl: Math.round(v.voi.windowCenter || 0),
          zoom: Math.round((v.scale || 1) * 100) + '%'
        };
      }
    } catch (e) { /* ignore */ }
    return { ww: '-', wl: '-', zoom: '-' };
  }

  // ---------- 渲染叠加层 ----------
  function render(element, imageId, viewportIndex) {
    if (!element || !imageId) return;
    if (!AppState.isOverlayVisible()) return;

    var cell = element.closest ? element.closest('.viewport-cell') : element.parentElement;
    if (!cell) return;

    // 移除旧的叠加层
    cell.querySelectorAll('.dicom-overlay').forEach(function (el) { el.remove(); });

    var tags = _extractTags(imageId);
    var vpInfo = _getViewportInfo(element);

    var vp = ViewportManager.getViewportData(viewportIndex);
    var series = AppState.getCurrentSeries();
    var total = series ? series.images.length : 0;
    var current = vp ? vp.imageIdIndex + 1 : 0;

    var name = _formatName(tags ? tags.patientName : null);
    var pid = (tags && tags.patientId) || '-';
    var sex = (tags && tags.patientSex) || '-';
    var age = (tags && tags.patientAge) || _calcAge(tags ? tags.patientBirthDate : null, tags ? tags.studyDate : null);
    var date = _formatDate(tags ? tags.studyDate : null);
    var time = _formatTime(tags ? tags.studyTime : null);
    var studyDesc = (tags && tags.studyDescription) || '-';
    var modality = (tags && tags.modality) || '-';
    var seriesDesc = (tags && tags.seriesDescription) || '-';
    var inst = (tags && tags.institutionName) || '-';
    var mfr = (tags && tags.manufacturer) || '-';
    var refPhys = _formatName(tags ? tags.referringPhysician : null);

    // 构建四个角
    var corners = [
      {
        className: 'top-left',
        lines: [name, pid + '  ' + sex + '  ' + age, inst]
      },
      {
        className: 'top-right',
        lines: [
          date + (time ? '  ' + time : ''),
          studyDesc !== '-' ? studyDesc : '',
          '医师: ' + refPhys
        ].filter(Boolean)
      },
      {
        className: 'bottom-left',
        lines: [
          modality + '  ' + (seriesDesc !== '-' ? seriesDesc : ''),
          mfr !== '-' ? mfr : '',
          '#' + (tags && tags.seriesNumber != null ? tags.seriesNumber : '?') + '  Inst#' + (tags && tags.instanceNumber != null ? tags.instanceNumber : current)
        ]
      },
      {
        className: 'bottom-right',
        lines: [
          'W: ' + vpInfo.ww + '  L: ' + vpInfo.wl,
          'Zoom: ' + vpInfo.zoom,
          current + '/' + total
        ]
      }
    ];

    corners.forEach(function (corner) {
      var div = document.createElement('div');
      div.className = 'dicom-overlay ' + corner.className;
      corner.lines.forEach(function (line) {
        if (line) {
          var row = document.createElement('div');
          row.className = 'overlay-row';
          row.textContent = line;
          div.appendChild(row);
        }
      });
      if (div.children.length > 0) {
        cell.appendChild(div);
      }
    });
  }

  // ---------- 更新所有视口 ----------
  function updateAll() {
    ViewportManager.getAllViewportData().forEach(function (vp, i) {
      if (vp && vp.element) {
        try {
          var enabled = cornerstone.getEnabledElement(vp.element);
          if (enabled && enabled.image) {
            // 清除旧叠加层
            var cell = vp.element.closest ? vp.element.closest('.viewport-cell') : vp.element.parentElement;
            if (cell) cell.querySelectorAll('.dicom-overlay').forEach(function (el) { el.remove(); });
            render(vp.element, enabled.image.imageId, i);
          }
        } catch (e) { /* ignore */ }
      }
    });
  }

  // ---------- 切换显隐 ----------
  function toggle() {
    AppState.toggleOverlay();
    var visible = AppState.isOverlayVisible();
    document.querySelectorAll('.dicom-overlay').forEach(function (el) {
      el.style.display = visible ? '' : 'none';
    });
    if (visible) updateAll();
    return visible;
  }

  function clearCache() {
    Object.keys(_tagCache).forEach(function (k) { delete _tagCache[k]; });
  }

  return {
    render: render,
    updateAll: updateAll,
    toggle: toggle,
    clearCache: clearCache
  };
})();