'use strict';

// Generic runner: simulate any QASM file.
//   node run.js <circuit.qasm> [shots] [seed]
// Optional noise configuration: set NOISE_JSON to a JSON file path, e.g.
//   NOISE_JSON=noise.json node run.js bell.qasm 4096 42
// where noise.json is {"qubits": {"0": {"readoutError": 0.05, ...}}}.

const fs = require('node:fs');
const { simulate } = require('./src');

const [, , file, shots, seed] = process.argv;
if (!file) {
  console.error('usage: node run.js <circuit.qasm> [shots] [seed]');
  console.error('optional: NOISE_JSON=<noise-config.json> enables noisy sampled execution');
  process.exit(1);
}

const options = {};
if (process.env.NOISE_JSON) {
  options.noise = JSON.parse(fs.readFileSync(process.env.NOISE_JSON, 'utf8'));
}
if (shots !== undefined) options.shots = parseInt(shots, 10);
if (seed !== undefined) options.seed = parseInt(seed, 10);

const source = fs.readFileSync(file, 'utf8');
const result = simulate(source, options);

const nonZero = Object.fromEntries(
  Object.entries(result.probabilities).filter(([, p]) => p > 1e-12),
);
console.log(JSON.stringify({
  probabilities: nonZero,
  statevector: result.statevector,
  metadata: result.metadata,
  noiseReport: result.noiseReport,
}, null, 2));
