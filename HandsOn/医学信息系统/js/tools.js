/* ============================================================
   tools.js — 工具管理模块
   修复：右键平移、滚轮切层、默认 Wwwc 工具
   ============================================================ */

const DICOMTools = (function () {
  'use strict';

  const WL_PRESETS = {
    'lung':        { label: '肺窗',   windowWidth: 1500, windowCenter: -500 },
    'bone':        { label: '骨窗',   windowWidth: 2500, windowCenter: 480 },
    'brain':       { label: '脑窗',   windowWidth: 90,   windowCenter: 35 },
    'abdomen':     { label: '腹部',   windowWidth: 400,  windowCenter: 50 },
    'soft-tissue': { label: '软组织', windowWidth: 350,  windowCenter: 50 },
    'mediastinum': { label: '纵隔',   windowWidth: 400,  windowCenter: 40 },
    'liver':       { label: '肝脏',   windowWidth: 150,  windowCenter: 30 },
    'spine':       { label: '脊柱',   windowWidth: 250,  windowCenter: 40 },
    'temporal':    { label: '颞骨',   windowWidth: 4000, windowCenter: 700 },
    'subdural':    { label: '硬膜下', windowWidth: 200,  windowCenter: 75 }
  };

  let _initialized = false;

  // ---------- 工具注册列表 ----------
  // 标准 DICOM 操作习惯：
  //   左键拖拽 = Window/Level（窗宽窗位）
  //   右键拖拽 = Pan（平移）
  //   滚轮     = 切片切换（StackScroll）
  //   中键拖拽 = Zoom（缩放）
  const TOOLS = [
    'Wwwc', 'Pan', 'Zoom', 'Length', 'Angle',
    'EllipticalRoi', 'RectangleRoi', 'Probe',
    'ArrowAnnotate', 'FreehandRoi', 'Eraser', 'StackScroll'
  ];

  // ---------- 初始化 ----------
  function init() {
    if (_initialized) return;
    _initialized = true;

    try {
      cornerstoneTools.init();

      // 注册所有工具
      TOOLS.forEach(function (name) {
        var ToolClass = _getToolClass(name);
        if (ToolClass) {
          try { cornerstoneTools.addTool(ToolClass); } catch (e) { /* 可能已注册 */ }
        }
      });

      // 配置箭头标注
      if (cornerstoneTools.ArrowAnnotateTool) {
        cornerstoneTools.ArrowAnnotateTool.setConfiguration({
          getTextCallback: function (callback) {
            var text = prompt('请输入注释文本:', '标注');
            callback(text || '标注');
          }
        });
      }

      // 绑定到所有现有元素
      rebindToElements();

      // 设置默认工具（Wwwc 左键，Pan 右键，Zoom 中键，StackScroll 滚轮）
      _applyDefaultToolBinding();

      console.log('DICOMTools 初始化完成');
    } catch (e) {
      console.error('DICOMTools 初始化失败:', e);
    }
  }

  // ---------- 获取工具类 ----------
  function _getToolClass(name) {
    var map = {
      'Wwwc': cornerstoneTools.WwwcTool,
      'Pan': cornerstoneTools.PanTool,
      'Zoom': cornerstoneTools.ZoomTool,
      'Length': cornerstoneTools.LengthTool,
      'Angle': cornerstoneTools.AngleTool,
      'EllipticalRoi': cornerstoneTools.EllipticalRoiTool,
      'RectangleRoi': cornerstoneTools.RectangleRoiTool,
      'Probe': cornerstoneTools.ProbeTool,
      'ArrowAnnotate': cornerstoneTools.ArrowAnnotateTool,
      'FreehandRoi': cornerstoneTools.FreehandRoiTool,
      'Eraser': cornerstoneTools.EraserTool,
      'StackScroll': cornerstoneTools.StackScrollTool
    };
    return map[name] || null;
  }

  // ---------- 重新绑定工具到所有元素 ----------
  function rebindToElements() {
    var elements = ViewportManager.getElements();
    elements.forEach(function (el) {
      TOOLS.forEach(function (name) {
        try {
          cornerstoneTools.addToolForElement(el, _getToolClass(name));
        } catch (e) { /* 忽略重复添加 */ }
      });
    });
    _applyDefaultToolBinding();
  }

  // ---------- 应用默认工具绑定 ----------
  function _applyDefaultToolBinding() {
    var elements = ViewportManager.getElements();
    elements.forEach(function (el) {
      try {
        // 左键: Wwwc（窗宽窗位）
        cornerstoneTools.setToolActiveForElement(el, 'Wwwc', { mouseButtonMask: 1 });
        // 右键: Pan（平移）
        cornerstoneTools.setToolActiveForElement(el, 'Pan', { mouseButtonMask: 2 });
        // 滚轮: StackScroll（切片切换）
        cornerstoneTools.setToolActiveForElement(el, 'StackScroll', { mouseButtonMask: 0 });
        // 中键: Zoom（缩放）
        cornerstoneTools.setToolActiveForElement(el, 'Zoom', { mouseButtonMask: 4 });
      } catch (e) {
        console.warn('默认工具绑定失败:', e.message);
      }
    });
  }

  // ---------- 设置活动测量/标注工具（左键覆盖） ----------
  function setActiveTool(toolName) {
    if (!toolName) return;

    var elements = ViewportManager.getElements();

    // 先恢复默认绑定（右键 Pan、滚轮 StackScroll、中键 Zoom 保持不变）
    elements.forEach(function (el) {
      try {
        // 禁用所有工具的左键绑定
        TOOLS.forEach(function (name) {
          try {
            cornerstoneTools.setToolDisabledForElement(el, name);
          } catch (e) { /* ignore */ }
        });

        // 仍然保持右键 Pan 和滚轮 StackScroll
        cornerstoneTools.setToolActiveForElement(el, 'Pan', { mouseButtonMask: 2 });
        cornerstoneTools.setToolActiveForElement(el, 'StackScroll', { mouseButtonMask: 0 });
        cornerstoneTools.setToolActiveForElement(el, 'Zoom', { mouseButtonMask: 4 });
      } catch (e) { /* ignore */ }
    });

    // 激活选中工具的左键
    elements.forEach(function (el) {
      try {
        cornerstoneTools.setToolActiveForElement(el, toolName, { mouseButtonMask: 1 });
      } catch (e) {
        console.warn('激活工具失败:', toolName, e.message);
      }
    });

    AppState.setActiveTool(toolName);
    return toolName;
  }

  // ---------- 应用窗宽窗位预设 ----------
  function applyPreset(presetName) {
    var preset = WL_PRESETS[presetName];
    if (!preset) return false;

    var elements = ViewportManager.getElements();
    elements.forEach(function (el) {
      try {
        var enabled = cornerstone.getEnabledElement(el);
        if (enabled && enabled.viewport) {
          enabled.viewport.voi.windowWidth = preset.windowWidth;
          enabled.viewport.voi.windowCenter = preset.windowCenter;
          cornerstone.setViewport(el, enabled.viewport);
        }
      } catch (e) { /* ignore */ }
    });

    return true;
  }

  // ---------- 清除所有测量/标注 ----------
  function clearAllMeasurements() {
    try {
      var toolState = cornerstoneTools.globalImageIdSpecificToolStateManager;
      toolState.restoreToolState();
      setActiveTool(AppState.getActiveTool());
    } catch (e) {
      console.warn('清除测量失败:', e);
    }
  }

  function getPresets() { return WL_PRESETS; }
  function getPresetNames() { return Object.keys(WL_PRESETS); }
  function getPresetLabel(name) { return WL_PRESETS[name] ? WL_PRESETS[name].label : name; }

  return {
    init: init,
    rebindToElements: rebindToElements,
    setActiveTool: setActiveTool,
    applyPreset: applyPreset,
    clearAllMeasurements: clearAllMeasurements,
    getPresets: getPresets,
    getPresetNames: getPresetNames,
    getPresetLabel: getPresetLabel
  };
})();