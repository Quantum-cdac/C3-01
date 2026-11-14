'use strict';

// Validation tests: every rejection path required by the problem statement.

const test = require('node:test');
const assert = require('node:assert/strict');
const { simulate, NoiseConfigError, SimulationError } = require('../src');

const BELL = 'OPENQASM 2.0;\nqreg q[2];\nh q[0];\ncx q[0],q[1];';

test('probability parameters outside [0, 1] are rejected', () => {
  assert.throws(
    () => simulate(BELL, { noise: { qubits: { 0: { readoutError: 1.5 } } } }),
    NoiseConfigError,
  );
  assert.throws(
    () => simulate(BELL, { noise: { qubits: { 0: { initializationError: -0.1 } } } }),
    /must be a probability/,
  );
  assert.throws(
    () => simulate(BELL, { noise: { qubits: { 0: { gateError: NaN } } } }),
    NoiseConfigError,
  );
});

test('non-positive T1, T2 or gate duration are rejected', () => {
  assert.throws(
    () => simulate(BELL, { noise: { qubits: { 0: { t1: 0, gateTime: 1e-9 } } } }),
    /t1 must be a positive number/,
  );
  assert.throws(
    () => simulate(BELL, { noise: { qubits: { 0: { t2: -5, gateTime: 1e-9 } } } }),
    /t2 must be a positive number/,
  );
  assert.throws(
    () => simulate(BELL, { noise: { qubits: { 0: { t1: 1, t2: 1, gateTime: 0 } } } }),
    /gateTime must be a positive number/,
  );
});

test('physically inconsistent T2 > 2*T1 is rejected', () => {
  assert.throws(
    () =>
      simulate(BELL, {
        noise: { qubits: { 0: { t1: 50e-6, t2: 120e-6, gateTime: 1e-9 } } },
      }),
    /T2 <= 2\*T1/,
  );
});

test('t1/t2 without gateTime is rejected', () => {
  assert.throws(
    () => simulate(BELL, { noise: { qubits: { 0: { t1: 50e-6 } } } }),
    /gateTime is required/,
  );
});

test('noise on an unknown qubit is rejected', () => {
  assert.throws(
    () => simulate(BELL, { noise: { qubits: { 7: { readoutError: 0.1 } } } }),
    /only has 2 qubit/,
  );
  assert.throws(
    () => simulate(BELL, { noise: { qubits: { x: { readoutError: 0.1 } } } }),
    /not a non-negative integer qubit index/,
  );
});

test('gateError and gateFidelity together are rejected', () => {
  assert.throws(
    () => simulate(BELL, { noise: { qubits: { 0: { gateError: 0.01, gateFidelity: 0.99 } } } }),
    /mutually exclusive/,
  );
});

test('unknown noise parameter names are rejected', () => {
  assert.throws(
    () => simulate(BELL, { noise: { qubits: { 0: { depolarzingError: 0.1 } } } }),
    /unknown parameter "depolarzingError"/,
  );
});

test('combined gate + depolarizing error above 1 is rejected', () => {
  assert.throws(
    () => simulate(BELL, { noise: { qubits: { 0: { gateError: 0.8, depolarizingError: 0.5 } } } }),
    /exceeds 1/,
  );
});

test('exact mode with active noise is rejected with guidance', () => {
  assert.throws(
    () => simulate(BELL, { mode: 'exact', noise: { qubits: { 0: { readoutError: 0.1 } } } }),
    /exact mode requires an ideal circuit/,
  );
});

test('an all-zero noise configuration stays exact', () => {
  const r = simulate(BELL, { noise: { qubits: { 0: { readoutError: 0, gateError: 0 } } } });
  assert.equal(r.metadata.mode, 'exact');
  assert.ok(r.statevector !== null);
});

test('invalid shots and mode values are rejected', () => {
  assert.throws(
    () => simulate(BELL, { mode: 'sampled', shots: 0, noise: { qubits: { 0: { gateError: 0.1 } } } }),
    /shots must be an integer/,
  );
  assert.throws(() => simulate(BELL, { mode: 'turbo' }), /mode must be/);
  assert.throws(
    () => simulate(BELL, { mode: 'sampled', seed: 1.5, noise: { qubits: { 0: { gateError: 0.1 } } } }),
    /seed must be an integer/,
  );
});

test('malformed QASM and unsupported operations raise QasmError, not silent output', () => {
  assert.throws(() => simulate('OPENQASM 2.0;\nqreg q[1];\nopaque g a;'), /not supported/);
  assert.throws(() => simulate('OPENQASM 2.0;\nqreg q[1];\nfoo q[0];'), /unknown or unsupported gate/);
  assert.throws(() => simulate('this is not qasm;'), /version header/);
});

test('error messages carry the source line where available', () => {
  try {
    simulate('OPENQASM 2.0;\nqreg q[2];\nh q[0];\ncx q[0],q[2];');
    assert.fail('should have thrown');
  } catch (err) {
    assert.match(err.message, /^line 4:/);
  }
});

test('non-string source is rejected', () => {
  assert.throws(() => simulate(null), /non-empty string/);
});

test('noise config must be an object with a qubits map', () => {
  assert.throws(() => simulate(BELL, { noise: 42 }), NoiseConfigError);
  assert.throws(() => simulate(BELL, { noise: { qubit: {} } }), /unknown top-level key/);
});

test('readoutError given as a non-object/non-number is rejected', () => {
  assert.throws(
    () => simulate(BELL, { noise: { qubits: { 0: { readoutError: 'high' } } } }),
    /must be a number or \{p1given0, p0given1\}/,
  );
});

test('rotationError must be non-negative', () => {
  assert.throws(
    () => simulate(BELL, { noise: { qubits: { 0: { rotationError: -0.2 } } } }),
    /non-negative/,
  );
});
