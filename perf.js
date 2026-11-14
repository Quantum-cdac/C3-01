'use strict';

// Performance benchmark: exact statevector simulation of random circuits at
// increasing qubit counts. Records wall time and peak heap per size. Results
// are printed as a table and written to perf-results.json for docs/06.

const { StateVector } = require('./src/statevector');
const { GATES } = require('./src/gates');
const { Rng } = require('./src/rng');
const { simulate } = require('./src');
const fs = require('node:fs');

function randomCircuit(n, depth, rng) {
  const ops = [];
  for (let d = 0; d < depth; d++) {
    for (let q = 0; q < n; q++) {
      const pick = rng.uniform();
      if (pick < 0.4) ops.push({ kind: 'gate', name: 'h', params: [], controls: [], targets: [q] });
      else if (pick < 0.7) ops.push({ kind: 'gate', name: 'rz', params: [rng.uniform() * Math.PI], controls: [], targets: [q] });
      else if (q + 1 < n) ops.push({ kind: 'gate', name: 'cx', params: [], controls: [q], targets: [q + 1] });
    }
  }
  return ops;
}

function bench(n, depth) {
  const rng = new Rng(1234 + n);
  const ops = randomCircuit(n, depth, rng);
  if (global.gc) global.gc();
  const before = process.memoryUsage().heapUsed;
  const start = process.hrtime.bigint();
  const sv = new StateVector(n);
  for (const op of ops) {
    const spec = GATES[op.name];
    const m = spec.matrix(...op.params);
    if (op.controls.length === 0) sv.applySingle(op.targets[0], m);
    else sv.applyControlledSingle(1 << op.controls[0], op.targets[0], m);
  }
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  const after = process.memoryUsage().heapUsed;
  return {
    qubits: n,
    gates: ops.length,
    statevectorBytes: 2 * 8 * 2 ** n,
    timeMs: Math.round(ms * 10) / 10,
    heapDeltaMB: Math.round(((after - before) / 1e6) * 10) / 10,
  };
}

function benchEndToEnd() {
  // Parser + exact simulation on a generated 8-qubit QASM text with 2000 gates.
  const rng = new Rng(7);
  const lines = ['OPENQASM 2.0;', 'qreg q[8];'];
  for (let i = 0; i < 2000; i++) {
    const a = Math.floor(rng.uniform() * 8);
    const pick = rng.uniform();
    if (pick < 0.5) lines.push(`rz(pi/${1 + Math.floor(rng.uniform() * 8)}) q[${a}];`);
    else if (pick < 0.8) lines.push(`h q[${a}];`);
    else lines.push(`cx q[${a}],q[${(a + 1) % 8}];`);
  }
  const src = lines.join('\n');
  const start = process.hrtime.bigint();
  simulate(src);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  return { gates: 2000, qubits: 8, timeMs: Math.round(ms * 10) / 10 };
}

const rows = [];
for (const n of [4, 8, 10, 12, 14, 16, 18, 20, 22, 24]) {
  rows.push(bench(n, 10));
}
const e2e = benchEndToEnd();

console.log('Exact statevector engine, random circuits (depth 10 layers/qubit, H/RZ/CX mix)');
console.log('qubits | gates | statevector | time (ms) | heap delta (MB)');
for (const r of rows) {
  console.log(
    `${r.qubits} | ${r.gates} | ${(r.statevectorBytes / 1e6).toFixed(2)} MB | ${r.timeMs} | ${r.heapDeltaMB}`,
  );
}
console.log(`end-to-end (parse + simulate, 8 qubits, 2000 gates): ${e2e.timeMs} ms`);

fs.writeFileSync(
  require('node:path').join(__dirname, 'perf-results.json'),
  JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, rows, e2e }, null, 2),
);
console.log('wrote perf-results.json');
