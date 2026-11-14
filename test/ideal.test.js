'use strict';

// Ideal-simulation correctness tests: analytic expectations plus a
// cross-check against an independent dense-matrix reference implementation.

const test = require('node:test');
const assert = require('node:assert/strict');
const { simulate, parseQasm } = require('../src');
const { runReference } = require('./helpers/reference');

const TOL = 1e-9;

function expectProbs(result, expected) {
  for (const [key, p] of Object.entries(expected)) {
    assert.ok(
      Math.abs(result.probabilities[key] - p) < TOL,
      `P(${key}) = ${result.probabilities[key]}, expected ${p}`,
    );
  }
  const sum = Object.values(result.probabilities).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < TOL, `probabilities not normalized: sum = ${sum}`);
}

test('ideal |0...0> stays put for 1..4 qubits', () => {
  for (const n of [1, 2, 3, 4]) {
    const src = `OPENQASM 2.0;\nqreg q[${n}];`;
    const r = simulate(src);
    expectProbs(r, { ['0'.repeat(n)]: 1 });
    assert.equal(r.metadata.qubitCount, n);
    assert.equal(r.metadata.mode, 'exact');
    assert.equal(r.metadata.probabilityKind, 'exact');
  }
});

test('X flips q[0]; bit order puts q[0] in the rightmost character', () => {
  const r = simulate('OPENQASM 2.0;\nqreg q[3];\nx q[0];');
  expectProbs(r, { '001': 1 });
});

test('X on q[2] of 3 qubits produces key "100"', () => {
  const r = simulate('OPENQASM 2.0;\nqreg q[3];\nx q[2];');
  expectProbs(r, { '100': 1 });
});

test('H gives 50/50 and the expected statevector', () => {
  const r = simulate('OPENQASM 2.0;\nqreg q[1];\nh q[0];');
  expectProbs(r, { '0': 0.5, '1': 0.5 });
  assert.equal(r.statevector.length, 2);
  const s = Math.SQRT1_2;
  assert.ok(Math.abs(r.statevector[0].re - s) < 1e-12);
  assert.ok(Math.abs(r.statevector[1].re - s) < 1e-12);
  assert.ok(Math.abs(r.statevector[0].im) < 1e-12);
});

test('Bell state: {00: 0.5, 11: 0.5}', () => {
  const r = simulate('OPENQASM 2.0;\nqreg q[2];\nh q[0];\ncx q[0],q[1];');
  expectProbs(r, { '00': 0.5, '11': 0.5 });
});

test('GHZ state on 3 qubits: {000: 0.5, 111: 0.5}', () => {
  const r = simulate('OPENQASM 2.0;\nqreg q[3];\nh q[0];\ncx q[0],q[1];\ncx q[1],q[2];');
  expectProbs(r, { '000': 0.5, '111': 0.5 });
});

test('cnot alias for cx is accepted', () => {
  const r = simulate('OPENQASM 2.0;\nqreg q[2];\nx q[0];\ncnot q[0],q[1];');
  expectProbs(r, { '11': 1 });
});

test('ccx (Toffoli) flips the target only when both controls are 1', () => {
  const off = simulate('OPENQASM 2.0;\nqreg q[3];\nx q[0];\nccx q[0],q[1],q[2];');
  expectProbs(off, { '001': 1 });
  const on = simulate('OPENQASM 2.0;\nqreg q[3];\nx q[0];\nx q[1];\nccx q[0],q[1],q[2];');
  expectProbs(on, { '111': 1 });
});

test('swap exchanges qubit states', () => {
  const r = simulate('OPENQASM 2.0;\nqreg q[2];\nx q[0];\nswap q[0],q[1];');
  expectProbs(r, { '10': 1 });
});

test('rotation gates: rx(pi) = X up to phase; rz leaves |0> invariant', () => {
  const r1 = simulate('OPENQASM 2.0;\nqreg q[1];\nrx(pi) q[0];');
  expectProbs(r1, { '1': 1 });
  const r2 = simulate('OPENQASM 2.0;\nqreg q[1];\nrz(pi/3) q[0];');
  expectProbs(r2, { '0': 1 });
  const r3 = simulate('OPENQASM 2.0;\nqreg q[1];\nx q[0];\nry(pi) q[0];');
  expectProbs(r3, { '0': 1 });
});

test('u1/u2/u3 and phase gates match known identities', () => {
  // u1(pi) = Z up to global phase; h z h = x
  const r = simulate('OPENQASM 2.0;\nqreg q[1];\nh q[0];\nu1(pi) q[0];\nh q[0];');
  expectProbs(r, { '1': 1 });
  // u3(pi,0,pi) = X up to global phase
  const r2 = simulate('OPENQASM 2.0;\nqreg q[1];\nu3(pi,0,pi) q[0];');
  expectProbs(r2, { '1': 1 });
  // s followed by sdg cancels
  const r3 = simulate('OPENQASM 2.0;\nqreg q[1];\nh q[0];\ns q[0];\nsdg q[0];\nh q[0];');
  expectProbs(r3, { '0': 1 });
});

test('OpenQASM 3.0 syntax: qubit/bit declarations and c = measure q', () => {
  const src = [
    'OPENQASM 3;',
    'include "stdgates.inc";',
    'qubit[2] q;',
    'bit[2] c;',
    'h q[0];',
    'cx q[0], q[1];',
    'c[0] = measure q[0];',
    'c[1] = measure q[1];',
  ].join('\n');
  const r = simulate(src);
  expectProbs(r, { '00': 0.5, '11': 0.5 });
  assert.equal(r.metadata.qasmVersion, '3.0');
});

test('multiple qregs map to consecutive global indices in declaration order', () => {
  const src = 'OPENQASM 2.0;\nqreg a[1];\nqreg b[2];\nx b[1];';
  const r = simulate(src);
  // a[0] -> qubit 0, b[0] -> qubit 1, b[1] -> qubit 2
  expectProbs(r, { '100': 1 });
});

test('whole-register gate application broadcasts elementwise', () => {
  const r = simulate('OPENQASM 2.0;\nqreg q[3];\nx q;');
  expectProbs(r, { '111': 1 });
});

test('cross-check: engine matches the independent dense reference on mixed circuits', () => {
  const circuits = [
    'OPENQASM 2.0;\nqreg q[2];\nh q[0];\ncx q[0],q[1];\nrz(pi/7) q[1];\ncy q[1],q[0];',
    'OPENQASM 2.0;\nqreg q[3];\nx q[2];\nh q[0];\nccx q[0],q[2],q[1];\ncrz(pi/5) q[1],q[2];\nswap q[0],q[2];',
    'OPENQASM 2.0;\nqreg q[4];\nh q[3];\ncx q[3],q[0];\ncp(pi/4) q[0],q[2];\nry(3*pi/8) q[1];\nch q[1],q[3];\nt q[2];\ncrx(-pi/6) q[2],q[1];',
    'OPENQASM 3;\nqubit[3] q;\nh q[0];\ncx q[0],q[2];\nu3(pi/3,pi/7,-pi/5) q[1];\nswap q[1],q[2];',
  ];
  for (const src of circuits) {
    const circuit = parseQasm(src);
    const ref = runReference(circuit);
    const got = simulate(src);
    for (let i = 0; i < ref.length; i++) {
      assert.ok(
        Math.abs(got.statevector[i].re - ref[i][0]) < 1e-12 &&
          Math.abs(got.statevector[i].im - ref[i][1]) < 1e-12,
        `amplitude ${i} mismatch in "${src.slice(0, 50)}...": got (${got.statevector[i].re},${got.statevector[i].im}), ref (${ref[i][0]},${ref[i][1]})`,
      );
    }
  }
});

test('exact mode returns all 2^n outcome keys', () => {
  const r = simulate('OPENQASM 2.0;\nqreg q[3];\nh q[0];');
  assert.equal(Object.keys(r.probabilities).length, 8);
});

test('measure in exact mode does not collapse the state (documented semantics)', () => {
  const r = simulate('OPENQASM 2.0;\nqreg q[1];\ncreg c[1];\nh q[0];\nmeasure q[0] -> c[0];');
  expectProbs(r, { '0': 0.5, '1': 0.5 });
});

test('reset in exact mode is rejected with a clear diagnostic', () => {
  assert.throws(
    () => simulate('OPENQASM 2.0;\nqreg q[1];\nx q[0];\nreset q[0];'),
    /reset is non-unitary and is only supported in sampled mode/,
  );
});

test('reset in sampled mode returns the qubit to |0>', () => {
  const r = simulate('OPENQASM 2.0;\nqreg q[1];\ncreg c[1];\nx q[0];\nreset q[0];\nmeasure q[0] -> c[0];', {
    mode: 'sampled',
    shots: 200,
    seed: 7,
  });
  assert.equal(r.probabilities['0'], 1);
});
