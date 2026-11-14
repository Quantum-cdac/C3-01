'use strict';

// Demo runner: simulates every circuit in examples/ - ideally, then with a
// sample noise configuration - and prints the results as JSON.

const fs = require('node:fs');
const path = require('node:path');
const { simulate } = require('./src');

const examplesDir = path.join(__dirname, 'examples');

function compact(result) {
  return {
    probabilities: Object.fromEntries(
      Object.entries(result.probabilities).filter(([, p]) => p > 1e-12),
    ),
    statevector: result.statevector
      ? result.statevector.map((z) => [round(z.re), round(z.im)])
      : null,
    metadata: result.metadata,
    noiseReport: result.noiseReport ? result.noiseReport.qubitsConfigured : null,
  };
}

function round(x) {
  return Math.round(x * 1e6) / 1e6;
}

const NOISE = {
  qubits: {
    0: {
      readoutError: { p1given0: 0.02, p0given1: 0.05 },
      initializationError: 0.01,
      gateFidelity: 0.999,
      rotationError: 0.005,
      t1: 50e-6,
      t2: 70e-6,
      gateTime: 35e-9,
    },
    1: {
      readoutError: 0.03,
      gateError: 0.002,
      t1: 60e-6,
      t2: 80e-6,
      gateTime: 35e-9,
    },
  },
};

for (const file of fs.readdirSync(examplesDir).filter((f) => f.endsWith('.qasm')).sort()) {
  const source = fs.readFileSync(path.join(examplesDir, file), 'utf8');
  console.log('='.repeat(72));
  console.log(`examples/${file}`);
  console.log('-'.repeat(72));
  console.log('IDEAL (exact probabilities + statevector):');
  console.log(JSON.stringify(compact(simulate(source)), null, 2));
  console.log('-'.repeat(72));
  console.log('NOISY (1024 shots, seed 20261114, per-qubit noise):');
  console.log(JSON.stringify(compact(simulate(source, { noise: NOISE, shots: 1024, seed: 20261114 })), null, 2));
}
