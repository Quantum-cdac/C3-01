'use strict';

// Reproducibility and result-shape tests.

const test = require('node:test');
const assert = require('node:assert/strict');
const { simulate } = require('../src');

const NOISY = {
  noise: {
    qubits: {
      0: { gateError: 0.05, readoutError: 0.1 },
      1: { t1: 50e-6, t2: 70e-6, gateTime: 35e-9, initializationError: 0.02 },
    },
  },
  shots: 500,
};
const SRC = 'OPENQASM 2.0;\nqreg q[2];\nh q[0];\ncx q[0],q[1];\nrx(pi/3) q[1];';

test('same seed reproduces identical sampled frequencies', () => {
  const a = simulate(SRC, { ...NOISY, seed: 99 });
  const b = simulate(SRC, { ...NOISY, seed: 99 });
  assert.deepEqual(a.probabilities, b.probabilities);
});

test('different seeds give different sampled tallies', () => {
  const a = simulate(SRC, { ...NOISY, seed: 1 });
  const b = simulate(SRC, { ...NOISY, seed: 2 });
  assert.notDeepEqual(a.probabilities, b.probabilities);
});

test('exact mode is deterministic regardless of seed', () => {
  const src = 'OPENQASM 2.0;\nqreg q[2];\nh q[0];\ncx q[0],q[1];';
  const a = simulate(src, { seed: 1 });
  const b = simulate(src, { seed: 999 });
  assert.deepEqual(a.probabilities, b.probabilities);
  assert.deepEqual(a.statevector, b.statevector);
});

test('metadata carries version, bit order, mode, shots and seed', () => {
  const r = simulate(SRC, { ...NOISY, seed: 42 });
  const m = r.metadata;
  assert.equal(m.qubitCount, 2);
  assert.equal(m.qasmVersion, '2.0');
  assert.match(m.bitOrder, /q\[0\] is the rightmost character/);
  assert.equal(m.mode, 'sampled');
  assert.equal(m.shots, 500);
  assert.equal(m.seed, 42);
  assert.equal(typeof m.wallTimeMs, 'number');
});

test('bit-order convention: key index equals the basis-state index', () => {
  // q[1]=1, q[0]=0 -> index 2 -> key "10"
  const r = simulate('OPENQASM 2.0;\nqreg q[2];\nx q[1];');
  assert.equal(r.probabilities['10'], 1);
  // statevector index 2 carries the amplitude
  assert.ok(Math.abs(r.statevector[2].re - 1) < 1e-12);
});

test('exact and empirical kinds are distinguished in the output', () => {
  const exact = simulate('OPENQASM 2.0;\nqreg q[1];\nh q[0];');
  assert.equal(exact.metadata.probabilityKind, 'exact');
  const sampled = simulate('OPENQASM 2.0;\nqreg q[1];\nh q[0];', {
    noise: { qubits: { 0: { readoutError: 0.01 } } },
    shots: 100,
    seed: 4,
  });
  assert.equal(sampled.metadata.probabilityKind, 'empirical-shot-frequencies');
});

test('noiseReport is null when no noise configuration is supplied', () => {
  const r = simulate('OPENQASM 2.0;\nqreg q[1];\nh q[0];');
  assert.equal(r.noiseReport, null);
});
