'use strict';

// Sparse statevector engine. Amplitudes live in two Float64Arrays (re/im).
// Qubit q corresponds to bit q of the basis-state index (q[0] is the LSB).

class StateVector {
  constructor(numQubits) {
    if (!Number.isInteger(numQubits) || numQubits < 1) {
      throw new RangeError(`numQubits must be a positive integer, got ${numQubits}`);
    }
    this.numQubits = numQubits;
    this.size = 2 ** numQubits;
    this.re = new Float64Array(this.size);
    this.im = new Float64Array(this.size);
    this.re[0] = 1;
  }

  clone() {
    const sv = new StateVector(this.numQubits);
    sv.re.set(this.re);
    sv.im.set(this.im);
    return sv;
  }

  // Apply a 2x2 matrix [[a,b],[c,d]] to qubit q.
  applySingle(q, m) {
    const mask = 1 << q;
    const { re, im } = this;
    const [r0, r1] = m;
    for (let i = 0; i < this.size; i++) {
      if (i & mask) continue;
      const j = i | mask;
      const aRe = re[i];
      const aIm = im[i];
      const bRe = re[j];
      const bIm = im[j];
      re[i] = r0[0].re * aRe - r0[0].im * aIm + r0[1].re * bRe - r0[1].im * bIm;
      im[i] = r0[0].re * aIm + r0[0].im * aRe + r0[1].re * bIm + r0[1].im * bRe;
      re[j] = r1[0].re * aRe - r1[0].im * aIm + r1[1].re * bRe - r1[1].im * bIm;
      im[j] = r1[0].re * aIm + r1[0].im * aRe + r1[1].re * bIm + r1[1].im * bRe;
    }
  }

  // Apply a 2x2 matrix to qubit q, only on basis states where every bit in
  // controlMask is 1.
  applyControlledSingle(controlMask, q, m) {
    const mask = 1 << q;
    if (controlMask & mask) {
      throw new Error('control and target qubits must be distinct');
    }
    const { re, im } = this;
    const [r0, r1] = m;
    for (let i = 0; i < this.size; i++) {
      if (i & mask) continue;
      if ((i & controlMask) !== controlMask) continue;
      const j = i | mask;
      const aRe = re[i];
      const aIm = im[i];
      const bRe = re[j];
      const bIm = im[j];
      re[i] = r0[0].re * aRe - r0[0].im * aIm + r0[1].re * bRe - r0[1].im * bIm;
      im[i] = r0[0].re * aIm + r0[0].im * aRe + r0[1].re * bIm + r0[1].im * bRe;
      re[j] = r1[0].re * aRe - r1[0].im * aIm + r1[1].re * bRe - r1[1].im * bIm;
      im[j] = r1[0].re * aIm + r1[0].im * aRe + r1[1].re * bIm + r1[1].im * bRe;
    }
  }

  // Swap qubits a and b (optionally controlled).
  applySwap(a, b, controlMask = 0) {
    if (a === b) return;
    const ma = 1 << a;
    const mb = 1 << b;
    if (controlMask & (ma | mb)) {
      throw new Error('control and swap qubits must be distinct');
    }
    const { re, im } = this;
    for (let i = 0; i < this.size; i++) {
      if (i & ma) continue; // handle each pair once, from the (0,1) side
      if (!(i & mb)) continue;
      if ((i & controlMask) !== controlMask) continue;
      const j = (i | ma) ^ mb;
      const tRe = re[i];
      const tIm = im[i];
      re[i] = re[j];
      im[i] = im[j];
      re[j] = tRe;
      im[j] = tIm;
    }
  }

  // Stochastic amplitude-damping step on qubit q with decay probability p
  // (Kraus K0 = diag(1, sqrt(1-p)), K1 = [[0, sqrt(p)], [0, 0]]), implemented as
  // a quantum trajectory: with probability p * P(qubit = 1) a jump happens and
  // the state is renormalized; otherwise the no-jump branch is renormalized.
  amplitudeDamp(q, p, rng) {
    if (p <= 0) return;
    const mask = 1 << q;
    const { re, im } = this;
    let pExcited = 0;
    for (let i = 0; i < this.size; i++) {
      if (i & mask) pExcited += re[i] * re[i] + im[i] * im[i];
    }
    const pJump = p * pExcited;
    if (rng.uniform() < pJump) {
      const s = Math.sqrt(p);
      let norm = 0;
      for (let i = 0; i < this.size; i++) {
        if (i & mask) continue;
        const j = i | mask;
        re[i] = s * re[j];
        im[i] = s * im[j];
        re[j] = 0;
        im[j] = 0;
        norm += re[i] * re[i] + im[i] * im[i];
      }
      this._scale(1 / Math.sqrt(norm));
    } else {
      const s = Math.sqrt(1 - p);
      let norm = 0;
      for (let i = 0; i < this.size; i++) {
        if (i & mask) {
          re[i] *= s;
          im[i] *= s;
        }
        norm += re[i] * re[i] + im[i] * im[i];
      }
      this._scale(1 / Math.sqrt(norm));
    }
  }

  _scale(k) {
    for (let i = 0; i < this.size; i++) {
      this.re[i] *= k;
      this.im[i] *= k;
    }
  }

  norm() {
    let n = 0;
    for (let i = 0; i < this.size; i++) {
      n += this.re[i] * this.re[i] + this.im[i] * this.im[i];
    }
    return Math.sqrt(n);
  }

  normalize() {
    const n = this.norm();
    if (n === 0) throw new Error('cannot normalize a zero state');
    this._scale(1 / n);
  }

  // Marginal probability that qubit q is 1.
  probOne(q) {
    const mask = 1 << q;
    let p1 = 0;
    for (let i = 0; i < this.size; i++) {
      if (i & mask) p1 += this.re[i] * this.re[i] + this.im[i] * this.im[i];
    }
    return p1;
  }

  // Projectively measure qubit q: sample the bit, collapse and renormalize.
  measureQubit(q, rng) {
    const mask = 1 << q;
    const bit = rng.uniform() < this.probOne(q) ? 1 : 0;
    let norm = 0;
    for (let i = 0; i < this.size; i++) {
      if (((i & mask) !== 0) !== (bit === 1)) {
        this.re[i] = 0;
        this.im[i] = 0;
      } else {
        norm += this.re[i] * this.re[i] + this.im[i] * this.im[i];
      }
    }
    this._scale(1 / Math.sqrt(norm));
    return bit;
  }

  // Full probability array over all basis states.
  probabilitiesArray() {
    const out = new Float64Array(this.size);
    for (let i = 0; i < this.size; i++) {
      out[i] = this.re[i] * this.re[i] + this.im[i] * this.im[i];
    }
    return out;
  }

  // Draw one basis-state index from the current distribution.
  sample(rng) {
    const r = rng.uniform();
    let acc = 0;
    for (let i = 0; i < this.size; i++) {
      acc += this.re[i] * this.re[i] + this.im[i] * this.im[i];
      if (r < acc) return i;
    }
    return this.size - 1; // guard against floating-point drift at the tail
  }

  toArray() {
    const out = new Array(this.size);
    for (let i = 0; i < this.size; i++) out[i] = { re: this.re[i], im: this.im[i] };
    return out;
  }
}

module.exports = { StateVector };
