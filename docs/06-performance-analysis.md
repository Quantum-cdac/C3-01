# 06 - Performance and Resource Analysis

> Submission deliverable 3: time/memory requirements, complexity, execution
> time and resource utilization.

## Complexity

Exact statevector simulation is exponential in the qubit count by nature:

- Memory: `2^n` complex amplitudes = `16 * 2^n` bytes (two Float64Arrays).
- Time: `O(2^n)` per gate (single- and controlled-single-qubit gates, swap),
  so `O(g * 2^n)` for `g` gates; parsing is linear in source length.
- Sampled mode multiplies time by the shot count: `O(shots * g * 2^n)`.

## Measured results

Benchmark: `node perf.js` (random circuits, depth 10 layers per qubit, H/RZ/CX
mix, seeded). Machine: Node v22.23.4, linux x64, this development environment,
2026-11-14. Full data in `perf-results.json`.

| Qubits | Gates | Statevector memory | Time (ms) |
|---:|---:|---:|---:|
| 4 | 36 | 0.00 MB | 0.5 |
| 8 | 77 | 0.00 MB | 4.1 |
| 10 | 97 | 0.02 MB | 3.5 |
| 12 | 116 | 0.07 MB | 1.5 |
| 14 | 137 | 0.26 MB | 8.0 |
| 16 | 157 | 1.05 MB | 30.3 |
| 18 | 179 | 4.19 MB | 140.3 |
| 20 | 195 | 16.78 MB | 620.6 |
| 22 | 213 | 67.11 MB | 2708.1 |
| 24 | 238 | 268.44 MB | 11881.1 |

End-to-end (parse + exact simulation of a generated 8-qubit, 2000-gate QASM
text): **17.6 ms**, i.e. parsing overhead is negligible next to simulation.

Observations:

- Time per qubit count roughly quadruples per +2 qubits, matching `O(2^n)`
  with a linear gate count; run-to-run jitter dominates at n <= 14.
- Memory is the binding constraint: 24 qubits needs ~270 MB for the
  statevector alone. 26 qubits (~1 GB) is the practical ceiling on typical
  hardware; beyond that the engine would need sparse or tensor-network
  methods (out of scope).
- Sub-millisecond-to-millisecond times up to ~12 qubits make the noisy
  sampled mode (shots x gate sweeps) comfortable for hackathon-scale demos:
  e.g. 4000 shots of an 8-qubit, ~80-gate noisy circuit completes in seconds.

## Resource utilization notes

- Zero dependencies; no native modules; heap usage beyond the statevector is
  small (amplitude arrays dominate, as the table's statevector column shows).
- The probability map always contains all `2^n` outcome keys; its size is
  therefore part of the exponential cost and is included in the times above.
