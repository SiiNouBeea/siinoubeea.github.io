/* ============================================================
   state.js — DICOM 浏览器全局状态管理
   ============================================================ */

const AppState = (function () {
  'use strict';

  // ---------- 内部状态 ----------
  const _state = {
    // 文件数据
    files: [],
    series: [],
    currentSeriesIndex: 0,

    // 视口配置
    viewports: [], // [{element, seriesIndex, imageIdIndex}]
    layout: '1x1', // '1x1' | '1x2' | '2x1' | '2x2'
    viewportCount: 1,

    // 同步设置
    sync: {
      scroll: true,
      zoom: true,
      voi: true,
      pan: true
    },

    // 工具状态
    activeTool: 'Wwwc',
    overlayVisible: true,

    // 初始化标志
    initialized: false
  };

  // 监听器
  const _listeners = {};

  // ---------- 布局配置 ----------
  const LAYOUT_CONFIG = {
    '1x1': { cols: 1, rows: 1, count: 1 },
    '1x2': { cols: 2, rows: 1, count: 2 },
    '2x1': { cols: 1, rows: 2, count: 2 },
    '2x2': { cols: 2, rows: 2, count: 4 }
  };

  // ---------- 公开 API ----------
  return {
    // === 获取状态 ===
    get: function (key) {
      return key ? _state[key] : _state;
    },

    getSeries: function () {
      return _state.series;
    },

    getCurrentSeries: function () {
      if (_state.series.length === 0) return null;
      return _state.series[_state.currentSeriesIndex] || null;
    },

    getCurrentSeriesIndex: function () {
      return _state.currentSeriesIndex;
    },

    getLayout: function () {
      return _state.layout;
    },

    getLayoutConfig: function () {
      return LAYOUT_CONFIG[_state.layout] || LAYOUT_CONFIG['1x1'];
    },

    getViewport: function (index) {
      return _state.viewports[index] || null;
    },

    getViewports: function () {
      return _state.viewports;
    },

    getSync: function () {
      return _state.sync;
    },

    getActiveTool: function () {
      return _state.activeTool;
    },

    isOverlayVisible: function () {
      return _state.overlayVisible;
    },

    // === 更新状态 ===
    set: function (key, value) {
      const old = _state[key];
      _state[key] = value;
      this._emit(key, value, old);
    },

    setSeries: function (series) {
      _state.series = series;
      if (_state.currentSeriesIndex >= series.length) {
        _state.currentSeriesIndex = 0;
      }
      this._emit('series', series);
    },

    setCurrentSeriesIndex: function (index) {
      if (index >= 0 && index < _state.series.length) {
        _state.currentSeriesIndex = index;
        this._emit('currentSeriesIndex', index);
      }
    },

    setLayout: function (layout) {
      if (LAYOUT_CONFIG[layout]) {
        _state.layout = layout;
        _state.viewportCount = LAYOUT_CONFIG[layout].count;
        this._emit('layout', layout);
      }
    },

    setViewport: function (index, data) {
      if (index >= 0 && index < _state.viewports.length) {
        _state.viewports[index] = { ..._state.viewports[index], ...data };
        this._emit('viewport:' + index, _state.viewports[index]);
      }
    },

    setViewports: function (viewports) {
      _state.viewports = viewports;
      this._emit('viewports', viewports);
    },

    setSync: function (key, value) {
      _state.sync[key] = value;
      this._emit('sync', _state.sync);
    },

    setActiveTool: function (tool) {
      _state.activeTool = tool;
      this._emit('activeTool', tool);
    },

    toggleOverlay: function () {
      _state.overlayVisible = !_state.overlayVisible;
      this._emit('overlayVisible', _state.overlayVisible);
    },

    setInitialized: function () {
      _state.initialized = true;
      this._emit('initialized', true);
    },

    isInitialized: function () {
      return _state.initialized;
    },

    // === 事件系统 ===
    on: function (event, callback) {
      if (!_listeners[event]) _listeners[event] = [];
      _listeners[event].push(callback);
      return function () {
        _listeners[event] = _listeners[event].filter(function (cb) {
          return cb !== callback;
        });
      };
    },

    _emit: function (event, data, oldData) {
      if (_listeners[event]) {
        _listeners[event].forEach(function (cb) {
          try { cb(data, oldData); } catch (e) { console.warn('State listener error:', e); }
        });
      }
      // 通用 change 事件
      if (_listeners['change']) {
        _listeners['change'].forEach(function (cb) {
          try { cb(event, data, oldData); } catch (e) { console.warn('State listener error:', e); }
        });
      }
    },

    // === 工具方法 ===
    getLayoutConfigs: function () {
      return LAYOUT_CONFIG;
    },

    reset: function () {
      _state.files = [];
      _state.series = [];
      _state.currentSeriesIndex = 0;
      _state.viewports = [];
      _state.layout = '1x1';
      _state.viewportCount = 1;
      _state.overlayVisible = true;
      this._emit('reset');
    }
  };
})();