# 05 - Test Plan and Results

## How to run

```bash
node --test 'test/*.test.js'    # or: npm test
```

## Result

**80 tests, 80 passing, 0 failing** (Node v22.23.4, this development machine,
2026-11-14). The suite is deterministic: every statistical test uses a fixed
seed and a tolerance of 0.05 (about 6 standard deviations at 4000 shots for
the p = 0.5 cases).

## Coverage map

| Area | File | What is checked |
|---|---|---|
| Ideal simulation | `test/ideal.test.js` | `|0...0>` for 1-4 qubits; X/H; Bell `{00: .5, 11: .5}`; GHZ-3; `cnot` alias; Toffoli on/off; swap; rotations (`rx(pi)=X` up to phase, `rz` on `|0>`, `ry(pi)` undoing X); u1/u2/u3 and S/Sdg identities; bit order (q[0] rightmost); exact mode returns all `2^n` keys; non-collapsing exact-mode measure; reset rejected in exact mode and working in sampled mode |
| Reference comparison | `test/ideal.test.js` + `test/helpers/reference.js` | The sparse engine's amplitudes are compared against an **independent dense-matrix reference** (full `2^n x 2^n` unitaries built with explicit Kronecker products, separate code path) on four mixed 2-4 qubit circuits including controlled rotations, ccx, swap and a 3.0-syntax circuit; agreement to 1e-12 |
| Parser | `test/parser.test.js` | Version header required; unsupported versions; version-gated declarations; duplicate registers; out-of-range indices; duplicate operands; parameter arity; angle expressions (pi arithmetic, unary minus, parentheses); comments; register-size mismatch on measure; whole-register measure expansion; barrier no-op + warning; `OPENQASM 3.0` spelling; missing-semicolon, custom-gate and control-flow rejections with line numbers |
| Noise channels | `test/noise.test.js` | Readout confusion (0.8 expected frequency for p0given1 = 0.2); initialization error rate; full depolarizing randomizes `|+>`; fidelity conversion `p = 2(1-F)` and its reporting; rotation error broadens `rx(pi)`; T1 relaxation drives `|1>` back to `|0>` (and a long T1 leaves it intact); pure dephasing scrambles an H-dephase-H interference; `T2 = 2*T1` gives zero pure dephasing; resolved pRelax/pDephase match the documented formulas exactly; per-qubit isolation (noise on q[1] leaves q[0]'s marginal at 50/50); multi-qubit gates apply each participant's model; combined channels; sampled-mode normalization over all `2^n` keys; noise report contents; ideal sampled runs still return the statevector; mid-circuit measurement collapses the trajectory |
| Validation | `test/validation.test.js` | Probabilities outside [0,1]; non-positive T1/T2/gateTime; `T2 > 2*T1`; T1/T2 without gateTime; unknown qubit indices and keys; `gateError` + `gateFidelity` together; combined error > 1; exact mode with active noise; all-zero noise stays exact; invalid shots/seed/mode; malformed QASM; error messages carry the line number |
| Reproducibility | `test/reproducibility.test.js` | Same seed -> identical frequencies; different seeds -> different tallies; exact mode seed-independent; metadata carries version/bit-order/mode/shots/seed; key equals basis-state index; exact vs empirical kinds distinguished; null noise report without a noise config |

## Notes

- Statistical assertions use fixed seeds, so they verify the implemented
  channel semantics deterministically; the tolerances absorb only the
  sampling randomness frozen into the chosen seeds.
- The reference cross-check compares amplitudes (not just probabilities), so
  phase handling of `s/sdg/t/tdg/u*` and controlled rotations is verified too.
