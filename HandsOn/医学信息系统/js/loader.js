/* ============================================================
   loader.js — DICOM 文件加载与序列管理
   修复：使用 dicomParser 直接解析元数据，避免全量加载
   ============================================================ */

const DICOMLoader = (function () {
  'use strict';

  let _fileManager = null;

  function _init() {
    if (!_fileManager) {
      _fileManager = cornerstoneWADOImageLoader.wadouri.fileManager;
    }
  }

  // ---------- 从 FileList 加载 ----------
  async function loadFromFiles(files) {
    _init();

    var dicomFiles = Array.from(files).filter(function (f) {
      var name = f.name.toLowerCase();
      return name.endsWith('.dcm') || name.endsWith('.dicom') || name.indexOf('.') === -1;
    });

    if (dicomFiles.length === 0) {
      throw new Error('未找到 DICOM 文件（.dcm）');
    }

    // 第一步：直接用 dicomParser 读取元数据（不加载完整图像）
    var entries = [];
    for (var i = 0; i < dicomFiles.length; i++) {
      var file = dicomFiles[i];
      var meta = await _readFileMeta(file);
      // 创建 imageId（但不加载）
      var imageId = _fileManager.add(file);
      entries.push({
        imageId: imageId,
        file: file,
        meta: meta,
        index: i
      });
    }

    // 第二步：按序列分组
    var series = _groupByMeta(entries);

    // 更新状态
    AppState.setSeries(series);
    AppState.set('files', dicomFiles);

    return series;
  }

  // ---------- 使用 dicomParser 读取文件元数据 ----------
  function _readFileMeta(file) {
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var arrayBuffer = e.target.result;
          var data = dicomParser.parseDicom(arrayBuffer, {
            untilTag: 'x7fe00010' // 只解析到像素数据之前的标签
          });

          if (!data || !data.string) {
            resolve(_extractMetaFromDataSet(null, file.name));
            return;
          }

          var meta = {
            seriesUid: data.string('x0020000e') || '',
            seriesNumber: data.intString('x00200011'),
            seriesDescription: data.string('x0008103e') || '',
            modality: data.string('x00080060') || 'OT',
            instanceNumber: data.intString('x00200013'),
            sopClassUid: data.string('x00080016') || '',
            // 患者
            patientName: data.string('x00100010') || '',
            patientId: data.string('x00100020') || '',
            patientBirthDate: data.string('x00100030') || '',
            patientSex: data.string('x00100040') || '',
            patientAge: data.string('x00101010') || '',
            // 检查
            studyDate: data.string('x00080020') || '',
            studyTime: data.string('x00080030') || '',
            studyDescription: data.string('x00081030') || '',
            studyInstanceUid: data.string('x0020000d') || '',
            referringPhysician: data.string('x00080090') || '',
            // 设备
            institutionName: data.string('x00080080') || '',
            manufacturer: data.string('x00080070') || '',
            stationName: data.string('x00081010') || ''
          };

          resolve(meta);
        } catch (err) {
          console.warn('解析 DICOM 失败:', file.name, err.message);
          resolve(_extractMetaFromDataSet(null, file.name));
        }
      };
      reader.onerror = function () {
        resolve(_extractMetaFromDataSet(null, file.name));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function _extractMetaFromDataSet(data, fileName) {
    // 尝试从文件名推断系列（如 "1-001.dcm" 中的 "1"）
    var inferredSeries = '';
    var inferredInstance = 0;
    var match = fileName.match(/^(\d+)-(\d+)/);
    if (match) {
      inferredSeries = match[1];
      inferredInstance = parseInt(match[2]) || 0;
    }

    return {
      seriesUid: '',
      seriesNumber: inferredSeries ? parseInt(inferredSeries) : 0,
      seriesDescription: fileName ? '文件导入' : '',
      modality: 'OT',
      instanceNumber: inferredInstance,
      sopClassUid: '',
      patientName: '',
      patientId: '',
      patientBirthDate: '',
      patientSex: '',
      patientAge: '',
      studyDate: '',
      studyTime: '',
      studyDescription: '',
      studyInstanceUid: '',
      referringPhysician: '',
      institutionName: '',
      manufacturer: '',
      stationName: ''
    };
  }

  // ---------- 按元数据分组 ----------
  function _groupByMeta(entries) {
    var seriesMap = new Map();
    var hasRealUid = false;

    // 先检查是否有真实的 SeriesUID
    entries.forEach(function (entry) {
      if (entry.meta && entry.meta.seriesUid && entry.meta.seriesUid.trim()) {
        hasRealUid = true;
      }
    });

    entries.forEach(function (entry) {
      var meta = entry.meta;
      // 如果所有文件都没有 SeriesUID（或全部相同），则全部归为一组
      var uid;
      if (!hasRealUid) {
        uid = '_all_files_';
      } else {
        uid = meta.seriesUid && meta.seriesUid.trim() ? meta.seriesUid : '_all_files_';
      }

      if (!seriesMap.has(uid)) {
        var desc = meta.seriesDescription || '未知序列';
        // 如果所有文件归为一组，显示总文件数
        if (uid === '_all_files_') {
          desc = '全部文件 (' + entries.length + ' 张)';
        }
        seriesMap.set(uid, {
          seriesInstanceUid: uid,
          seriesNumber: meta.seriesNumber || 0,
          seriesDescription: desc,
          modality: meta.modality || 'OT',
          sopClassUid: meta.sopClassUid || '',
          images: []
        });
      }

      seriesMap.get(uid).images.push({
        imageId: entry.imageId,
        instanceNumber: meta.instanceNumber || entry.index,
        meta: meta,
        index: entry.index
      });
    });

    // 序列内按 InstanceNumber 排序
    seriesMap.forEach(function (s) {
      s.images.sort(function (a, b) {
        return (a.instanceNumber || 0) - (b.instanceNumber || 0);
      });
    });

    // 转数组并按 SeriesNumber 排序
    var result = Array.from(seriesMap.values());
    result.sort(function (a, b) {
      return (a.seriesNumber || 0) - (b.seriesNumber || 0);
    });

    return result;
  }

  // ---------- 提取 DICOM 标签（用于叠加层，从缓存中读取） ----------
  function extractDicomTags(imageId) {
    // 从缓存中查找元数据
    var series = AppState.getSeries();
    for (var si = 0; si < series.length; si++) {
      var images = series[si].images;
      for (var ii = 0; ii < images.length; ii++) {
        if (images[ii].imageId === imageId) {
          return images[ii].meta || null;
        }
      }
    }

    // 尝试通过 cornerstone 元数据获取
    try {
      var patient = cornerstone.metaData.get('patientModule', imageId) || {};
      var study = cornerstone.metaData.get('generalStudyModule', imageId) || {};
      var meta = cornerstone.metaData.get('generalSeriesModule', imageId) || {};
      var equip = cornerstone.metaData.get('generalEquipmentModule', imageId) || {};

      return {
        patientName: patient.patientName,
        patientId: patient.patientId,
        patientBirthDate: patient.patientBirthDate,
        patientSex: patient.patientSex,
        patientAge: patient.patientAge,
        studyDate: study.studyDate,
        studyTime: study.studyTime,
        studyDescription: study.studyDescription,
        seriesDescription: meta.seriesDescription,
        seriesNumber: meta.seriesNumber,
        instanceNumber: meta.instanceNumber,
        modality: meta.modality,
        institutionName: equip.institutionName,
        manufacturer: equip.manufacturer,
        referringPhysician: study.referringPhysicianName
      };
    } catch (e) {
      return null;
    }
  }

  // ---------- 获取序列树 ----------
  function getSeriesTree() {
    var series = AppState.getSeries();
    var currentIdx = AppState.getCurrentSeriesIndex();
    return series.map(function (s, idx) {
      return {
        index: idx,
        seriesNumber: s.seriesNumber,
        seriesDescription: s.seriesDescription,
        modality: s.modality,
        imageCount: s.images.length,
        isActive: idx === currentIdx
      };
    });
  }

  function getCurrentImageIds() {
    var series = AppState.getCurrentSeries();
    return series ? series.images.map(function (img) { return img.imageId; }) : [];
  }

  function getSeriesImageIds(seriesIndex) {
    var series = AppState.getSeries()[seriesIndex];
    return series ? series.images.map(function (img) { return img.imageId; }) : [];
  }

  // ---------- 格式化工具 ----------
  function formatDate(d) {
    if (!d) return '-';
    var s = String(d);
    return s.length === 8 ? s.slice(0,4) + '-' + s.slice(4,6) + '-' + s.slice(6,8) : s;
  }

  function formatTime(t) {
    if (!t) return '-';
    var s = String(t).slice(0,6);
    return s.length === 6 ? s.slice(0,2) + ':' + s.slice(2,4) + ':' + s.slice(4,6) : s;
  }

  function formatPatientName(name) {
    if (!name) return '-';
    return String(name).replace(/\^/g, ' ');
  }

  return {
    loadFromFiles: loadFromFiles,
    extractDicomTags: extractDicomTags,
    getSeriesTree: getSeriesTree,
    getCurrentImageIds: getCurrentImageIds,
    getSeriesImageIds: getSeriesImageIds,
    formatDate: formatDate,
    formatTime: formatTime,
    formatPatientName: formatPatientName
  };
})();