# 01 - Requirements

Problem: **QC-C3-01 - JavaScript-Based OpenQASM Quantum Circuit Simulator with
Configurable Noise** (Class III, JavaScript environment), from the official
hackathon problem-statement document.

## Functional requirements (from the PS) and where each is met

| # | PS requirement | Where |
|---|---|---|
| 1 | Accept OpenQASM 2.0 or 3.0 source as a string and an optional noise-configuration object | `simulate(source, options)` in `src/simulator.js`; parsing in `src/parser.js` |
| 2 | Parse the supported QASM subset into an internal circuit representation | `parseQasm` returns the IR documented in `docs/04-supported-constructs.md` |
| 3 | Simulate supported one- and multi-qubit gates with a documented, mathematically valid method | Sparse statevector engine (`src/statevector.js`); method in `docs/03` |
| 4 | Return the probability of every computational-basis outcome | `result.probabilities` contains all `2^n` keys |
| 5 | Up to `2^n` probabilities with a documented bit-order convention | `metadata.bitOrder`: `q[0]` is the rightmost character (basis-state index as a big-endian binary string) |
| 6 | Per-qubit readout error, initialization error, gate fidelity or gate-error probability, gate-rotation error, depolarizing error, T1, T2, average gate-application time | Noise schema in `src/noise.js`, documented in `docs/07` |
| 7 | Define how fidelity maps to an error model, or accept an explicit probability; never treat fidelity itself as an error probability | `p = 2 * (1 - F)` from `F_avg = 1 - p(d-1)/d` with `d = 2`; `gateError` and `gateFidelity` are mutually exclusive |
| 8 | Documented readout assignment/confusion model; initialization and gate errors as stated channels | Channel formulas in `docs/03` and echoed in every `noiseReport` |
| 9 | Thermal relaxation and dephasing via T1, T2 and operation duration | Amplitude damping `p1 = 1 - exp(-t/T1)`; phase flip `p_phi = (1 - exp(-t/T_phi))/2`, `1/T_phi = 1/T2 - 1/(2*T1)` |
| 10 | Validate physical consistency, including the T1/T2 relationship | `T2 <= 2*T1` enforced; positivity of T1/T2/gateTime enforced |
| 11 | Multi-qubit gates: apply each affected qubit's error model per a documented rule | After the ideal unitary, each participating qubit applies its own channels independently |
| 12 | Ideal simulation when noise is omitted or all parameters are zero; provide the statevector in that case | Auto mode selection; `statevector` returned in exact mode and in ideal sampled runs |
| 13 | Shot count and random seed for sampled execution | `options.shots`, `options.seed`; seeded PRNG (`src/rng.js`) |
| 14 | Distinguish exact probabilities from empirical shot frequencies | `metadata.probabilityKind`: `exact` vs `empirical-shot-frequencies` |
| 15 | Reject invalid ranges, unknown qubits, malformed QASM and unsupported operations with clear diagnostics | `NoiseConfigError`, `QasmError` (with line numbers), `SimulationError`; tests in `test/validation.test.js` |

## Non-functional requirements

- Zero runtime dependencies; Node.js >= 18.
- Reproducible: a fixed seed reproduces a sampled run exactly.
- Honest reporting: unsupported syntax is a parse error with a line number,
  never a silently dropped operation.
