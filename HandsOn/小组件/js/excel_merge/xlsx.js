/* ============================================================
   xlsx.js — xlsx 流式读取 + 流式写出
   ------------------------------------------------------------
   读：按 ZIP 条目流式解压 worksheet.xml，逐行解析 <row>，
       共享字符串表 / 单元格样式（日期识别）一次性预载。
       长数字（18 位就诊流水号）原样输出，绝不走浮点，不会丢精度。
   写：流式生成 sheetN.xml 写进 ZIP，超过 Excel 单表上限自动分表。
   ============================================================ */

import { ZipReader, ZipWriter } from './zip.js';

/* Excel 内置的日期 / 时间格式编号 */
const BUILTIN_DATE_IDS = new Set([
  ...range(14, 23), ...range(27, 37), ...range(45, 48), ...range(50, 59),
]);

function range(a, b) {
  const out = [];
  for (let i = a; i < b; i++) out.push(i);
  return out;
}

const XLSX_MAX_DATA_ROWS = 1048575;   // 单表 1048576 行，留 1 行给表头
const MAX_COLS = 16384;

/* ---------------- 通用小工具 ---------------- */
const DIGITS_RE = /^[-+]?\d+(?:\.\d+)?$/;
const DATE_LIKE_RE = /^\d{4}[-/年]\d{1,2}([-/月]\d{1,2})?(日)?([ T]\d{1,2}:\d{2}(:\d{2})?)?$/;

/** 单元格引用 -> 0 基列号。'BC12' -> 54 */
export function colIndex(ref) {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const ch = ref[i];
    if (ch >= 'A' && ch <= 'Z') n = n * 26 + (ch.charCodeAt(0) - 64);
    else if (ch >= 'a' && ch <= 'z') n = n * 26 + (ch.charCodeAt(0) - 96);
    else break;
  }
  return n - 1;
}

/** 0 基列号 -> 列名。54 -> 'BC' */
export function colName(i) {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const XML_ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function unescapeXml(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|lt|gt|amp|quot|apos);/g, (m0, g) => {
    if (g[0] === '#') {
      const code = (g[1] === 'x' || g[1] === 'X')
        ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return isFinite(code) && code >= 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : m0;
    }
    return XML_ENT[g] || m0;
  });
}

const XML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => XML_ESC[c])
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/** Excel 日期序列号 -> 文本（raw 为原始数字字符串，不丢精度） */
export function serialToText(raw, withTime, mode) {
  const f = Number(raw);
  if (!isFinite(f) || f <= 0 || f > 2958466) return raw;
  const days = Math.floor(f);
  const frac = f - days;
  // Excel 1900 闰年 bug：序列 60 是不存在的 1900-02-29
  const baseUtc = Date.UTC(1899, 11, days >= 61 ? 30 : 31);
  let ms = baseUtc + days * 86400000;
  let secs = Math.round(frac * 86400);
  if (secs >= 86400) { ms += 86400000; secs -= 86400; }
  ms += secs * 1000;
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  const hh = String(dt.getUTCHours()).padStart(2, '0');
  const mi = String(dt.getUTCMinutes()).padStart(2, '0');
  const ss = String(dt.getUTCSeconds()).padStart(2, '0');
  if (mode === 'full' || secs > 0) return `${y}-${mo}-${d} ${hh}:${mi}:${ss}`;
  return `${y}-${mo}-${d}`;
}

/* ============================================================
   读取
   ============================================================ */
function parseTextRuns(xml) {
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let s = '';
  let m;
  while ((m = re.exec(xml))) s += unescapeXml(m[1]);
  return s;
}

async function loadSharedStrings(zip) {
  const out = [];
  const dec = new TextDecoder('utf-8');
  const re = /<si\b[^>]*\/>|<si\b[^>]*>[\s\S]*?<\/si>/g;
  let buf = '';
  for await (const chunk of zip.stream('xl/sharedStrings.xml')) {
    buf += dec.decode(chunk, { stream: true });
    re.lastIndex = 0;
    let last = 0;
    let m;
    while ((m = re.exec(buf))) {
      out.push(m[0].charAt(m[0].length - 2) === '/' ? '' : parseTextRuns(m[0]));
      last = re.lastIndex;
    }
    if (last) buf = buf.slice(last);
    // 单个 <si> 理论上有上限，避免异常文件把内存吃满
    if (out.length > 40_000_000) throw new Error('共享字符串表过大');
  }
  const tail = buf + dec.decode();
  if (tail) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(tail))) out.push(parseTextRuns(m[0]));
  }
  return out;
}

function parseStyles(xml) {
  const dateStyles = new Set();
  const timeStyles = new Map();
  if (!xml) return { dateStyles, timeStyles };

  const cx = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!cx) return { dateStyles, timeStyles };

  const ids = [];
  const xfRe = /<xf\b([^>]*?)\/?>/g;
  let m;
  while ((m = xfRe.exec(cx[1]))) {
    const nm = /numFmtId="(\d+)"/.exec(m[1]);
    ids.push(nm ? Number(nm[1]) : 0);
  }

  const custom = new Map();
  const nfRe = /<numFmt\b([^>]*?)\/?>/g;
  while ((m = nfRe.exec(xml))) {
    const idm = /numFmtId="(\d+)"/.exec(m[1]);
    const cm = /formatCode="([^"]*)"/.exec(m[1]);
    if (idm && cm) custom.set(Number(idm[1]), unescapeXml(cm[1]));
  }

  ids.forEach((nid, idx) => {
    let code;
    if (BUILTIN_DATE_IDS.has(nid)) code = 'yyyy-mm-dd';
    else if (custom.has(nid)) code = custom.get(nid);
    else return;
    // 去掉 [$-409] 区域标记与引号内字面量，再判断是否日期格式
    let probe = code.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '').replace(/\\/g, '');
    if (!/[yYdDhHsS]/.test(probe)) return;
    if (/[#0?]/.test(probe)) return;     // 含数字占位符就是普通数值格式
    dateStyles.add(idx);
    timeStyles.set(idx, /[hHsS]/.test(probe));
  });

  return { dateStyles, timeStyles };
}

function parseSheetList(wbXml, relsXml, zip) {
  const out = [];
  const relMap = new Map();
  if (relsXml) {
    const re = /<Relationship\b([^>]*?)\/?>/g;
    let m;
    while ((m = re.exec(relsXml))) {
      const id = /Id="([^"]+)"/.exec(m[1]);
      const tg = /Target="([^"]+)"/.exec(m[1]);
      if (id && tg) relMap.set(id[1], tg[1]);
    }
  }

  const sre = /<sheet\b([^>]*?)\/?>/g;
  let m;
  while ((m = sre.exec(wbXml))) {
    const nm = /name="([^"]*)"/.exec(m[1]);
    const rid = /r:id="([^"]*)"/.exec(m[1]) || /\bid="([^"]*)"/.exec(m[1]);
    if (!rid) continue;
    const target = relMap.get(rid[1]);
    if (!target) continue;
    const part = target.startsWith('/')
      ? target.slice(1)
      : 'xl/' + target.replace(/^\.\//, '');
    if (!zip.has(part)) continue;
    out.push({ name: nm ? unescapeXml(nm[1]) : part, path: part });
  }

  if (!out.length) {
    const parts = zip.order
      .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    parts.forEach((p, i) => out.push({ name: 'Sheet' + (i + 1), path: p }));
  }
  return out;
}

export class XlsxBook {
  constructor(zip, sheets, styles, sst) {
    this.zip = zip;
    this.sheets = sheets;
    this.dateStyles = styles.dateStyles;
    this.timeStyles = styles.timeStyles;
    this.sst = sst;
  }

  /** 某张表声明了多少行（用于进度预估，猜不到返回 0） */
  async declaredRows(part) {
    try {
      const it = this.zip.stream(part);
      const first = await it.next();
      if (first.done) return 0;
      const head = new TextDecoder('utf-8').decode(first.value);
      const m = /<dimension\b[^>]*ref="[A-Z]+\d+:[A-Z]+(\d+)"/.exec(head);
      if (it.return) await it.return();
      return m ? Number(m[1]) : 0;
    } catch (_) {
      return 0;
    }
  }

  /** 流式逐行产出 list[str]，空单元格补空串保证列对齐 */
  async *sheetRows(part, dateMode = 'smart') {
    const dec = new TextDecoder('utf-8');
    const re = /<row\b[^>]*\/>|<row\b[^>]*>[\s\S]*?<\/row>/g;
    let buf = '';

    const drain = (text) => {
      const rows = [];
      re.lastIndex = 0;
      let last = 0;
      let m;
      while ((m = re.exec(text))) {
        rows.push(this._parseRow(m[0], dateMode));
        last = re.lastIndex;
      }
      return { rows, rest: last ? text.slice(last) : text };
    };

    for await (const chunk of this.zip.stream(part)) {
      buf += dec.decode(chunk, { stream: true });
      const { rows, rest } = drain(buf);
      buf = rest;
      for (const r of rows) yield r;
    }
    buf += dec.decode();
    const { rows } = drain(buf);
    for (const r of rows) yield r;
  }

  _parseRow(seg, dateMode) {
    const out = [];
    const re = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let m;
    let next = 0;
    while ((m = re.exec(seg))) {
      const attrs = m[1] || '';
      const inner = m[2] || '';
      let idx = next;
      const rm = /\br="([A-Za-z]+)\d+"/.exec(attrs);
      if (rm) idx = colIndex(rm[1]);
      if (idx < 0) idx = next;
      if (idx >= MAX_COLS) idx = MAX_COLS - 1;
      next = idx + 1;

      const tm = /\bt="([^"]*)"/.exec(attrs);
      const t = tm ? tm[1] : 'n';
      const sm = /\bs="(\d+)"/.exec(attrs);
      const sidx = sm ? Number(sm[1]) : -1;

      let val = '';
      if (t === 's') {
        const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
        if (vm) {
          const i = Number(vm[1]);
          val = (i >= 0 && i < this.sst.length) ? this.sst[i] : '';
        }
      } else if (t === 'inlineStr') {
        const im = /<is>([\s\S]*?)<\/is>/.exec(inner);
        val = im ? parseTextRuns(im[1]) : '';
      } else if (t === 'str' || t === 'e') {
        const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
        val = vm ? unescapeXml(vm[1]) : '';
      } else if (t === 'b') {
        const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
        val = (vm && vm[1].trim() === '1') ? '1' : '0';
      } else {
        const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
        if (!vm) {
          val = '';
        } else {
          const raw = unescapeXml(vm[1]);
          if (sidx >= 0 && this.dateStyles.has(sidx) && dateMode !== 'raw') {
            val = serialToText(raw, this.timeStyles.get(sidx) || false, dateMode);
          } else {
            val = raw;      // 长数字原样保留，绝不转 float
          }
        }
      }

      while (out.length < idx) out.push('');
      out[idx] = val;
    }
    return out;
  }
}

/** 打开一个 xlsx 文件（File / Blob） */
export async function openXlsx(file) {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (head.length >= 2 && head[0] === 0xD0 && head[1] === 0xCF) {
    throw new Error('这是老的 .xls 格式（不是 xlsx），请先用 Excel 另存为 .xlsx');
  }
  if (head.length >= 2 && head[0] === 0x50 && head[1] === 0x4B && head[2] !== 0x03 && head[2] !== 0x05 && head[2] !== 0x07) {
    throw new Error('文件头异常，可能还在导出 / 同步中');
  }

  const zip = new ZipReader(file);
  await zip.init();
  if (!zip.has('xl/workbook.xml')) {
    throw new Error('不是有效的 xlsx（缺少 xl/workbook.xml），可能扩展名被改过');
  }

  const wbXml = await zip.text('xl/workbook.xml');
  const relsXml = zip.has('xl/_rels/workbook.xml.rels')
    ? await zip.text('xl/_rels/workbook.xml.rels') : '';
  const sheets = parseSheetList(wbXml, relsXml, zip);
  const styles = parseStyles(zip.has('xl/styles.xml') ? await zip.text('xl/styles.xml') : '');
  const sst = zip.has('xl/sharedStrings.xml') ? await loadSharedStrings(zip) : [];

  return new XlsxBook(zip, sheets, styles, sst);
}

/* ============================================================
   写出：行数据 -> xlsx
   ============================================================ */
const INT_RE = /^-?\d+$/;
const FLOAT_RE = /^-?\d+\.\d+$/;
const DT_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const D_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

const STYLE_DATE = 1;
const STYLE_DATETIME = 2;

function dateSerial(y, mo, d, h = 0, mi = 0, s = 0) {
  const days = (Date.UTC(y, mo - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  return days + (h * 3600 + mi * 60 + s) / 86400;
}

/** 把一个文本单元格还原成合适的 Excel 单元格 XML */
function cellXml(ref, value) {
  if (value === '' || value == null) return '';
  const s = String(value);

  if (INT_RE.test(s)) {
    if (s.replace('-', '').length >= 15) return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(s)}</t></is></c>`;
    return `<c r="${ref}"><v>${s}</v></c>`;
  }
  if (FLOAT_RE.test(s)) {
    if (s.replace('-', '').replace('.', '').length >= 15) return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(s)}</t></is></c>`;
    const n = Number(s);
    if (!isFinite(n)) return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(s)}</t></is></c>`;
    return `<c r="${ref}"><v>${s}</v></c>`;
  }

  let m = DT_RE.exec(s);
  if (m) {
    const v = dateSerial(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0));
    if (isFinite(v)) return `<c r="${ref}" s="${STYLE_DATETIME}"><v>${v}</v></c>`;
  }
  m = D_RE.exec(s);
  if (m) {
    const v = dateSerial(+m[1], +m[2], +m[3]);
    if (isFinite(v)) return `<c r="${ref}" s="${STYLE_DATE}"><v>${v}</v></c>`;
  }

  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(s)}</t></is></c>`;
}

const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<numFmts count="2">'
  + '<numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/>'
  + '<numFmt numFmtId="165" formatCode="yyyy\\-mm\\-dd\\ hh:mm:ss"/>'
  + '</numFmts>'
  + '<fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill>'
  + '<fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="3">'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '</cellXfs>'
  + '<cellStyles count="1"><cellStyle name="常规" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>';

const SHEET_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
  + '<sheetData>';
const SHEET_FOOT = '</sheetData></worksheet>';

/**
 * 把「行的可迭代对象」写成 xlsx。
 * @param {{write:(u8:Uint8Array)=>Promise<void>}} sink
 * @param {AsyncIterable<string[]>} rows 第一行作为表头，会重复写进每张分表
 * @param {{onProgress?: (rows:number)=>void, shouldCancel?: ()=>boolean}} opts
 */
export async function writeXlsx(sink, rows, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const shouldCancel = opts.shouldCancel || (() => false);
  const zip = new ZipWriter(sink);

  const sheetNames = [];
  let sheetNo = 0;
  let header = null;
  let rowsInSheet = 0;
  let total = 0;
  let pending = '';

  const flush = async (force = false) => {
    if (pending.length < (1 << 18) && !force) return;
    if (!pending) return;
    const s = pending;
    pending = '';
    await zip.write(s);
  };

  const openSheet = async () => {
    sheetNo++;
    sheetNames.push('数据' + sheetNo);
    await zip.begin(`xl/worksheets/sheet${sheetNo}.xml`);
    await zip.write(SHEET_HEAD);
    rowsInSheet = 0;
  };

  const closeSheet = async () => {
    await flush(true);
    await zip.write(SHEET_FOOT);
    await zip.end();
  };

  const writeRow = (cells, rowNum) => {
    const n = Math.min(cells.length, MAX_COLS);
    let s = `<row r="${rowNum}">`;
    for (let i = 0; i < n; i++) {
      const v = cells[i];
      if (v === '' || v == null) continue;
      s += cellXml(colName(i) + rowNum, v);
    }
    s += '</row>';
    pending += s;
  };

  for await (const row of rows) {
    if (shouldCancel()) throw new Error('已取消');
    if (header === null) {
      header = Array.isArray(row) ? row.slice() : [];
      await openSheet();
      writeRow(header, 1);
      await flush();
      continue;
    }
    if (rowsInSheet >= XLSX_MAX_DATA_ROWS) {
      await closeSheet();
      await openSheet();
      writeRow(header, 1);
    }
    writeRow(row, rowsInSheet + 2);
    rowsInSheet++;
    total++;
    if (total % 20000 === 0) {
      onProgress(total);
      await flush();
    } else {
      await flush();
    }
  }

  if (sheetNo === 0) {          // 空数据
    header = [];
    await openSheet();
    writeRow(header, 1);
  }
  await closeSheet();

  /* ---- 补上 xlsx 的骨架文件（ZIP 顺序无关，放最后也合法） ---- */
  const sheetEntries = sheetNames
    .map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  await zip.addText('xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<sheets>${sheetEntries}</sheets></workbook>`);

  const relItems = sheetNames
    .map((_, i) => `<Relationship Id="rId${i + 1}" `
      + 'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
      + `Target="worksheets/sheet${i + 1}.xml"/>`)
    .join('');
  await zip.addText('xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + relItems
    + `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + '</Relationships>');

  await zip.addText('xl/styles.xml', STYLES_XML);

  const overrides = sheetNames
    .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" `
      + 'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')
    .join('');
  await zip.addText('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + overrides
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '</Types>');

  await zip.addText('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>');

  await zip.finish();
  return { rows: total, sheets: sheetNo, names: sheetNames };
}

/* ---------------- 表头判断（与桌面版同一套启发式） ---------------- */
export function looksLikeHeader(row) {
  if (!row || !row.length) return false;
  const texts = row.map((v) => (v == null ? '' : String(v).trim())).filter((v) => v !== '');
  if (!texts.length) return false;

  let dataLike = 0;
  for (const t of texts) {
    if (DIGITS_RE.test(t)) { dataLike++; continue; }        // 流水号 / 编码 / ID
    if (DATE_LIKE_RE.test(t)) { dataLike++; continue; }     // 日期
    if (t.length > 30) { dataLike++; continue; }            // 长文本、备注
  }
  return dataLike === 0;
}

/** 把一行的列按表头名重排到 baseHeader 顺序；名字对不上就留空 */
export function alignRow(row, srcHeader, baseHeader) {
  if (!srcHeader || srcHeader === baseHeader) return row.slice();
  const pos = new Map();
  srcHeader.forEach((h, i) => { if (!pos.has(h)) pos.set(h, i); });
  return baseHeader.map((h) => {
    const i = pos.get(h);
    return (i !== undefined && i < row.length) ? row[i] : '';
  });
}
