'use strict';

// Deterministic seeded PRNG (mulberry32) with a Gaussian transform (Box-Muller).
// Every stochastic part of the simulator draws from one Rng instance so a fixed
// seed reproduces a run exactly.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  constructor(seed = 1) {
    if (!Number.isInteger(seed)) {
      throw new TypeError(`seed must be an integer, got ${seed}`);
    }
    this._next = mulberry32(seed);
    this._spare = null;
  }

  // Uniform in [0, 1).
  uniform() {
    return this._next();
  }

  // Standard normal sample (mean 0, variance 1), Box-Muller with a cached spare.
  gaussian() {
    if (this._spare !== null) {
      const v = this._spare;
      this._spare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = this._next() * 2 - 1;
      v = this._next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    this._spare = v * m;
    return u * m;
  }
}

module.exports = { Rng, mulberry32 };
