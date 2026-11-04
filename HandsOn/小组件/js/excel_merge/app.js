/* ============================================================
   app.js — Excel / CSV 合并工具（网页版）
   ------------------------------------------------------------
   与原桌面版流程一致：
     阶段一  xlsx 流式转 CSV（表头按名称对齐、日期还原、长数字保精度）
     阶段二  多个 CSV 流式合并（表头一致直通 / 不一致按名称并集）
     可选    输出 .xlsx（超过 104 万行自动分表）
   中间文件写进 OPFS（浏览器私有文件系统），不占内存、不上传。
   ============================================================ */

import { openXlsx, writeXlsx, looksLikeHeader, alignRow } from './xlsx.js';
import {
  CsvWriter, csvStream, readCsvHeader, formatBytes, formatDuration,
} from './csv.js';

/* ---------------- DOM ---------------- */
const $ = (id) => document.getElementById(id);
const dropZone = $('dropZone');
const fileListEl = $('fileList');
const fileHint = $('fileHint');
const logBox = $('logBox');
const barFill = document.querySelector('.bar-fill');
const stageText = $('stageText');
const pctText = $('pctText');
const btnRun = $('btnRun');
const btnToCsv = $('btnToCsv');
const btnMergeCsv = $('btnMergeCsv');
const btnCancel = $('btnCancel');
const resultPanel = $('resultPanel');
const resultBody = $('resultBody');

const state = {
  files: [],
  busy: false,
  cancelled: false,
  seq: 0,
  store: null,       // 保留给「下载中间 CSV」用
  keepNames: null,
};

class CancelError extends Error {
  constructor() { super('已取消'); this.name = 'CancelError'; }
}

/* ---------------- 日志 ---------------- */
let userScrolledUp = false;
logBox.addEventListener('scroll', () => {
  userScrolledUp = logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight > 40;
});

function pushLine(text, cls) {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = text;
  logBox.appendChild(line);
  while (logBox.childElementCount > 3000) logBox.removeChild(logBox.firstChild);
  if (!userScrolledUp) logBox.scrollTop = logBox.scrollHeight;
}

const log = (m = '') => pushLine(m, '');
const logWarn = (m) => pushLine(m, 'log-warn');
const logErr = (m) => pushLine(m, 'log-err');

function clearLog() {
  logBox.textContent = '';
  userScrolledUp = false;
}

/* ---------------- 进度 ---------------- */
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function setProgress(pct, stage) {
  const p = Math.max(0, Math.min(100, pct));
  barFill.style.width = p.toFixed(2) + '%';
  pctText.textContent = p.toFixed(0) + '%';
  if (stage) stageText.textContent = stage;
}

/* ---------------- 执行上下文 ---------------- */
const ctx = {
  from: 0,
  to: 100,
  fileIndex: 0,
  fileCount: 1,
  fileLabel: '',
  range(from, to) { this.from = from; this.to = to; },
  file(i, count, label) { this.fileIndex = i; this.fileCount = count; this.fileLabel = label; },
  sub(frac = 0, label) {
    const f = clamp01(frac);
    const overall = (this.fileIndex + f) / Math.max(1, this.fileCount);
    setProgress(this.from + (this.to - this.from) * overall,
      label || (this.fileLabel ? `${this.fileLabel}　${Math.round(f * 100)}%` : ''));
  },
  cancelled() { return state.cancelled; },
  log,
  logWarn,
  logErr,
};

/* ---------------- 文件列表 ---------------- */
const KIND_LABEL = { xlsx: 'Excel', csv: 'CSV' };

function kindOf(name) {
  const n = name.toLowerCase();
  if (n.endsWith('.xlsx') || n.endsWith('.xlsm')) return 'xlsx';
  if (n.endsWith('.csv')) return 'csv';
  if (n.endsWith('.xls')) return 'xls-old';
  return null;
}

const isTempFile = (name) => name.split('/').pop().startsWith('~$');

function addFiles(list) {
  let added = 0;
  let skipped = 0;
  const seen = new Set(state.files.map((f) => f.name + '|' + f.size));
  for (const f of list) {
    const base = f.name.split(/[\\/]/).pop();
    if (isTempFile(base)) { skipped++; continue; }
    const kind = kindOf(base);
    if (kind === 'xls-old') {
      logWarn(`跳过（老的 .xls 格式，请先另存为 .xlsx）：${base}`);
      skipped++;
      continue;
    }
    if (!kind) { skipped++; continue; }
    const key = base + '|' + f.size;
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    state.files.push({ id: ++state.seq, name: base, size: f.size, kind, file: f });
    added++;
  }
  renderFiles();
  if (added) log(`添加 ${added} 个文件，当前共 ${state.files.length} 个` + (skipped ? `（跳过 ${skipped} 个）` : ''));
  else if (skipped) logWarn(`没有可添加的文件（跳过 ${skipped} 个）`);
}

function renderFiles() {
  fileListEl.textContent = '';
  for (const f of state.files) {
    const li = document.createElement('li');
    li.className = 'file-item';

    const dot = document.createElement('span');
    dot.className = 'file-kind file-kind-' + f.kind;
    dot.textContent = KIND_LABEL[f.kind];

    const nm = document.createElement('span');
    nm.className = 'file-name';
    nm.textContent = f.name;
    nm.title = f.name;

    const sz = document.createElement('span');
    sz.className = 'file-size';
    sz.textContent = formatBytes(f.size);

    const del = document.createElement('button');
    del.className = 'file-del';
    del.type = 'button';
    del.setAttribute('aria-label', '移除');
    del.textContent = '×';
    del.addEventListener('click', () => {
      if (state.busy) return;
      state.files = state.files.filter((x) => x.id !== f.id);
      renderFiles();
    });

    li.append(dot, nm, sz, del);
    fileListEl.appendChild(li);
  }

  const excelCount = state.files.filter((f) => f.kind === 'xlsx').length;
  const csvCount = state.files.filter((f) => f.kind === 'csv').length;
  const total = state.files.reduce((a, f) => a + f.size, 0);
  fileHint.textContent = state.files.length
    ? `共 ${state.files.length} 个文件（Excel ${excelCount} · CSV ${csvCount}），合计 ${formatBytes(total)}`
    : '尚未选择文件，可直接把文件或文件夹拖到这里';
  dropZone.classList.toggle('has-files', state.files.length > 0);
}

/* ---------------- 拖拽 / 选择 ---------------- */
function collectEntry(entry, out, depth = 0) {
  return new Promise((resolve) => {
    if (!entry || depth > 6) return resolve();
    if (entry.isFile) {
      entry.file((f) => { out.push(f); resolve(); }, () => resolve());
      return;
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      const all = [];
      const readBatch = () => {
        reader.readEntries(async (batch) => {
          if (!batch.length) {
            for (const e of all) await collectEntry(e, out, depth + 1);
            resolve();
            return;
          }
          all.push(...batch);
          readBatch();
        }, () => resolve());
      };
      readBatch();
      return;
    }
    resolve();
  });
}

['dragenter', 'dragover'].forEach((ev) => {
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add('dragging'); });
});
['dragleave', 'drop'].forEach((ev) => {
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove('dragging'); });
});
dropZone.addEventListener('drop', async (e) => {
  const dt = e.dataTransfer;
  if (!dt || state.busy) return;
  const items = dt.items;
  if (items && items.length && items[0].webkitGetAsEntry) {
    const entries = [];
    for (const it of items) {
      const en = it.webkitGetAsEntry && it.webkitGetAsEntry();
      if (en) entries.push(en);
    }
    const out = [];
    for (const en of entries) await collectEntry(en, out);
    if (out.length) addFiles(out);
  } else if (dt.files) {
    addFiles([...dt.files]);
  }
});

/* ---------------- 临时存储（OPFS 优先，失败回落内存） ---------------- */
class MemoryStore {
  constructor() { this.map = new Map(); }
  async create(name) {
    const chunks = [];
    let size = 0;
    this.map.set(name, chunks);
    return {
      name,
      write: async (u8) => { chunks.push(u8.slice()); size += u8.length; },
      close: async () => {},
      get size() { return size; },
    };
  }
  async blob(name) { return new Blob(this.map.get(name) || [], { type: 'text/csv' }); }
  async dispose() { this.map.clear(); }
}

class OpfsStore {
  constructor(dir) { this.dir = dir; }
  async create(name) {
    const fh = await this.dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    let size = 0;
    let closed = false;
    return {
      name,
      write: async (u8) => { await w.write(u8); size += u8.length; },
      close: async () => { if (!closed) { closed = true; await w.close(); } },
      get size() { return size; },
    };
  }
  async blob(name) {
    const fh = await this.dir.getFileHandle(name);
    return fh.getFile();
  }
  async dispose() {
    try {
      for await (const [name] of this.dir.entries()) {
        try { await this.dir.removeEntry(name, { recursive: true }); } catch (_) { /* 忽略 */ }
      }
    } catch (_) { /* 忽略 */ }
  }
}

async function createTempStore() {
  if (navigator.storage && navigator.storage.getDirectory) {
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('excel-merge-tmp', { create: true });
      const store = new OpfsStore(dir);
      await store.dispose();
      return store;
    } catch (e) {
      console.warn('OPFS 不可用，改用内存临时区', e);
    }
  }
  return new MemoryStore();
}

/* ---------------- 输出目标 ---------------- */
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const canPickFile = () => typeof window.showSaveFilePicker === 'function';
const canPickDir = () => typeof window.showDirectoryPicker === 'function';

async function pickOutputFile(suggestName, fmt) {
  if (canPickFile()) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: suggestName,
        types: [fmt === 'xlsx'
          ? { description: 'Excel 工作簿', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }
          : { description: 'CSV 文件', accept: { 'text/csv': ['.csv'] } }],
      });
      return { handle, name: handle.name, download: false };
    } catch (e) {
      if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return null;
      throw e;
    }
  }
  return { handle: null, name: suggestName, download: true };
}

async function pickOutputDir() {
  if (canPickDir()) {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      return { handle, download: false };
    } catch (e) {
      if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return null;
      throw e;
    }
  }
  return { handle: null, download: true };
}

async function fileSink(fileHandle) {
  const w = await fileHandle.createWritable();
  let closed = false;
  return {
    sink: { write: (u8) => w.write(u8) },
    close: async () => { if (!closed) { closed = true; await w.close(); } },
    abort: async () => { if (!closed) { closed = true; try { await w.abort(); } catch (_) { /* 忽略 */ } } },
  };
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

/* ---------------- 选项 / 小工具 ---------------- */
function readOptions() {
  return {
    sheetMode: $('optSheet').value,
    dateMode: $('optDate').value,
    encoding: $('optEncoding').value,
    outFormat: $('optFormat').value,
    addSource: $('optSource').checked,
    keepParts: $('optParts').checked,
  };
}

function sameArr(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const withSource = (row, name, addSource) => (addSource ? row.concat([name]) : row);
const shortName = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s.padEnd(n));

/* ============================================================
   阶段一：单个 xlsx -> CSV
   ============================================================ */
async function convertXlsxToCsv(file, entryName, sink, opts) {
  const book = await openXlsx(file);
  let sheets = book.sheets;
  if (opts.sheetMode === 'first') sheets = sheets.slice(0, 1);
  if (!sheets.length) throw new Error('文件里没有工作表');

  let estTotal = 0;
  for (const sh of sheets) estTotal += await book.declaredRows(sh.path);

  const writer = new CsvWriter(sink, opts.encoding);
  let baseHeader = null;
  let totalRows = 0;
  let done = 0;
  let sheetRows = 0;

  for (const sh of sheets) {
    if (ctx.cancelled()) throw new CancelError();
    let first = true;
    let sheetHeader = baseHeader;
    let count = 0;

    for await (const row of book.sheetRows(sh.path, opts.dateMode)) {
      if (ctx.cancelled()) throw new CancelError();
      done++;
      if (done % 5000 === 0) ctx.sub(estTotal ? done / estTotal : 0);
      if (!row.length || !row.some((v) => v !== '')) continue;

      if (first) {
        first = false;
        if (baseHeader === null) {
          if (looksLikeHeader(row)) {
            baseHeader = row.slice();
            sheetHeader = baseHeader;
            await writer.writeRow(withSource(baseHeader, entryName, opts.addSource));
            continue;
          }
          baseHeader = row.map((_, i) => '列' + (i + 1));
          sheetHeader = baseHeader;
          await writer.writeRow(withSource(baseHeader, entryName, opts.addSource));
          log(`    注意：${sh.name} 首行不像表头，已按列号生成列名`);
          await writer.writeRow(withSource(row.slice(), entryName, opts.addSource));
          count++;
          continue;
        }
        if (looksLikeHeader(row)) {
          if (row.length === baseHeader.length && !sameArr(row, baseHeader)) {
            log(`    注意：${sh.name} 表头与首个工作表不同，已按表头名对齐`);
          }
          sheetHeader = row.slice();
          continue;
        }
        sheetHeader = baseHeader;
        await writer.writeRow(withSource(alignRow(row, sheetHeader, baseHeader), entryName, opts.addSource));
        count++;
        continue;
      }

      await writer.writeRow(withSource(alignRow(row, sheetHeader, baseHeader), entryName, opts.addSource));
      count++;
    }

    log(`  ${shortName(sh.name, 20)} ${String(count).padStart(9)} 行`);
    totalRows += count;
    sheetRows += 1;
  }

  await writer.close();
  if (baseHeader === null) throw new Error('没有读到任何表头（文件可能是空的）');
  return { rows: totalRows, bytes: writer.bytes, sheets: sheetRows };
}

/* ============================================================
   阶段二：合并多个 CSV
   ============================================================ */
async function mergeCsvs(items, writer, opts) {
  const headers = [];
  for (const it of items) headers.push(await readCsvHeader(it.blob));

  const base = headers[0];
  const allSame = !!base && headers.every((h) => h && sameArr(h, base));

  let merged;
  if (allSame) {
    merged = base.slice();
    log('  表头完全一致，按列顺序直通合并');
  } else {
    merged = [];
    for (const h of headers) {
      if (!h) continue;
      for (const c of h) if (!merged.includes(c)) merged.push(c);
    }
    log(`  表头不一致，按表头名重排后合并（并集 ${merged.length} 列）`);
  }

  await writer.writeRow(withSource(merged, '', opts.addSource));

  let total = 0;
  for (let i = 0; i < items.length; i++) {
    if (ctx.cancelled()) throw new CancelError();
    ctx.file(i, items.length, items[i].name);
    ctx.sub(0);

    const h = headers[i] || [];
    const mapping = merged.map((c) => h.indexOf(c));
    let first = true;
    let n = 0;

    for await (const row of csvStream(items[i].blob)) {
      if (ctx.cancelled()) throw new CancelError();
      if (first) { first = false; ctx.sub(0.05); continue; }
      if (!row.length || !row.some((v) => v !== '')) continue;
      const out = new Array(mapping.length);
      for (let k = 0; k < mapping.length; k++) {
        const idx = mapping[k];
        out[k] = (idx >= 0 && idx < row.length) ? row[idx] : '';
      }
      await writer.writeRow(withSource(out, items[i].name, opts.addSource));
      n++;
      if (n % 20000 === 0) ctx.sub(0.5, `${shortName(items[i].name, 22)} 已 ${n.toLocaleString()} 行`);
    }
    total += n;
    log(`  ${shortName(items[i].name, 30)} ${String(n).padStart(9)} 行`);
    ctx.sub(1);
  }
  return total;
}

/* ============================================================
   合并结果 -> 目标（CSV 直写 / 先合并再写 xlsx）
   ============================================================ */
async function mergeInto(target, fmt, items, store, opts) {
  if (fmt === 'xlsx') {
    const tmpName = '__merged_tmp.csv';
    const tmp = await store.create(tmpName);
    const writer = new CsvWriter(tmp, opts.encoding);
    const rows = await mergeCsvs(items, writer, opts);
    await writer.close();
    await tmp.close();
    log(`  合并完成 ${rows.toLocaleString()} 行，正在写入 Excel…`);
    ctx.range(80, 100);

    const srcBlob = await store.blob(tmpName);
    const onProg = (n) => setProgress(
      80 + 20 * Math.min(0.99, n / Math.max(rows, 1)),
      `写入 Excel：${n.toLocaleString()} 行`,
    );

    if (target.download) {
      const outTmp = await store.create('__out.xlsx');
      await writeXlsx(outTmp, csvStream(srcBlob), {
        shouldCancel: () => state.cancelled,
        onProgress: onProg,
      });
      await outTmp.close();
      downloadBlob(await store.blob('__out.xlsx'), target.name);
      log(`  已生成 ${target.name} 并开始下载`);
    } else {
      const fs = await fileSink(target.handle);
      state.outSink = fs;
      try {
        const res = await writeXlsx(fs.sink, csvStream(srcBlob), {
          shouldCancel: () => state.cancelled,
          onProgress: onProg,
        });
        await fs.close();
        log(`  Excel 写入完成：${res.sheets} 个工作表`);
      } catch (e) {
        await fs.abort();
        throw e;
      } finally {
        state.outSink = null;
      }
    }
    return rows;
  }

  /* ---- 输出 CSV ---- */
  if (target.download) {
    const tmp = await store.create('__out.csv');
    const writer = new CsvWriter(tmp, opts.encoding);
    const rows = await mergeCsvs(items, writer, opts);
    await writer.close();
    await tmp.close();
    downloadBlob(await store.blob('__out.csv'), target.name);
    return rows;
  }

  const fs = await fileSink(target.handle);
  state.outSink = fs;
  try {
    const writer = new CsvWriter(fs.sink, opts.encoding);
    const rows = await mergeCsvs(items, writer, opts);
    await writer.close();
    await fs.close();
    return rows;
  } catch (e) {
    await fs.abort();
    throw e;
  } finally {
    state.outSink = null;
  }
}

/* ============================================================
   主流程
   ============================================================ */
async function runJob(mode) {
  if (state.busy) return;

  const opts = readOptions();
  const files = state.files.slice();

  if (!files.length) {
    logWarn('提示：请先添加要处理的文件。');
    stageText.textContent = '请先添加文件';
    return;
  }
  if (mode === 'merge_csv') {
    if (files.some((f) => f.kind !== 'csv')) {
      logWarn('「仅合并已有 CSV」只能处理 .csv 文件；含 Excel 请用「转换并合并」。');
      return;
    }
  } else if (files.some((f) => f.kind === 'csv')) {
    logWarn('所选文件里包含 CSV；合并 CSV 请点「仅合并已有 CSV」。');
    return;
  }

  /* ---- 先选输出位置（借用户点击的有效期，和桌面版「另存为」一致） ---- */
  const outFmt = (opts.outFormat === 'xlsx' && mode !== 'to_csv') ? 'xlsx' : 'csv';
  let target = null;
  let dirTarget = null;
  if (mode === 'to_csv') {
    dirTarget = await pickOutputDir();
    if (!dirTarget) return;
  } else {
    const nm = outFmt === 'xlsx' ? `合并结果_${stamp()}.xlsx` : `合并结果_${stamp()}.csv`;
    target = await pickOutputFile(nm, outFmt);
    if (!target) return;
  }

  /* ---- 开始 ---- */
  state.busy = true;
  state.cancelled = false;
  state.outSink = null;
  hideResult();
  clearLog();
  setBusy(true);
  ctx.range(0, 100);
  setProgress(0, '准备中…');

  const t0 = performance.now();
  let store = null;

  try {
    store = await createTempStore();
    state.store = store;

    /* ========== 仅转 CSV ========== */
    if (mode === 'to_csv') {
      ctx.range(0, 100);
      log(`逐个转成 CSV（不合并），共 ${files.length} 个文件`);
      log('');

      const outputs = [];
      let totalRows = 0;
      let ok = 0;

      for (let i = 0; i < files.length; i++) {
        if (state.cancelled) throw new CancelError();
        const f = files[i];
        const csvName = f.name.replace(/\.(xlsx|xlsm)$/i, '') + '.csv';
        ctx.file(i, files.length, f.name);
        ctx.sub(0);
        log(`[${i + 1}/${files.length}] ${f.name}  (${formatBytes(f.size)})`);

        let handle = null;
        let temp = null;
        try {
          let sink;
          if (dirTarget.handle) {
            handle = await fileSink(await dirTarget.handle.getFileHandle(csvName, { create: true }));
            sink = handle.sink;
          } else {
            temp = await store.create(csvName);
            sink = temp;
          }
          const res = await convertXlsxToCsv(f.file, f.name, sink, opts);
          if (handle) await handle.close();
          else await temp.close();
          totalRows += res.rows;
          ok++;
          outputs.push({ name: csvName, rows: res.rows, temp: !dirTarget.handle });
          log(`  → ${res.rows.toLocaleString()} 行：${csvName}`);
        } catch (e) {
          if (handle) await handle.abort();
          else if (temp) { try { await temp.close(); } catch (_) { /* 忽略 */ } }
          if (e instanceof CancelError) throw e;
          logErr(`  [失败] ${f.name} : ${e.message}`);
        }
        ctx.sub(1);
        log('');
      }

      if (!ok) throw new Error('没有任何文件转换成功，请检查源文件能否正常打开。');

      setProgress(100, '完成');
      log(`完成：${ok} 个文件，合计 ${totalRows.toLocaleString()} 行，用时 ${formatDuration((performance.now() - t0) / 1000)}`);

      if (!dirTarget.handle) {
        for (const o of outputs) {
          downloadBlob(await store.blob(o.name), o.name);
          await new Promise((r) => setTimeout(r, 400));
        }
        log('已逐个触发下载（浏览器可能会询问是否允许下载多个文件）。');
        state.keepNames = outputs.map((o) => o.name);
      } else {
        log('已写入所选文件夹。');
      }

      showResult(outputs.map((o) => ({
        name: o.name, desc: `${o.rows.toLocaleString()} 行`, temp: o.temp,
      })), '转换完成');
      return;
    }

    /* ========== 阶段一 ========== */
    let items = [];
    let partFiles = [];

    if (mode === 'merge_csv') {
      items = files.map((f) => ({ name: f.name, blob: f.file }));
      log(`共 ${files.length} 个 CSV，开始合并`);
      log('');
    } else {
      ctx.range(0, 55);
      log(`阶段 1/2：把 ${files.length} 个 xlsx 转成 CSV（中间文件写入浏览器临时区）`);
      log('');

      let stage1Rows = 0;
      for (let i = 0; i < files.length; i++) {
        if (state.cancelled) throw new CancelError();
        const f = files[i];
        ctx.file(i, files.length, f.name);
        ctx.sub(0);
        log(`[${i + 1}/${files.length}] ${f.name}  (${formatBytes(f.size)})`);

        const partName = `${String(i + 1).padStart(3, '0')}_${f.name.replace(/\.(xlsx|xlsm)$/i, '')}.csv`;
        const t = await store.create(partName);
        try {
          const res = await convertXlsxToCsv(f.file, f.name, t, opts);
          await t.close();
          log(`  → 小计 ${res.rows.toLocaleString()} 行，${formatBytes(res.bytes)}`);
          partFiles.push(partName);
          stage1Rows += res.rows;
        } catch (e) {
          try { await t.close(); } catch (_) { /* 忽略 */ }
          if (e instanceof CancelError) throw e;
          logErr(`  [失败] ${f.name} : ${e.message}`);
        }
        ctx.sub(1);
        log('');
      }

      if (!partFiles.length) throw new Error('没有任何文件转换成功，请检查源文件能否正常打开。');
      log(`阶段 1 完成：${partFiles.length} 个 CSV，合计 ${stage1Rows.toLocaleString()} 行`);
      log('');

      for (const p of partFiles) items.push({ name: p, blob: await store.blob(p) });
    }

    /* ========== 阶段二 ========== */
    ctx.range(55, 80);
    ctx.file(0, 1, '合并中');
    setProgress(55, `阶段 2/2：合并 ${items.length} 个 CSV`);
    log(`阶段 2/2：合并 ${items.length} 个 CSV`);

    const mergedRows = await mergeInto(target, outFmt, items, store, opts);
    log('');

    setProgress(100, '完成');
    const secs = (performance.now() - t0) / 1000;
    log('='.repeat(52));
    log(`完成：${mergedRows.toLocaleString()} 行，用时 ${formatDuration(secs)}`);
    log(`输出：${target.name}${target.download ? '（已下载到本机）' : ''}`);
    log('='.repeat(52));

    /* ---- 中间文件 ---- */
    if (mode === 'full' && opts.keepParts) {
      log(`已保留 ${partFiles.length} 个中间 CSV，可在下方逐个下载。`);
      state.keepNames = partFiles;
      showResult(partFiles.map((n) => ({ name: n, desc: '中间 CSV', temp: true })), '完成（含中间文件）');
    } else {
      showResult([{ name: target.name, desc: `${mergedRows.toLocaleString()} 行` }], '完成');
    }
  } catch (e) {
    if (e instanceof CancelError || state.cancelled) {
      setProgress(0, '已取消');
      log('');
      logWarn('已取消。');
    } else {
      console.error(e);
      setProgress(0, '失败');
      log('');
      logErr('[错误] ' + (e && e.message ? e.message : String(e)));
      logErr('可以换个文件再试；如果每次都失败，把这段日志发给作者看看。');
    }
  } finally {
    if (state.outSink) { try { await state.outSink.abort(); } catch (_) { /* 忽略 */ } state.outSink = null; }
    const keep = state.keepNames && state.keepNames.length;
    if (store && !keep) {
      try { await store.dispose(); } catch (_) { /* 忽略 */ }
      state.store = null;
    }
    state.busy = false;
    setBusy(false);
  }
}

/* ---------------- 结果面板 ---------------- */
function hideResult() {
  resultPanel.hidden = true;
  resultBody.textContent = '';
  state.keepNames = null;
}

function showResult(items, title) {
  resultPanel.hidden = false;
  resultBody.textContent = '';

  const h = document.createElement('p');
  h.className = 'result-title';
  h.textContent = title;
  resultBody.appendChild(h);

  for (const it of items) {
    const row = document.createElement('div');
    row.className = 'result-row';

    const name = document.createElement('span');
    name.className = 'result-name';
    name.textContent = it.name;

    const desc = document.createElement('span');
    desc.className = 'result-desc';
    desc.textContent = it.desc || '';

    row.append(name, desc);

    if (it.temp) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary btn-sm';
      btn.type = 'button';
      btn.textContent = '下载';
      btn.addEventListener('click', async () => {
        if (!state.store) return;
        try {
          downloadBlob(await state.store.blob(it.name), it.name);
        } catch (e) {
          logErr('下载失败：' + e.message);
        }
      });
      row.appendChild(btn);
    }
    resultBody.appendChild(row);
  }
}

/* ---------------- 按钮状态 ---------------- */
function setBusy(busy) {
  btnRun.disabled = busy;
  btnToCsv.disabled = busy;
  btnMergeCsv.disabled = busy;
  btnCancel.disabled = !busy;
  document.body.classList.toggle('is-busy', busy);
}

/* ---------------- 事件绑定 ---------------- */
$('pickFiles').addEventListener('click', () => $('inputFiles').click());
$('pickFolder').addEventListener('click', () => $('inputFolder').click());
$('pickCsv').addEventListener('click', () => $('inputCsv').click());
$('clearFiles').addEventListener('click', () => {
  if (state.busy) return;
  state.files = [];
  renderFiles();
});

$('inputFiles').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
$('inputFolder').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
$('inputCsv').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });

btnRun.addEventListener('click', () => runJob('full'));
btnToCsv.addEventListener('click', () => runJob('to_csv'));
btnMergeCsv.addEventListener('click', () => runJob('merge_csv'));
btnCancel.addEventListener('click', () => {
  state.cancelled = true;
  btnCancel.disabled = true;
  stageText.textContent = '正在取消…';
});
$('clearLog').addEventListener('click', clearLog);

$('optFormat').addEventListener('change', updateFormatHint);
$('optSheet').addEventListener('change', updateFormatHint);

function updateFormatHint() {
  const fmt = $('optFormat').value;
  const hint = $('formatHint');
  hint.textContent = fmt === 'xlsx'
    ? 'Excel：单表上限 104 万行，超出自动分表'
    : 'CSV：无行数上限，推荐';
}

/* ---------------- 能力检测 ---------------- */
function initCapability() {
  const miss = [];
  if (typeof DecompressionStream !== 'function') miss.push('DecompressionStream');
  if (typeof CompressionStream !== 'function') miss.push('CompressionStream');
  const capTip = $('capTip');
  if (miss.length) {
    capTip.hidden = false;
    capTip.textContent = `当前浏览器缺少 ${miss.join(' / ')}，无法解析 xlsx。请改用 Chrome / Edge 103+ 或新版 Safari、Firefox。`;
  }
  const saveTip = $('saveTip');
  if (saveTip && !canPickFile()) {
    saveTip.hidden = false;
    saveTip.textContent = '当前浏览器不支持「先选保存位置」，结果会直接下载到默认下载目录；用 Chrome / Edge 可以像桌面版一样先选路径。';
  }
}

initCapability();
updateFormatHint();
renderFiles();
log('就绪。添加 xlsx 或 CSV 后选择操作即可 —— 全部在本机浏览器内完成，文件不会上传。');
