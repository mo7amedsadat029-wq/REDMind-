import fs from 'fs';
import { zipSync } from 'fflate';

/**
 * Encodes a 1D or 2D numeric array into a standard NumPy .npy (v1.0, <f8, C-order) buffer.
 */
export function encodeNpyFloat64(arr: number[] | number[][]): Uint8Array {
  const is2D = Array.isArray(arr[0]);
  const shape = is2D
    ? [arr.length, (arr as number[][])[0]?.length ?? 0]
    : [arr.length];

  const total = shape.length === 2 ? shape[0] * shape[1] : shape[0];
  const shapeStr =
    shape.length === 1 ? `(${shape[0]},)` : `(${shape[0]}, ${shape[1]})`;

  const dictCore = `{'descr': '<f8', 'fortran_order': False, 'shape': ${shapeStr}, }`;
  const preambleLen = 10; // 6 magic + 2 version + 2 headerLen
  const unpaddedLen = preambleLen + dictCore.length + 1; // +1 for trailing \n
  const padLen = (64 - (unpaddedLen % 64)) % 64;
  const headerStr = dictCore + ' '.repeat(padLen) + '\n';
  const headerBytes = new TextEncoder().encode(headerStr);
  const headerLen = headerBytes.length;

  const out = new Uint8Array(preambleLen + headerLen + total * 8);
  // Magic: \x93NUMPY
  out[0] = 0x93;
  out[1] = 0x4e;
  out[2] = 0x55;
  out[3] = 0x4d;
  out[4] = 0x50;
  out[5] = 0x59;
  out[6] = 1; // major version 1
  out[7] = 0; // minor version 0
  out[8] = headerLen & 0xff;
  out[9] = (headerLen >> 8) & 0xff;
  out.set(headerBytes, preambleLen);

  const view = new DataView(out.buffer, out.byteOffset + preambleLen + headerLen);
  if (is2D) {
    const grid = arr as number[][];
    const ny = shape[1];
    let idx = 0;
    for (let i = 0; i < shape[0]; i++) {
      const row = grid[i];
      for (let j = 0; j < ny; j++) {
        view.setFloat64(idx * 8, row[j], true);
        idx++;
      }
    }
  } else {
    const vec = arr as number[];
    for (let i = 0; i < total; i++) {
      view.setFloat64(i * 8, vec[i], true);
    }
  }

  return out;
}

/**
 * Writes a dictionary of 1D/2D arrays to a standard compressed .npz ZIP archive
 * compatible with both numpy.load() and lib/npzParser.ts.
 */
export function writeNpzFile(
  filePath: string,
  arrays: Record<string, number[] | number[][]>
): void {
  const entries: Record<string, Uint8Array> = {};
  for (const [key, data] of Object.entries(arrays)) {
    entries[`${key}.npy`] = encodeNpyFloat64(data);
  }
  const zipped = zipSync(entries, { level: 6 });
  fs.writeFileSync(filePath, zipped);
}
