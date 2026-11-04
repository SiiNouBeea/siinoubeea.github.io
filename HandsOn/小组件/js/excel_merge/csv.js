/* ============================================================
   csv.js — CSV 读写 / 编码处理
   ------------------------------------------------------------
   * 流式解析（引号、字段内换行、CRLF 全部支持，可跨分片）
   * 输出编码：UTF-8 / UTF-8+BOM / GBK（GBK 用 TextDecoder 反查表构建）
   * 编码嗅探：BOM → UTF-16 / UTF-8；无 BOM 则试 UTF-8，失败回落 GBK
   ============================================================ */

/* ---------------- 基础工具 ---------------- */
export function formatBytes(n) {
  n = Number(n) || 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n.toFixed(0) : n.toFixed(1)) + ' ' + units[i];
}

export function formatDuration(sec) {
  sec = Math.max(0, Math.floor(sec));
  if (sec < 60) return sec + ' 秒';
  if (sec < 3600) return Math.floor(sec / 60) + ' 分 ' + (sec % 60) + ' 秒';
  return Math.floor(sec / 3600) + ' 小时 ' + Math.floor((sec % 3600) / 60) + ' 分';
}

async function* readBlobChunks(blob) {
  const reader = blob.stream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length) yield value;
    }
  } finally {
    try { reader.releaseLock(); } catch (_) { /* 忽略 */ }
  }
}

/* ---------------- 编码 ---------------- */
let gbkMap = null;

/** 用 TextDecoder('gbk') 反向建表：Unicode 字符 -> GBK 双字节 */
function buildGbkMap() {
  const dec = new TextDecoder('gbk');
  const map = new Map();
  const buf = new Uint8Array(2);
  for (let lead = 0x81; lead <= 0xfe; lead++) {
    for (let trail = 0x40; trail <= 0xfe; trail++) {
      if (trail === 0x7f) continue;
      buf[0] = lead;
      buf[1] = trail;
      const ch = dec.decode(buf);
      if (ch.length === 1 && ch !== '\uFFFD' && !map.has(ch)) map.set(ch, (lead << 8) | trail);
    }
  }
  return map;
}

export function encodingSupport(enc) {
  if (enc !== 'gbk') return true;
  try { new TextDecoder('gbk'); return true; } catch (_) { return false; }
}

/** 把字符串编码成 GBK 字节；无法映射的字符用 '?' 代替 */
export function encodeGbk(str) {
  if (!gbkMap) gbkMap = buildGbkMap();
  const out = new Uint8Array(str.length * 2);
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) { out[n++] = code; continue; }
    const g = gbkMap.get(str[i]);
    if (g === undefined) { out[n++] = 0x3f; continue; }
    out[n++] = g >> 8;
    out[n++] = g & 0xff;
  }
  return out.subarray(0, n);
}

const utf8Encoder = new TextEncoder();

/** 嗅探文本编码（只看头部足够判断） */
export async function detectEncoding(blob) {
  const headLen = Math.min(blob.size, 64 * 1024);
  const head = new Uint8Array(await blob.slice(0, headLen).arrayBuffer());
  if (head.length >= 3 && head[0] === 0xEF && head[1] === 0xBB && head[2] === 0xBF) return 'utf-8-sig';
  if (head.length >= 2 && head[0] === 0xFF && head[1] === 0xFE) return 'utf-16le';
  if (head.length >= 2 && head[0] === 0xFE && head[1] === 0xFF) return 'utf-16be';
  // 去掉末尾可能被截断的多字节序列，避免误判
  const probe = head.subarray(0, Math.max(0, head.length - 4));
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(probe);
    return 'utf-8';
  } catch (_) {
    try { new TextDecoder('gbk'); return 'gbk'; } catch (__) { return 'utf-8'; }
  }
}

/** 按编码流式解码成字符串分片 */
export async function* decodedChunks(blob, encoding) {
  let dec;
  const label = encoding === 'utf-8-sig' ? 'utf-8' : encoding;
  try {
    dec = new TextDecoder(label);
  } catch (_) {
    dec = new TextDecoder('utf-8');
  }
  for await (const c of readBlobChunks(blob)) {
    const s = dec.decode(c, { stream: true });
    if (s) yield s;
  }
  const rest = dec.decode();
  if (rest) yield rest;
}

/* ---------------- CSV 解析（流式状态机） ---------------- */
const SPECIAL_RE = /[\r\n,"]/g;

/**
 * @param {AsyncIterable<string>} chunks
 * @returns {AsyncGenerator<string[]>} 每次产出一行（数组）
 */
export async function* parseCsvStream(chunks) {
  let field = '';
  let row = [];
  let inQuotes = false;

  for await (const s of chunks) {
    const n = s.length;
    let i = 0;
    while (i < n) {
      if (inQuotes) {
        const q = s.indexOf('"', i);
        if (q < 0) { field += s.slice(i); i = n; break; }
        field += s.slice(i, q);
        if (s[q + 1] === '"') { field += '"'; i = q + 2; }
        else { inQuotes = false; i = q + 1; }
        continue;
      }
      SPECIAL_RE.lastIndex = i;
      const m = SPECIAL_RE.exec(s);
      if (!m) { field += s.slice(i); i = n; break; }
      const p = m.index;
      if (p > i) field += s.slice(i, p);
      const ch = s[p];
      if (ch === '"') { inQuotes = true; i = p + 1; }
      else if (ch === ',') { row.push(field); field = ''; i = p + 1; }
      else if (ch === '\r') { i = p + 1; }
      else { row.push(field); field = ''; yield row; row = []; i = p + 1; }
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    yield row;
  }
}

/** 只读表头（第一行） */
export async function readCsvHeader(blob) {
  const enc = await detectEncoding(blob);
  const it = parseCsvStream(decodedChunks(blob, enc));
  try {
    const first = await it.next();
    return first.done ? null : first.value;
  } finally {
    try { await it.return(); } catch (_) { /* 忽略 */ }
  }
}

export function csvStream(blob) {
  return (async function* () {
    const enc = await detectEncoding(blob);
    yield* parseCsvStream(decodedChunks(blob, enc));
  })();
}

/* ---------------- CSV 写出 ---------------- */
function escapeField(v) {
  const s = v == null ? '' : String(v);
  if (s.indexOf('"') >= 0 || s.indexOf(',') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export const CSV_ENCODINGS = {
  'utf-8': 'UTF-8（无 BOM，推荐用于系统导入）',
  'utf-8-sig': 'UTF-8 带 BOM（Excel 双击不乱码）',
  'gbk': 'GBK（老系统 / Excel 另存习惯）',
};

export class CsvWriter {
  /**
   * @param {{write:(u8:Uint8Array)=>Promise<void>}} sink
   * @param {string} encoding 'utf-8' | 'utf-8-sig' | 'gbk'
   */
  constructor(sink, encoding = 'utf-8') {
    this.sink = sink;
    this.encoding = encoding;
    this.buf = '';
    this.started = false;
    this.rows = 0;
    this.bytes = 0;
  }

  async writeRow(cells) {
    let line = '';
    for (let i = 0; i < cells.length; i++) {
      if (i) line += ',';
      line += escapeField(cells[i]);
    }
    this.buf += line + '\n';
    this.rows++;
    if (this.buf.length >= (1 << 19)) await this.flush();
  }

  async flush() {
    if (!this.buf) return;
    const pending = this.buf;
    this.buf = '';
    let out;
    if (this.encoding === 'gbk') {
      out = encodeGbk(pending);
    } else {
      const s = (!this.started && this.encoding === 'utf-8-sig') ? '\uFEFF' + pending : pending;
      out = utf8Encoder.encode(s);
    }
    this.started = true;
    this.bytes += out.length;
    await this.sink.write(out);
  }

  async close() {
    await this.flush();
  }
}
