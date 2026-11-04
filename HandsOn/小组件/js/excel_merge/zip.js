/* ============================================================
   zip.js — 流式 ZIP 读写（xlsx 的底层容器）
   ------------------------------------------------------------
   读：解析中央目录 → 按需解压单个条目（DecompressionStream）
   写：流式 deflate（CompressionStream）→ 本地头 + 中央目录
   全部使用浏览器原生 API，不依赖任何第三方库，可离线运行。
   ============================================================ */

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_EOCD64_LOC = 0x07064b50;

/* ---------- CRC32（ZIP 头必须带，支持分段累加） ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(u8, crc = 0) {
  let c = (crc ^ 0xFFFFFFFF) >>> 0;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export function hasCompressionStream() {
  return typeof DecompressionStream === 'function' && typeof CompressionStream === 'function';
}

/* ---------- 读取字节流的小工具 ---------- */
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

/* ============================================================
   ZipReader
   ============================================================ */
export class ZipReader {
  /** @param {Blob|File} blob */
  constructor(blob) {
    this.blob = blob;
    this.entries = new Map();   // name -> {method, compSize, size, localOffset, crc}
    this.order = [];
  }

  async init() {
    if (!hasCompressionStream()) {
      throw new Error('当前浏览器不支持 DecompressionStream，请使用 Chrome / Edge 103+ 或新版 Safari / Firefox');
    }
    const size = this.blob.size;
    if (!size) throw new Error('文件大小为 0（可能拷贝中断或导出失败）');

    /* ---- 1. 在文件尾部找 EOCD ---- */
    const tailLen = Math.min(size, 66 * 1024);
    const tailStart = size - tailLen;
    const tail = new Uint8Array(await this.blob.slice(tailStart, size).arrayBuffer());
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) {
      if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('不是有效的 ZIP / XLSX 文件（找不到中央目录）');

    const tdv = new DataView(tail.buffer, tail.byteOffset, tail.length);
    let count = tdv.getUint16(eocd + 10, true);
    let cdSize = tdv.getUint32(eocd + 12, true);
    let cdOffset = tdv.getUint32(eocd + 16, true);

    /* ---- 2. Zip64 兼容（大文件 / 超过 4GB 的条目） ---- */
    const zip64Loc = eocd - 20;
    if (zip64Loc >= 0 && tdv.getUint32(zip64Loc, true) === SIG_EOCD64_LOC) {
      const z64Off = Number(tdv.getBigUint64(zip64Loc + 8, true));
      const hdr = new Uint8Array(await this.blob.slice(z64Off, z64Off + 56).arrayBuffer());
      const hdv = new DataView(hdr.buffer);
      if (hdv.getUint32(0, true) === SIG_EOCD64) {
        count = Number(hdv.getBigUint64(32, true));
        cdSize = Number(hdv.getBigUint64(40, true));
        cdOffset = Number(hdv.getBigUint64(48, true));
      }
    }

    /* ---- 3. 解析中央目录 ---- */
    const cd = new Uint8Array(await this.blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
    const dv = new DataView(cd.buffer);
    const dec = new TextDecoder('utf-8');
    let p = 0;
    for (let n = 0; n < count && p + 46 <= cd.length; n++) {
      if (dv.getUint32(p, true) !== SIG_CENTRAL) break;
      const method = dv.getUint16(p + 10, true);
      const crc = dv.getUint32(p + 16, true);
      let compSize = dv.getUint32(p + 20, true);
      let sizeU = dv.getUint32(p + 24, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      let localOffset = dv.getUint32(p + 42, true);
      const name = dec.decode(cd.subarray(p + 46, p + 46 + nameLen));

      // Zip64 扩展字段：值按「原始大小 → 压缩大小 → 本地头偏移」顺序补齐
      let e = p + 46 + nameLen;
      const eEnd = e + extraLen;
      while (e + 4 <= eEnd) {
        const id = dv.getUint16(e, true);
        const len = dv.getUint16(e + 2, true);
        if (id === 0x0001) {
          let q = e + 4;
          if (sizeU === 0xFFFFFFFF && q + 8 <= e + 4 + len) { sizeU = Number(dv.getBigUint64(q, true)); q += 8; }
          if (compSize === 0xFFFFFFFF && q + 8 <= e + 4 + len) { compSize = Number(dv.getBigUint64(q, true)); q += 8; }
          if (localOffset === 0xFFFFFFFF && q + 8 <= e + 4 + len) { localOffset = Number(dv.getBigUint64(q, true)); }
        }
        e += 4 + len;
      }

      this.entries.set(name, { name, method, compSize, size: sizeU, localOffset, crc });
      this.order.push(name);
      p = e + commentLen;
    }
    if (!this.entries.size) throw new Error('压缩包是空的，或者格式无法识别');
    return this;
  }

  has(name) {
    return this.entries.has(name);
  }

  /** 找到第一个匹配正则的条目名 */
  find(re) {
    for (const name of this.order) if (re.test(name)) return name;
    return null;
  }

  async _dataOffset(ent) {
    const buf = new Uint8Array(await this.blob.slice(ent.localOffset, ent.localOffset + 30).arrayBuffer());
    const dv = new DataView(buf.buffer);
    if (dv.getUint32(0, true) !== SIG_LOCAL) throw new Error('ZIP 本地文件头损坏：' + ent.name);
    return ent.localOffset + 30 + dv.getUint16(26, true) + dv.getUint16(28, true);
  }

  /** 流式解压某个条目，产出 Uint8Array 分片 */
  async *stream(name) {
    const ent = this.entries.get(name);
    if (!ent) throw new Error('压缩包里缺少条目：' + name);
    const start = await this._dataOffset(ent);
    const raw = this.blob.slice(start, start + ent.compSize);

    if (ent.method === 0) {          // 未压缩
      yield* readBlobChunks(raw);
      return;
    }
    if (ent.method !== 8) {
      throw new Error('不支持的压缩方式（method=' + ent.method + '）：' + name);
    }
    const reader = raw.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
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

  async text(name) {
    const dec = new TextDecoder('utf-8');
    let s = '';
    for await (const c of this.stream(name)) s += dec.decode(c, { stream: true });
    return s + dec.decode();
  }
}

/* ============================================================
   ZipWriter —— 边压缩边落盘，内存只保留「当前条目」的压缩结果
   ============================================================ */
function dosDateTime(d = new Date()) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

export class ZipWriter {
  /**
   * @param {{write: (u8: Uint8Array) => Promise<void>}} sink 落盘目标
   */
  constructor(sink) {
    this.sink = sink;
    this.offset = 0;
    this.central = [];
    this.active = null;
    this.enc = new TextEncoder();
  }

  async _write(u8) {
    if (!u8 || !u8.length) return;
    await this.sink.write(u8);
    this.offset += u8.length;
  }

  async begin(name) {
    if (this.active) throw new Error('上一个条目还没结束：' + this.active.name);
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    const chunks = [];
    const pump = (async () => {
      const reader = cs.readable.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    })();
    this.active = { name, writer, chunks, pump, crc: 0, size: 0 };
  }

  async write(chunk) {
    const a = this.active;
    if (!a) throw new Error('没有正在写入的条目');
    const u8 = typeof chunk === 'string' ? this.enc.encode(chunk) : chunk;
    if (!u8.length) return;
    a.crc = crc32(u8, a.crc);
    a.size += u8.length;
    await a.writer.write(u8);
  }

  async end() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    await a.writer.close();
    await a.pump;

    let compSize = 0;
    for (const c of a.chunks) compSize += c.length;

    const nameBytes = this.enc.encode(a.name);
    const { time, date } = dosDateTime();
    const head = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(head.buffer);
    dv.setUint32(0, SIG_LOCAL, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true);        // bit11：文件名 UTF-8
    dv.setUint16(8, 8, true);             // deflate
    dv.setUint16(10, time, true);
    dv.setUint16(12, date, true);
    dv.setUint32(14, a.crc, true);
    dv.setUint32(18, compSize, true);
    dv.setUint32(22, a.size, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    head.set(nameBytes, 30);

    const localOffset = this.offset;
    await this._write(head);
    for (const c of a.chunks) await this._write(c);

    this.central.push({ nameBytes, crc: a.crc, compSize, size: a.size, localOffset, time, date });
    a.chunks.length = 0;
  }

  async addText(name, text) {
    await this.begin(name);
    await this.write(text);
    await this.end();
  }

  /** 写完所有条目：输出中央目录 + EOCD */
  async finish() {
    const cdStart = this.offset;
    for (const e of this.central) {
      const rec = new Uint8Array(46 + e.nameBytes.length);
      const dv = new DataView(rec.buffer);
      dv.setUint32(0, SIG_CENTRAL, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 20, true);
      dv.setUint16(8, 0x0800, true);
      dv.setUint16(10, 8, true);
      dv.setUint16(12, e.time, true);
      dv.setUint16(14, e.date, true);
      dv.setUint32(16, e.crc, true);
      dv.setUint32(20, e.compSize, true);
      dv.setUint32(24, e.size, true);
      dv.setUint16(28, e.nameBytes.length, true);
      dv.setUint16(30, 0, true);
      dv.setUint16(32, 0, true);
      dv.setUint16(34, 0, true);
      dv.setUint16(36, 0, true);
      dv.setUint32(38, 0, true);
      dv.setUint32(42, e.localOffset, true);
      rec.set(e.nameBytes, 46);
      await this._write(rec);
    }
    const cdSize = this.offset - cdStart;

    const end = new Uint8Array(22);
    const dv = new DataView(end.buffer);
    dv.setUint32(0, SIG_EOCD, true);
    dv.setUint16(4, 0, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, this.central.length, true);
    dv.setUint16(10, this.central.length, true);
    dv.setUint32(12, cdSize, true);
    dv.setUint32(16, cdStart, true);
    dv.setUint16(20, 0, true);
    await this._write(end);
  }
}
