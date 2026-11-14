# 07 - Product Documentation

> Submission deliverable 4: purpose, functionality, installation,
> configuration, usage, inputs/outputs, workflow, examples and limitations.

## Purpose

A dependency-free JavaScript quantum circuit simulator. It parses OpenQASM
2.0/3.0 source text, simulates the circuit on a statevector, optionally
applies configurable per-qubit noise, and returns the computational-basis
probability distribution (plus the statevector for ideal runs).

## Installation

Requires Node.js >= 18. No packages to install.

```bash
git clone <this repo>
cd C3-01
node demo.js        # run the examples
npm test            # run the test suite (node --test)
node perf.js        # run the performance benchmark
```

## Usage

```js
const { simulate } = require('./src');

const source = `
OPENQASM 2.0;
include "qelib1.inc";
qreg q[2];
creg c[2];
h q[0];
cx q[0],q[1];
measure q -> c;
`;

// Ideal: exact probabilities + statevector
const ideal = simulate(source);

// Noisy: sampled execution, reproducible with a seed
const noisy = simulate(source, {
  noise: {
    qubits: {
      0: {
        readoutError: { p1given0: 0.02, p0given1: 0.05 },
        initializationError: 0.01,
        gateFidelity: 0.999,          // converted to p = 2 * (1 - F)
        rotationError: 0.005,
        t1: 50e-6,
        t2: 70e-6,                    // must satisfy t2 <= 2 * t1
        gateTime: 35e-9,
      },
      1: { readoutError: 0.03, gateError: 0.002 },
    },
  },
  shots: 4096,
  seed: 42,
});
```

## Inputs

| Input | Type | Notes |
|---|---|---|
| `source` | string | OpenQASM 2.0 or 3.0 program (subset in `docs/04`) |
| `options.noise` | object | Optional. `qubits` map keyed by global qubit index |
| `options.shots` | integer 1..1e7 | Default 1024; used in sampled mode |
| `options.seed` | integer | Default 12345; seeds every stochastic draw |
| `options.mode` | `auto`/`exact`/`sampled` | Default `auto`: exact when ideal, sampled when noisy |

### Noise parameters (per qubit)

| Key | Type | Meaning |
|---|---|---|
| `readoutError` | number or `{p1given0, p0given1}` | Readout confusion: P(report 1 \| actual 0) and P(report 0 \| actual 1); a bare number sets both |
| `initializationError` | probability | Qubit starts in `|1>` instead of `|0>` |
| `gateError` | probability | Explicit depolarizing probability per gate |
| `gateFidelity` | probability | Average gate fidelity; converted with `p = 2(1 - F)` (mutually exclusive with `gateError`) |
| `depolarizingError` | probability | Additional depolarizing probability per gate (adds to `gateError`) |
| `rotationError` | non-negative number | Relative standard deviation applied to rotation angles per gate |
| `t1` | seconds > 0 | Thermal relaxation time |
| `t2` | seconds > 0, `<= 2*t1` | Dephasing time |
| `gateTime` | seconds > 0 | Average gate duration; required when `t1`/`t2` is set |

## Outputs

```js
{
  probabilities: { '00': 0.48, '01': 0.02, '10': 0.03, '11': 0.47, ... }, // all 2^n keys
  statevector: [ { re, im }, ... ] | null,   // ideal runs only
  metadata: {
    qubitCount, clbitCount, qasmVersion,
    bitOrder,          // "q[0] is the rightmost character (least significant bit)"
    mode,              // 'exact' | 'sampled'
    probabilityKind,   // 'exact' | 'empirical-shot-frequencies'
    shots, seed,       // sampled mode only
    gateCount, warnings, wallTimeMs,
  },
  noiseReport: {
    qubitsConfigured,  // resolved per-qubit parameters + channels applied
    qubitsIdeal,
    channelModels,     // the formula strings for every channel
  } | null,
}
```

**Bit-order convention.** Probability keys and statevector indices both use
the basis-state index: qubit `q` is bit `q` of the index, and the key is the
index written as a big-endian binary string of length `n`. Example with 3
qubits: `x q[0];` gives key `'001'` (index 1); `x q[2];` gives `'100'`
(index 4).

**Exact vs empirical.** Ideal runs return exact probabilities (`|a_i|^2`).
Noisy runs return empirical shot frequencies and say so in
`metadata.probabilityKind`; exact mode with an active noise configuration is
rejected with guidance.

## Workflow

1. Write or load a QASM program (see `examples/`).
2. Optionally configure per-qubit noise.
3. Call `simulate`; inspect `probabilities`, `statevector` (ideal), `metadata`
   and `noiseReport`.
4. Errors: `QasmError` (parse, with line number), `NoiseConfigError`
   (configuration), `SimulationError` (mode/semantics conflicts).

## Examples

`node demo.js` simulates every file in `examples/` ideally and noisily:

- `bell.qasm` - Bell state, OpenQASM 2.0.
- `bell3.qasm` - Bell state, OpenQASM 3.0 syntax.
- `ghz.qasm` - 3-qubit GHZ state.
- `rotations.qasm` - rotations and controlled rotations.

## Known limitations

- Exponential memory: practical up to ~24 qubits (~270 MB statevector).
- Subset only: no custom gate definitions, no classical control flow, no
  pulse/3.0 types; rejected with line-numbered diagnostics, never dropped
  silently.
- `measure` does not collapse in exact mode (exact mode reports the final
  distribution); `reset` is sampled-mode only.
- Multi-qubit gate noise applies each participating qubit's channels
  independently - correlated two-qubit error processes are not modeled.
- Dephasing/relaxation act per gate via `gateTime`; idle-time evolution and
  gate-specific durations are not modeled.
- The readout model applies to every reported bit of a configured qubit,
  including end-of-shot reads of unmeasured qubits.
- Rotation error is a per-application Gaussian perturbation of the angle; it
  is not a coherent systematic calibration error.
