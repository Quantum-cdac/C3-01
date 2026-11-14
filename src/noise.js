'use strict';

// Noise configuration validation and resolution.
//
// Schema (all fields optional, per qubit):
//   {
//     qubits: {
//       0: {
//         readoutError: 0.02 | { p1given0: 0.01, p0given1: 0.03 },
//         initializationError: 0.01,      // P(qubit starts in |1> instead of |0>)
//         gateError: 0.001,               // explicit depolarizing probability per gate
//         gateFidelity: 0.999,            // OR average gate fidelity (converted, see below)
//         rotationError: 0.01,            // relative stddev of rotation-gate angles
//         depolarizingError: 0.0005,      // extra depolarizing probability per gate
//         t1: 50e-6,                      // thermal relaxation time (seconds)
//         t2: 70e-6,                      // dephasing time (seconds), must satisfy t2 <= 2*t1
//         gateTime: 35e-9,                // average gate-application duration (seconds)
//       },
//     },
//   }
//
// Channel models (documented in docs/03 and docs/07):
//   - Readout: classical assignment/confusion matrix applied to each reported bit.
//   - Initialization: with probability p the qubit starts in |1>.
//   - Gate error: depolarizing channel E(rho) = (1-p) rho + p * I/2 per gate,
//     sampled as a trajectory (no error with prob 1-p, else X/Y/Z with prob p/3
//     each). gateFidelity F is converted with p = 2 * (1 - F), the exact relation
//     F_avg = 1 - p(d-1)/d for d = 2. gateError and gateFidelity are mutually
//     exclusive; depolarizingError adds to the result.
//   - Rotation error: each rotation angle theta is multiplied by
//     (1 + rotationError * g) with g a standard normal sample, per application.
//   - Thermal relaxation: amplitude damping with p1 = 1 - exp(-t / T1) per gate,
//     t = gateTime, applied as a quantum trajectory (jump / no-jump branch).
//   - Dephasing: phase-flip (Pauli-Z) channel with p_phi = (1 - exp(-t / T_phi)) / 2
//     where 1/T_phi = 1/T2 - 1/(2*T1). Together with amplitude damping this
//     reproduces the total coherence decay rate 1/T2. T2 <= 2*T1 is required
//     (physical consistency). T1 defaults to infinity when only T2 is given.
//   - Multi-qubit gates: after the ideal unitary, every participating qubit
//     gets its own configured channels independently (documented approximation).

class NoiseConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NoiseConfigError';
  }
}

const KNOWN_KEYS = new Set([
  'readoutError',
  'initializationError',
  'gateError',
  'gateFidelity',
  'rotationError',
  'depolarizingError',
  't1',
  't2',
  'gateTime',
]);

function checkProbability(value, label) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
    throw new NoiseConfigError(`${label} must be a probability in [0, 1], got ${value}`);
  }
}

function checkPositive(value, label) {
  if (typeof value !== 'number' || Number.isNaN(value) || !(value > 0)) {
    throw new NoiseConfigError(`${label} must be a positive number, got ${value}`);
  }
}

function resolveQubit(raw, qubitIndex) {
  const label = `noise.qubits[${qubitIndex}]`;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new NoiseConfigError(`${label} must be an object`);
  }
  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(key)) throw new NoiseConfigError(`${label}: unknown parameter "${key}"`);
  }

  const out = {
    initializationError: 0,
    readout: { p1given0: 0, p0given1: 0 },
    gateError: 0,
    rotationError: 0,
    t1: Infinity,
    t2: Infinity,
    gateTime: null,
    pRelax: 0,
    pDephase: 0,
    channels: [],
  };

  if (raw.initializationError !== undefined) {
    checkProbability(raw.initializationError, `${label}.initializationError`);
    out.initializationError = raw.initializationError;
    if (out.initializationError > 0) out.channels.push('initialization');
  }

  if (raw.readoutError !== undefined) {
    if (typeof raw.readoutError === 'number') {
      checkProbability(raw.readoutError, `${label}.readoutError`);
      out.readout = { p1given0: raw.readoutError, p0given1: raw.readoutError };
    } else if (raw.readoutError && typeof raw.readoutError === 'object') {
      const r = raw.readoutError;
      const p1given0 = r.p1given0 === undefined ? 0 : r.p1given0;
      const p0given1 = r.p0given1 === undefined ? 0 : r.p0given1;
      checkProbability(p1given0, `${label}.readoutError.p1given0`);
      checkProbability(p0given1, `${label}.readoutError.p0given1`);
      out.readout = { p1given0, p0given1 };
    } else {
      throw new NoiseConfigError(`${label}.readoutError must be a number or {p1given0, p0given1}`);
    }
    if (out.readout.p1given0 > 0 || out.readout.p0given1 > 0) out.channels.push('readout');
  }

  if (raw.gateError !== undefined && raw.gateFidelity !== undefined) {
    throw new NoiseConfigError(
      `${label}: gateError and gateFidelity are mutually exclusive; give an explicit error probability or a fidelity to convert, not both`,
    );
  }
  let gateError = 0;
  if (raw.gateError !== undefined) {
    checkProbability(raw.gateError, `${label}.gateError`);
    gateError = raw.gateError;
  } else if (raw.gateFidelity !== undefined) {
    checkProbability(raw.gateFidelity, `${label}.gateFidelity`);
    // F_avg = 1 - p(d-1)/d for the depolarizing channel, d = 2 for one qubit.
    gateError = 2 * (1 - raw.gateFidelity);
    out.gateFidelity = raw.gateFidelity;
    out.fidelityConversion = 'p = 2 * (1 - F)  [from F_avg = 1 - p(d-1)/d, d = 2]';
  }
  if (raw.depolarizingError !== undefined) {
    checkProbability(raw.depolarizingError, `${label}.depolarizingError`);
    gateError += raw.depolarizingError;
  }
  if (gateError > 1) {
    throw new NoiseConfigError(`${label}: combined gate/depolarizing error probability ${gateError} exceeds 1`);
  }
  out.gateError = gateError;
  if (gateError > 0) out.channels.push('depolarizing');

  if (raw.rotationError !== undefined) {
    if (typeof raw.rotationError !== 'number' || Number.isNaN(raw.rotationError) || raw.rotationError < 0) {
      throw new NoiseConfigError(`${label}.rotationError must be a non-negative number, got ${raw.rotationError}`);
    }
    out.rotationError = raw.rotationError;
    if (out.rotationError > 0) out.channels.push('rotation');
  }

  if (raw.t1 !== undefined) {
    checkPositive(raw.t1, `${label}.t1`);
    out.t1 = raw.t1;
  }
  if (raw.t2 !== undefined) {
    checkPositive(raw.t2, `${label}.t2`);
    out.t2 = raw.t2;
  }
  if (raw.gateTime !== undefined) {
    checkPositive(raw.gateTime, `${label}.gateTime`);
    out.gateTime = raw.gateTime;
  }
  if ((raw.t1 !== undefined || raw.t2 !== undefined) && raw.gateTime === undefined) {
    throw new NoiseConfigError(`${label}: gateTime is required when t1 or t2 is configured`);
  }
  if (raw.t2 !== undefined && out.t2 > 2 * out.t1) {
    throw new NoiseConfigError(
      `${label}: physically inconsistent times t2 (${out.t2}) > 2 * t1 (${out.t1}); the T2 <= 2*T1 bound must hold`,
    );
  }
  if (raw.t1 !== undefined) {
    out.pRelax = 1 - Math.exp(-out.gateTime / out.t1);
    if (out.pRelax > 0) out.channels.push('thermal-relaxation');
  }
  if (raw.t2 !== undefined) {
    // 1/T2 = 1/(2*T1) + 1/T_phi; T1 = Infinity contributes 0.
    const invTphi = 1 / out.t2 - (out.t1 === Infinity ? 0 : 1 / (2 * out.t1));
    out.tPhi = invTphi > 0 ? 1 / invTphi : Infinity;
    out.pDephase = out.tPhi === Infinity ? 0 : (1 - Math.exp(-out.gateTime / out.tPhi)) / 2;
    if (out.pDephase > 0) out.channels.push('dephasing');
  }

  return out;
}

function isIdealQubit(resolved) {
  return (
    resolved.initializationError === 0 &&
    resolved.readout.p1given0 === 0 &&
    resolved.readout.p0given1 === 0 &&
    resolved.gateError === 0 &&
    resolved.rotationError === 0 &&
    resolved.pRelax === 0 &&
    resolved.pDephase === 0
  );
}

// Validates the whole noise object against a circuit of numQubits qubits and
// returns { perQubit: Map<number, resolved>, ideal: boolean }.
function resolveNoise(noise, numQubits) {
  const perQubit = new Map();
  if (noise === undefined || noise === null) {
    return { perQubit, ideal: true };
  }
  if (typeof noise !== 'object' || Array.isArray(noise)) {
    throw new NoiseConfigError('noise configuration must be an object with a "qubits" map');
  }
  const extraKeys = Object.keys(noise).filter((k) => k !== 'qubits');
  if (extraKeys.length > 0) {
    throw new NoiseConfigError(`noise configuration: unknown top-level key(s): ${extraKeys.join(', ')}`);
  }
  const qubits = noise.qubits || {};
  if (typeof qubits !== 'object' || Array.isArray(qubits)) {
    throw new NoiseConfigError('noise.qubits must be an object keyed by qubit index');
  }
  let ideal = true;
  for (const [key, raw] of Object.entries(qubits)) {
    if (!/^\d+$/.test(key)) {
      throw new NoiseConfigError(`noise.qubits key "${key}" is not a non-negative integer qubit index`);
    }
    const idx = parseInt(key, 10);
    if (idx >= numQubits) {
      throw new NoiseConfigError(
        `noise configured for qubit ${idx}, but the circuit only has ${numQubits} qubit(s) (indices 0..${numQubits - 1})`,
      );
    }
    const resolved = resolveQubit(raw, idx);
    perQubit.set(idx, resolved);
    if (!isIdealQubit(resolved)) ideal = false;
  }
  return { perQubit, ideal };
}

module.exports = { resolveNoise, resolveQubit, isIdealQubit, NoiseConfigError };
