'use strict';

// Independent dense-matrix reference simulator used ONLY by the test suite.
// It builds the full 2^n x 2^n unitary of each gate with explicit Kronecker
// products and multiplies it onto the state - a deliberately separate code
// path from the optimized sparse engine in src/statevector.js, so the two can
// be cross-checked against each other. Only practical for small n (tests use
// n <= 4).

function cmul(a, b) {
  return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
}
function cadd(a, b) {
  return [a[0] + b[0], a[1] + b[1]];
}

function toPairs(m) {
  return m.map((row) => row.map((z) => [z.re, z.im]));
}

// Full 2^n x 2^n unitary for a 2x2 gate `m` (entries {re,im}) applied to
// `target` with `controls` (all-on). Entries are [re, im] pairs.
function fullGateUnitary(n, m, target, controls = []) {
  const size = 2 ** n;
  const mp = toPairs(m);
  const U = Array.from({ length: size }, () => Array.from({ length: size }, () => [0, 0]));
  for (let i = 0; i < size; i++) {
    const controlsOk = controls.every((q) => ((i >> q) & 1) === 1);
    if (!controlsOk) {
      U[i][i] = [1, 0];
      continue;
    }
    const it = (i >> target) & 1;
    for (let jt = 0; jt <= 1; jt++) {
      const j = it === jt ? i : i ^ (1 << target);
      U[j][i] = mp[jt][it];
    }
  }
  return U;
}

function fullSwapUnitary(n, a, b) {
  const size = 2 ** n;
  const U = Array.from({ length: size }, () => Array.from({ length: size }, () => [0, 0]));
  for (let i = 0; i < size; i++) {
    const ba = (i >> a) & 1;
    const bb = (i >> b) & 1;
    let j = i;
    if (ba !== bb) j = i ^ (1 << a) ^ (1 << b);
    U[j][i] = [1, 0];
  }
  return U;
}

function applyUnitary(U, state) {
  const size = state.length;
  const out = Array.from({ length: size }, () => [0, 0]);
  for (let j = 0; j < size; j++) {
    let acc = [0, 0];
    for (let i = 0; i < size; i++) {
      if (U[j][i][0] === 0 && U[j][i][1] === 0) continue;
      if (state[i][0] === 0 && state[i][1] === 0) continue;
      acc = cadd(acc, cmul(U[j][i], state[i]));
    }
    out[j] = acc;
  }
  return out;
}

// Runs the parsed IR (gates and swaps only) with dense matrices.
function runReference(circuit) {
  const n = circuit.numQubits;
  const size = 2 ** n;
  let state = Array.from({ length: size }, () => [0, 0]);
  state[0] = [1, 0];
  const { GATES } = require('../../src/gates');
  for (const op of circuit.ops) {
    if (op.kind === 'swap') {
      state = applyUnitary(fullSwapUnitary(n, op.qubits[0], op.qubits[1]), state);
    } else if (op.kind === 'gate') {
      const m = GATES[op.name].matrix(...op.params);
      state = applyUnitary(fullGateUnitary(n, m, op.targets[0], op.controls), state);
    }
    // measure/reset/barrier are not exercised by the cross-check tests
  }
  return state; // array of [re, im]
}

module.exports = { runReference };
