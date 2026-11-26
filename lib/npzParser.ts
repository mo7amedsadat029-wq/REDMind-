import { unzipSync } from 'fflate';
import fs from 'fs';

export interface ParsedNpyArray {
  dtype: string;
  fortranOrder: boolean;
  shape: number[];
  flat: number[];
  data: number[] | number[][];
}

function parseNpy(buf: Uint8Array): ParsedNpyArray {
  // Check magic: \x93NUMPY
  if (
    buf[0] !== 0x93 ||
    buf[1] !== 0x4e ||
    buf[2] !== 0x55 ||
    buf[3] !== 0x4d ||
    buf[4] !== 0x50 ||
    buf[5] !== 0x59
  ) {
    throw new Error('Invalid NPY magic header');
  }

  const major = buf[6];
  let headerLen = 0;
  let offset = 0;
  if (major === 1) {
    headerLen = buf[8] | (buf[9] << 8);
    offset = 10;
  } else {
    headerLen =
      buf[8] | (buf[9] << 8) | (buf[10] << 16) | (buf[11] << 24);
    offset = 12;
  }

  const headerStr = new TextDecoder('utf-8').decode(
    buf.subarray(offset, offset + headerLen)
  );
  const dataOffset = offset + headerLen;

  const descrMatch = headerStr.match(/'descr':\s*'([^']+)'/);
  const fortranMatch = headerStr.match(/'fortran_order':\s*(True|False)/);
  const shapeMatch = headerStr.match(/'shape':\s*\(([^)]*)\)/);

  const dtype = descrMatch ? descrMatch[1] : '<f8';
  const fortranOrder = fortranMatch ? fortranMatch[1] === 'True' : false;
  const shape = shapeMatch
    ? shapeMatch[1]
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => parseInt(s, 10))
    : [];

  const totalElements =
    shape.length === 0 ? 1 : shape.reduce((acc, v) => acc * v, 1);

  const rawBytes = buf.subarray(dataOffset);
  const view = new DataView(
    rawBytes.buffer,
    rawBytes.byteOffset,
    rawBytes.byteLength
  );
  const littleEndian = !dtype.startsWith('>');
  const typeCode = dtype.replace(/^[<>|=]/, '');

  const flat: number[] = new Array(totalElements);
  if (typeCode === 'f8') {
    for (let i = 0; i < totalElements; i++) {
      flat[i] = view.getFloat64(i * 8, littleEndian);
    }
  } else if (typeCode === 'f4') {
    for (let i = 0; i < totalElements; i++) {
      flat[i] = view.getFloat32(i * 4, littleEndian);
    }
  } else if (typeCode === 'i8') {
    for (let i = 0; i < totalElements; i++) {
      flat[i] = Number(view.getBigInt64(i * 8, littleEndian));
    }
  } else if (typeCode === 'u8') {
    for (let i = 0; i < totalElements; i++) {
      flat[i] = Number(view.getBigUint64(i * 8, littleEndian));
    }
  } else if (typeCode === 'i4') {
    for (let i = 0; i < totalElements; i++) {
      flat[i] = view.getInt32(i * 4, littleEndian);
    }
  } else if (typeCode === 'u4') {
    for (let i = 0; i < totalElements; i++) {
      flat[i] = view.getUint32(i * 4, littleEndian);
    }
  } else if (typeCode === 'b1' || typeCode === 'u1') {
    for (let i = 0; i < totalElements; i++) {
      flat[i] = rawBytes[i];
    }
  } else {
    // Fallback zero array for unsupported string/object dtypes
    for (let i = 0; i < totalElements; i++) {
      flat[i] = 0;
    }
  }

  let data: number[] | number[][];
  if (shape.length === 2) {
    const [nx, ny] = shape;
    const grid: number[][] = new Array(nx);
    if (!fortranOrder) {
      for (let i = 0; i < nx; i++) {
        grid[i] = flat.slice(i * ny, (i + 1) * ny);
      }
    } else {
      for (let i = 0; i < nx; i++) {
        const row = new Array(ny);
        for (let j = 0; j < ny; j++) {
          row[j] = flat[j * nx + i];
        }
        grid[i] = row;
      }
    }
    data = grid;
  } else {
    data = flat;
  }

  return { dtype, fortranOrder, shape, flat, data };
}

export function loadNpzFile(filePath: string): Record<string, ParsedNpyArray> {
  const bytes = fs.readFileSync(filePath);
  const unzipped = unzipSync(new Uint8Array(bytes));
  const out: Record<string, ParsedNpyArray> = {};
  for (const [filename, content] of Object.entries(unzipped)) {
    if (filename.endsWith('.npy')) {
      const key = filename.slice(0, -4);
      out[key] = parseNpy(content);
    }
  }
  return out;
}

export function parseCsvRecords(csvText: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    if (ch === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && csvText[i + 1] === '\n') {
        i++;
      }
      if (current.length > 0) {
        lines.push(current);
      }
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const splitRow = (line: string): string[] => {
    const cols: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (ch === ',' && !quoted) {
        cols.push(cell);
        cell = '';
      } else {
        cell += ch;
      }
    }
    cols.push(cell);
    return cols;
  };

  const headers = splitRow(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitRow(lines[i]);
    const rec: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      rec[headers[j]] = vals[j] ?? '';
    }
    rows.push(rec);
  }
  return { headers, rows };
}
