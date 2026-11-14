'use strict';

// Noise-model tests: statistical checks with fixed seeds (documented
// tolerances), channel isolation, and deterministic checks of the resolved
// parameters and formulas.

const test = require('node:test');
const assert = require('node:assert/strict');
const { simulate } = require('../src');
const { resolveQubit } = require('../src/noise');

const SHOTS = 4000;
// 5-sigma-style tolerance for p=0.5 binomial sampling at 4000 shots is ~0.04;
// the tests use 0.05 everywhere to stay robust while still catching real bugs.
const TOL = 0.05;

test('readout error: X with P(report 0 | actual 1) = 0.2 reads "1" about 80% of the time', () => {
  const r = simulate('OPENQASM 2.0;\nqreg q[1];\ncreg c[1];\nx q[0];\nmeasure q[0] -> c[0];', {
    noise: { qubits: { 0: { readoutError: { p1given0: 0.05, p0given1: 0.2 } } } },
    shots: SHOTS,
    seed: 11,
  });
  assert.equal(r.metadata.mode, 'sampled');
  assert.equal(r.metadata.probabilityKind, 'empirical-shot-frequencies');
  assert.equal(r.metadata.shots, SHOTS);
  assert.equal(r.metadata.seed, 11);
  assert.ok(Math.abs(r.probabilities['1'] - 0.8) < TOL, `P(1) = ${r.probabilities['1']}`);
  assert.equal(r.statevector, null, 'noisy runs do not return a statevector');
});

test('symmetric readout shorthand sets both confusion probabilities', () => {
  const cfg = resolveQubit({ readoutError: 0.1 }, 0);
  assert.deepEqual(cfg.readout, { p1given0: 0.1, p0given1: 0.1 });
});

test('initialization error: idle qubit starts in |1> at the configured rate', () => {
  const r = simulate('OPENQASM 2.0;\nqreg q[1];\ncreg c[1];\nmeasure q[0] -> c[0];', {
    noise: { qubits: { 0: { initializationError: 0.3 } } },
    shots: SHOTS,
    seed: 12,
  });
  assert.ok(Math.abs(r.probabilities['1'] - 0.3) < TOL, `P(1) = ${r.probabilities['1']}`);
});

test('full depolarizing error (p = 1) after H randomizes the outcome', () => {
  const r = simulate('OPENQASM 2.0;\nqreg q[1];\nh q[0];', {
    noise: { qubits: { 0: { gateError: 1 } } },
    shots: SHOTS,
    seed: 13,
  });
  assert.ok(Math.abs(r.probabilities['0'] - 0.5) < TOL, `P(0) = ${r.probabilities['0']}`);
});

test('gate fidelity is converted with p = 2 * (1 - F) and reported', () => {
  const cfg = resolveQubit({ gateFidelity: 0.995 }, 0);
  assert.ok(Math.abs(cfg.gateError - 0.01) < 1e-15, `converted p = ${cfg.gateError}`);
  assert.match(cfg.fidelityConversion, /p = 2 \* \(1 - F\)/);
  const r = simulate('OPENQASM 2.0;\nqreg q[1];\nx q[0];', {
    noise: { qubits: { 0: { gateFidelity: 0.995 } } },
    shots: 10,
    seed: 1,
  });
  assert.equal(r.noiseReport.qubitsConfigured[0].gateFidelity, 0.995);
  assert.ok(Math.abs(r.noiseReport.qubitsConfigured[0].gateError - 0.01) < 1e-15);
});

test('rotation error broadens rx(pi): P(1) moves from 1 toward 0.5', () => {
  const ideal = simulate('OPENQASM 2.0;\nqreg q[1];\nrx(pi) q[0];');
  assert.equal(ideal.probabilities['1'], 1);
  const noisy = simulate('OPENQASM 2.0;\nqreg q[1];\nrx(pi) q[0];', {
    noise: { qubits: { 0: { rotationError: 0.5 } } },
    shots: SHOTS,
    seed: 14,
  });
  assert.ok(noisy.probabilities['1'] > 0.3 && noisy.probabilities['1'] < 0.7,
    `P(1) = ${noisy.probabilities['1']}`);
});

test('thermal relaxation: short T1 decays |1> back to |0>', () => {
  const relaxed = simulate('OPENQASM 2.0;\nqreg q[1];\nx q[0];', {
    noise: { qubits: { 0: { t1: 1e-9, gateTime: 1e-3 } } }, // pRelax ~ 1
    shots: SHOTS,
    seed: 15,
  });
  assert.ok(relaxed.probabilities['0'] > 0.95, `P(0) = ${relaxed.probabilities['0']}`);
  const intact = simulate('OPENQASM 2.0;\nqreg q[1];\nx q[0];', {
    noise: { qubits: { 0: { t1: 1e9, gateTime: 1e-3 } } }, // pRelax ~ 0
    shots: SHOTS,
    seed: 15,
  });
  assert.ok(intact.probabilities['1'] > 0.95, `P(1) = ${intact.probabilities['1']}`);
});

test('pure dephasing: H, dephase, H scrambles the interference', () => {
  // Ideal: H H = I -> |0>. Full dephasing between the H gates kills coherence -> 50/50.
  const r = simulate('OPENQASM 2.0;\nqreg q[1];\nh q[0];\nh q[0];', {
    noise: { qubits: { 0: { t2: 1e-12, gateTime: 1e-3 } } }, // T1 defaults to Infinity
    shots: SHOTS,
    seed: 16,
  });
  assert.ok(Math.abs(r.probabilities['0'] - 0.5) < TOL, `P(0) = ${r.probabilities['0']}`);
});

test('t2 = 2*t1 gives zero pure dephasing (all T2 decay comes from T1)', () => {
  const cfg = resolveQubit({ t1: 50e-6, t2: 100e-6, gateTime: 1e-6 }, 0);
  assert.equal(cfg.pDephase, 0);
  assert.ok(cfg.pRelax > 0);
});

test('resolved relaxation/dephasing probabilities match the documented formulas', () => {
  const t1 = 50e-6;
  const t2 = 40e-6;
  const t = 35e-9;
  const cfg = resolveQubit({ t1, t2, gateTime: t }, 0);
  assert.ok(Math.abs(cfg.pRelax - (1 - Math.exp(-t / t1))) < 1e-15);
  const invTphi = 1 / t2 - 1 / (2 * t1);
  const expectedPhi = (1 - Math.exp(-t * invTphi)) / 2;
  assert.ok(Math.abs(cfg.pDephase - expectedPhi) < 1e-15);
});

test('per-qubit isolation: noise on q[1] does not disturb q[0]', () => {
  // Bell pair; heavy readout error on q[1] only. q[0] marginal must stay 50/50,
  // and perfect correlation must be broken by the q[1] readout flips.
  const src = 'OPENQASM 2.0;\nqreg q[2];\ncreg c[2];\nh q[0];\ncx q[0],q[1];\nmeasure q -> c;';
  const r = simulate(src, {
    noise: { qubits: { 1: { readoutError: 0.4 } } },
    shots: SHOTS,
    seed: 17,
  });
  const pQ0one = r.probabilities['01'] + r.probabilities['11'];
  assert.ok(Math.abs(pQ0one - 0.5) < TOL, `q[0] marginal P(1) = ${pQ0one}`);
  // With 40% readout error on q[1], P(equal outcomes) ~ 0.6
  const pEqual = r.probabilities['00'] + r.probabilities['11'];
  assert.ok(Math.abs(pEqual - 0.6) < TOL, `P(equal) = ${pEqual}`);
});

test('multi-qubit gate applies each participating qubit error model independently', () => {
  // Only q[1] (the cx target) has a full depolarizing error. q[0] stays |0>.
  const src = 'OPENQASM 2.0;\nqreg q[2];\nh q[0];\ncx q[0],q[1];';
  const r = simulate(src, {
    noise: { qubits: { 1: { gateError: 1 } } },
    shots: SHOTS,
    seed: 18,
  });
  const pQ0one = r.probabilities['01'] + r.probabilities['11'];
  assert.ok(Math.abs(pQ0one - 0.5) < TOL, `q[0] marginal P(1) = ${pQ0one}`);
});

test('combined channels all contribute: init + gate + readout on one qubit', () => {
  const r = simulate('OPENQASM 2.0;\nqreg q[1];\nx q[0];', {
    noise: {
      qubits: { 0: { initializationError: 0.1, gateError: 0.1, readoutError: 0.1 } },
    },
    shots: SHOTS,
    seed: 19,
  });
  // Sanity band: every channel pushes P(1) off 1.0 but the circuit is X, so P(1)
  // should remain the majority outcome.
  assert.ok(r.probabilities['1'] > 0.5 && r.probabilities['1'] < 0.95, `P(1) = ${r.probabilities['1']}`);
  assert.deepEqual(
    [...r.noiseReport.qubitsConfigured[0].channels].sort(),
    ['depolarizing', 'initialization', 'readout'],
  );
});

test('probabilities normalize in sampled mode and cover all 2^n keys', () => {
  const r = simulate('OPENQASM 2.0;\nqreg q[2];\nh q[0];\ncx q[0],q[1];', {
    noise: { qubits: { 0: { gateError: 0.05 }, 1: { readoutError: 0.05 } } },
    shots: SHOTS,
    seed: 20,
  });
  assert.equal(Object.keys(r.probabilities).length, 4);
  const sum = Object.values(r.probabilities).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-12, `sum = ${sum}`);
});

test('noise report lists resolved parameters, channel formulas and ideal qubits', () => {
  const r = simulate('OPENQASM 2.0;\nqreg q[2];\ncx q[0],q[1];', {
    noise: { qubits: { 0: { t1: 50e-6, t2: 70e-6, gateTime: 35e-9 } } },
    shots: 10,
    seed: 3,
  });
  const report = r.noiseReport;
  assert.deepEqual(report.qubitsIdeal, [1]);
  assert.ok(report.qubitsConfigured[0].channels.includes('thermal-relaxation'));
  assert.ok(report.qubitsConfigured[0].channels.includes('dephasing'));
  assert.match(report.channelModels['thermal-relaxation'], /1 - exp\(-gateTime \/ T1\)/);
});

test('sampled mode with an ideal circuit still returns the statevector', () => {
  const r = simulate('OPENQASM 2.0;\nqreg q[1];\nh q[0];', { mode: 'sampled', shots: 100, seed: 5 });
  assert.ok(r.statevector !== null);
  assert.equal(r.metadata.probabilityKind, 'empirical-shot-frequencies');
});

test('mid-circuit measurement collapses the trajectory', () => {
  // Without collapse, H then H again would return the qubit to |0> and the
  // final read would be deterministic '0'. With collapse at the mid-circuit
  // measure, the second H acts on a |0> or |1> branch, giving 50/50.
  const src = [
    'OPENQASM 2.0;',
    'qreg q[1];',
    'creg c[2];',
    'h q[0];',
    'measure q[0] -> c[0];',
    'h q[0];',
    'measure q[0] -> c[1];',
  ].join('\n');
  const r = simulate(src, { mode: 'sampled', shots: 200, seed: 21 });
  assert.ok(
    r.probabilities['0'] > 0.35 && r.probabilities['0'] < 0.65,
    `P(0) = ${r.probabilities['0']} (collapse expected to give ~0.5; no collapse would give 1)`,
  );
});
