/**
 * Implementación síncrona de SHA-1 (suficiente para identificar objetos del
 * simulador). Los blobs se hashean igual que en Git real:
 *   sha1("blob " + longitud + "\0" + contenido)
 */
function utf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function rotl(n: number, s: number): number {
  return (n << s) | (n >>> (32 - s));
}

export function sha1(input: string): string {
  const msg = utf8(input);
  const ml = msg.length;
  const withPadding = ((ml + 9 + 63) >> 6) << 6;
  const bytes = new Uint8Array(withPadding);
  bytes.set(msg);
  bytes[ml] = 0x80;
  const view = new DataView(bytes.buffer);
  const bitLen = ml * 8;
  view.setUint32(withPadding - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(withPadding - 4, bitLen >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let i = 0; i < withPadding; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(i + t * 4);
    for (let t = 16; t < 80; t++) w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let t = 0; t < 80; t++) {
      let f: number, k: number;
      if (t < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (t < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (t < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const temp = (rotl(a, 5) + f + e + k + w[t]) >>> 0;
      e = d; d = c; c = rotl(b, 30) >>> 0; b = a; a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, '0')).join('');
}

/** Hash de un blob con el mismo formato que `git hash-object`. */
export function hashBlob(content: string): string {
  return sha1(`blob ${utf8(content).length}\0${content}`);
}
