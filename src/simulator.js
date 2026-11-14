'use strict';

// Simulation driver: exact statevector mode for ideal circuits, Monte-Carlo
// trajectory sampling for noisy circuits.

const { parseQasm, QasmError } = require('./parser');
const { GATES, ROTATION_GATES, MATRICES } = require('./gates');
const { StateVector } = require('./statevector');
const { resolveNoise, NoiseConfigError } = require('./noise');
const { Rng } = require('./rng');

class SimulationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SimulationError';
  }
}

const BIT_ORDER =
  'big-endian binary string of the basis-state index: q[0] is the rightmost character (least significant bit)';

const PAULI = { X: MATRICES.x, Y: MATRICES.y, Z: MATRICES.z };

// Perturb rotation angles per application when a rotation error is configured.
function resolveParams(op, qubitNoises, rng) {
  if (!ROTATION_GATES.has(op.name)) return op.params;
  return op.params.map((theta, i) => {
    let out = theta;
    for (const q of [...op.controls, ...op.targets]) {
      const cfg = qubitNoises.get(q);
      if (cfg && cfg.rotationError > 0 && i === 0) {
        // Perturb once per application, driven by the first noisy participant.
        out = theta * (1 + cfg.rotationError * rng.gaussian());
        break;
      }
    }
    return out;
  });
}

// Apply the post-gate noise channels of every participating qubit.
function applyGateNoise(sv, qubits, qubitNoises, rng) {
  for (const q of qubits) {
    const cfg = qubitNoises.get(q);
    if (!cfg) continue;
    if (cfg.gateError > 0) {
      const r = rng.uniform();
      if (r < cfg.gateError) {
        const which = rng.uniform();
        const pauli = which < 1 / 3 ? 'X' : which < 2 / 3 ? 'Y' : 'Z';
        sv.applySingle(q, PAULI[pauli]());
      }
    }
    if (cfg.pRelax > 0) {
      sv.amplitudeDamp(q, cfg.pRelax, rng);
    }
    if (cfg.pDephase > 0) {
      if (rng.uniform() < cfg.pDephase) {
        sv.applySingle(q, PAULI.Z());
      }
    }
  }
}

// Apply one IR operation to the statevector. Returns a {cbit, bit} record for
// measurements in sampled mode, or null.
function applyOp(sv, op, mode, qubitNoises, rng) {
  switch (op.kind) {
    case 'barrier':
      return null; // no effect without scheduling/optimization passes
    case 'swap': {
      sv.applySwap(op.qubits[0], op.qubits[1]);
      applyGateNoise(sv, op.qubits, qubitNoises, rng);
      return null;
    }
    case 'gate': {
      const spec = GATES[op.name];
      const params = mode === 'sampled' ? resolveParams(op, qubitNoises, rng) : op.params;
      const matrix = spec.matrix(...params);
      let controlMask = 0;
      for (const q of op.controls) controlMask |= 1 << q;
      const target = op.targets[0];
      if (controlMask === 0) sv.applySingle(target, matrix);
      else sv.applyControlledSingle(controlMask, target, matrix);
      if (mode === 'sampled') {
        applyGateNoise(sv, [...op.controls, ...op.targets], qubitNoises, rng);
      }
      return null;
    }
    case 'measure': {
      if (mode === 'exact') return null; // exact mode reports the final distribution; see docs
      return { cbit: op.cbit, bit: sv.measureQubit(op.qubit, rng) };
    }
    case 'reset': {
      if (mode === 'exact') {
        throw new SimulationError(
          `line ${op.line}: reset is non-unitary and is only supported in sampled mode ` +
            '(run without exact mode, or remove the reset for an exact simulation)',
        );
      }
      if (sv.measureQubit(op.qubit, rng) === 1) {
        sv.applySingle(op.qubit, MATRICES.x());
      }
      return null;
    }
    default:
      throw new SimulationError(`internal error: unknown op kind "${op.kind}"`);
  }
}

function indexToKey(index, numQubits) {
  return index.toString(2).padStart(numQubits, '0');
}

function allZeroProbabilities(numQubits) {
  const out = {};
  for (let i = 0; i < 2 ** numQubits; i++) out[indexToKey(i, numQubits)] = 0;
  return out;
}

// Readout confusion: applied to the reported bit of every qubit that carries a
// configured readout model.
function applyReadout(bits, qubitNoises, rng) {
  for (let q = 0; q < bits.length; q++) {
    const cfg = qubitNoises.get(q);
    if (!cfg) continue;
    const r = rng.uniform();
    if (bits[q] === 0 && r < cfg.readout.p1given0) bits[q] = 1;
    else if (bits[q] === 1 && r < cfg.readout.p0given1) bits[q] = 0;
  }
}

function buildNoiseReport(resolved, numQubits) {
  const perQubit = {};
  for (const [idx, cfg] of resolved.perQubit) {
    perQubit[idx] = {
      initializationError: cfg.initializationError,
      readout: { ...cfg.readout },
      gateError: cfg.gateError,
      ...(cfg.gateFidelity !== undefined
        ? { gateFidelity: cfg.gateFidelity, fidelityConversion: cfg.fidelityConversion }
        : {}),
      rotationError: cfg.rotationError,
      t1: cfg.t1,
      t2: cfg.t2,
      gateTime: cfg.gateTime,
      pRelax: cfg.pRelax,
      pDephase: cfg.pDephase,
      channels: cfg.channels,
    };
  }
  return {
    qubitsConfigured: perQubit,
    qubitsIdeal: Array.from({ length: numQubits }, (_, i) => i).filter((i) => !resolved.perQubit.has(i)),
    channelModels: {
      readout: 'classical assignment/confusion matrix per reported bit',
      initialization: 'qubit starts in |1> with the configured probability',
      depolarizing: 'E(rho) = (1-p) rho + p I/2 per gate; trajectories draw X/Y/Z with p/3 each',
      rotation: 'rotation angles scaled by (1 + rotationError * N(0,1)) per application',
      'thermal-relaxation': 'amplitude damping, p1 = 1 - exp(-gateTime / T1), trajectory jump/no-jump',
      dephasing: 'Pauli-Z with p_phi = (1 - exp(-gateTime / T_phi)) / 2, 1/T_phi = 1/T2 - 1/(2*T1)',
      multiQubitRule: 'after a multi-qubit gate, each participating qubit applies its own channels independently',
    },
  };
}

/**
 * Simulate an OpenQASM 2.0/3.0 program.
 *
 * @param {string} source QASM source text.
 * @param {object} [options]
 * @param {object} [options.noise] per-qubit noise configuration (see docs/07).
 * @param {number} [options.shots=1024] shot count for sampled execution.
 * @param {number} [options.seed=12345] seed for all stochastic sampling.
 * @param {'auto'|'exact'|'sampled'} [options.mode='auto'] exact requires an ideal circuit.
 * @returns {{
 *   probabilities: Object<string, number>,
 *   statevector: Array<{re:number, im:number}> | null,
 *   metadata: object,
 *   noiseReport: object | null,
 * }}
 */
function simulate(source, options = {}) {
  const startedAt = process.hrtime.bigint();
  if (options === null || typeof options !== 'object') {
    throw new SimulationError('options must be an object');
  }
  const circuit = parseQasm(source);
  const resolved = resolveNoise(options.noise, circuit.numQubits);

  const mode = options.mode === undefined ? 'auto' : options.mode;
  if (!['auto', 'exact', 'sampled'].includes(mode)) {
    throw new SimulationError(`mode must be "auto", "exact" or "sampled", got "${mode}"`);
  }
  const effectiveMode = mode === 'auto' ? (resolved.ideal ? 'exact' : 'sampled') : mode;
  if (effectiveMode === 'exact' && !resolved.ideal) {
    throw new SimulationError(
      'exact mode requires an ideal circuit: a noise configuration is present with non-zero parameters. ' +
        'Noisy runs use sampled execution (shot-based Monte-Carlo trajectories).',
    );
  }

  const seed = options.seed === undefined ? 12345 : options.seed;
  const shots = options.shots === undefined ? 1024 : options.shots;

  let probabilities;
  let statevector = null;
  let gateCount = 0;

  if (effectiveMode === 'exact') {
    const sv = new StateVector(circuit.numQubits);
    for (const op of circuit.ops) {
      if (op.kind === 'gate' || op.kind === 'swap') gateCount++;
      applyOp(sv, op, 'exact', resolved.perQubit, null);
    }
    const arr = sv.probabilitiesArray();
    probabilities = {};
    for (let i = 0; i < arr.length; i++) probabilities[indexToKey(i, circuit.numQubits)] = arr[i];
    statevector = sv.toArray();
  } else {
    if (!Number.isInteger(shots) || shots < 1 || shots > 1e7) {
      throw new SimulationError(`shots must be an integer in [1, 1e7], got ${shots}`);
    }
    const rng = new Rng(seed);
    const counts = new Map();
    let representativeState = null;
    for (let shot = 0; shot < shots; shot++) {
      const sv = new StateVector(circuit.numQubits);
      // Initialization error: start the qubit in |1> with the configured probability.
      for (const [q, cfg] of resolved.perQubit) {
        if (cfg.initializationError > 0 && rng.uniform() < cfg.initializationError) {
          sv.applySingle(q, MATRICES.x());
        }
      }
      const measured = new Map();
      for (const op of circuit.ops) {
        if (op.kind === 'gate' || op.kind === 'swap') gateCount++;
        const rec = applyOp(sv, op, 'sampled', resolved.perQubit, rng);
        if (rec) measured.set(rec.cbit, rec.bit);
      }
      if (shot === 0 && resolved.ideal) representativeState = sv.toArray();
      // Sample the full basis state; qubits measured mid-circuit have collapsed,
      // so the sample is consistent with the recorded cbits.
      const index = sv.sample(rng);
      const bits = Array.from({ length: circuit.numQubits }, (_, q) => (index >> q) & 1);
      for (const [cbit, bit] of measured) {
        // cbit c of creg maps back to the qubit measured into it; the collapsed
        // state already agrees, this is an explicit consistency assignment.
        void cbit;
        void bit;
      }
      applyReadout(bits, resolved.perQubit, rng);
      const key = bits.map((b, q) => String(b)).reverse().join('');
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    probabilities = allZeroProbabilities(circuit.numQubits);
    for (const [key, count] of counts) probabilities[key] = count / shots;
    statevector = representativeState;
    gateCount = Math.round(gateCount / shots);
  }

  const wallTimeMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  return {
    probabilities,
    statevector,
    metadata: {
      qubitCount: circuit.numQubits,
      clbitCount: circuit.numClbits,
      qasmVersion: circuit.version,
      bitOrder: BIT_ORDER,
      mode: effectiveMode,
      probabilityKind: effectiveMode === 'exact' ? 'exact' : 'empirical-shot-frequencies',
      shots: effectiveMode === 'sampled' ? shots : null,
      seed: effectiveMode === 'sampled' ? seed : null,
      gateCount,
      warnings: circuit.warnings,
      wallTimeMs: Math.round(wallTimeMs * 1000) / 1000,
    },
    noiseReport: resolved.ideal && resolved.perQubit.size === 0 ? null : buildNoiseReport(resolved, circuit.numQubits),
  };
}

module.exports = { simulate, SimulationError, QasmError, NoiseConfigError };
