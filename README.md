# QC-C3-01 - JavaScript-Based OpenQASM Quantum Circuit Simulator with Configurable Noise

A dependency-free Node.js simulator that accepts OpenQASM 2.0/3.0 source text,
optionally accepts a per-qubit noise configuration, and returns the
computational-basis probability distribution (with the statevector for ideal
runs). Class III problem of the C-DAC Quantum Computing Hackathon.

## Quick start

```bash
node demo.js              # simulate every example, ideally and with noise
npm test                  # 80 tests: node --test
node perf.js              # performance benchmark
```

```js
const { simulate } = require('./src');

const result = simulate(qasmSource, {
  noise: { qubits: { 0: { readoutError: 0.02, t1: 50e-6, t2: 70e-6, gateTime: 35e-9 } } },
  shots: 4096,
  seed: 42,
});

result.probabilities   // { '00': p, '01': p, ... } - all 2^n outcomes
result.statevector     // [{ re, im }, ...] for ideal runs, null for noisy runs
result.metadata        // version, bit order, mode, shots, seed, exact vs empirical
result.noiseReport     // resolved per-qubit parameters and channel formulas
```

## Features

- OpenQASM 2.0 and 3.0 subset parsing with line-numbered diagnostics
  (supported subset: `docs/04-supported-constructs.md`).
- Exact sparse statevector simulation: full `2^n` probability map plus the
  statevector.
- Configurable per-qubit noise: readout confusion, initialization error,
  depolarizing gate error (explicit or converted from fidelity with
  `p = 2(1 - F)`), rotation error, T1 thermal relaxation and T2 dephasing via
  gate time (documented channel formulas in `docs/03`).
- Reproducible sampled execution: shot count + seed; exact probabilities are
  always distinguished from empirical shot frequencies.
- Strict validation: invalid ranges, unknown qubits, `T2 > 2*T1`, malformed or
  unsupported QASM all fail with clear errors - never silent output.

## Documentation

| File | Contents |
|---|---|
| `docs/00-team-information.md` | Team details (submission deliverable 1) |
| `docs/01-requirements.md` | PS requirements mapped to the implementation |
| `docs/02-product-backlog.md` | Backlog and scope decisions |
| `docs/03-design-and-architecture.md` | Approach, algorithms, noise math, references (deliverable 2) |
| `docs/04-supported-constructs.md` | Documented QASM subset |
| `docs/05-test-plan-and-results.md` | Test plan and results |
| `docs/06-performance-analysis.md` | Measured performance and complexity (deliverable 3) |
| `docs/07-product-documentation.md` | Installation, API, noise schema, limitations (deliverable 4) |
| `docs/08-ai-usage-disclosure.md` | Material AI-tool use disclosure |

## Layout

```
src/parser.js        OpenQASM 2.0/3.0 subset parser -> IR
src/statevector.js   sparse statevector engine
src/noise.js         noise schema validation + channel resolution
src/simulator.js     exact + Monte-Carlo trajectory simulation
src/rng.js           seeded PRNG (mulberry32 + Box-Muller)
src/gates.js         gate matrix library
test/                node:test suites + independent dense-matrix reference
examples/            QASM sample circuits
demo.js, perf.js     runnable demo and benchmark
```
