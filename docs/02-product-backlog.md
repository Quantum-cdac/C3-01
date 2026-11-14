# 02 - Product Backlog

Ordered backlog as executed during the event. Status: done / dropped (reason).

| # | Item | Status |
|---|---|---|
| 1 | Seeded PRNG (uniform + Gaussian) for reproducible stochastic runs | done |
| 2 | OpenQASM 2.0 parser: header, includes, qreg/creg, gates, measure/reset/barrier, angle expressions, comments, line-numbered diagnostics | done |
| 3 | OpenQASM 3.0 surface syntax: `qubit[n]`/`bit[n]` declarations, `c = measure q` assignment form | done |
| 4 | Internal circuit IR with multi-register global qubit indexing | done |
| 5 | Sparse statevector engine: single-qubit, controlled single-qubit (any control count used by the gate set), swap, sampling, projective measurement | done |
| 6 | Exact simulation mode: full `2^n` probability map + statevector | done |
| 7 | Noise schema validation (ranges, unknown qubits/keys, T2 <= 2*T1, fidelity/error exclusivity) | done |
| 8 | Stochastic channel models: initialization, depolarizing (incl. fidelity conversion), rotation, T1 amplitude damping (trajectory), T2 dephasing, readout confusion | done |
| 9 | Sampled execution: shots, seed, empirical frequencies, mid-circuit measurement collapse, reset | done |
| 10 | Simulation metadata and noise report | done |
| 11 | Test suite: analytic ideals, independent dense-matrix reference cross-check, statistical noise tests, validation, reproducibility, bit order | done (80 tests) |
| 12 | Examples + demo runner | done |
| 13 | Performance benchmark and report | done |
| 14 | Custom gate definition expansion (`gate ... { }` composition) | dropped - rejected with an explicit diagnostic instead; out of MVP scope |
| 15 | Classical control flow (`if`/loops) | dropped - rejected with an explicit diagnostic; PS allows MVP to reject non-unitary/classically conditioned semantics |
| 16 | OpenQASM 3.0 full grammar (types, extern, pulse) | dropped - subset only, documented in docs/04 |
