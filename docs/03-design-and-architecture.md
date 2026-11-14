# 03 - Design and Architecture

> Submission deliverable 2: solution approach, algorithms and mathematical
> concepts, architecture, implementation method and references.

## Pipeline

```
QASM source (string)
      |
      v
 src/parser.js        hand-written tokenizer + recursive-descent expression
      |               parser; produces the IR below or a QasmError(line)
      v
 IR: { version, numQubits, qregs, cregs, ops[] }
      |
      v
 src/noise.js         validates the noise object against the circuit
      |               (ranges, T2 <= 2*T1, fidelity/error exclusivity,
      |                unknown qubits/keys) and resolves per-qubit channels
      v
 src/simulator.js     mode selection:
        - ideal  -> exact statevector pass (single sweep over ops)
        - noisy  -> `shots` Monte-Carlo trajectories with one seeded Rng
      |
      v
 { probabilities, statevector|null, metadata, noiseReport|null }
```

## Simulation method (algorithm and math)

**Exact mode** keeps the full statevector `|psi> = sum_i a_i |i>` as two
`Float64Array`s (real/imaginary parts), `a_i` the amplitude of basis state `i`.
Qubit `q` is bit `q` of `i`. A single-qubit gate `U` on qubit `q` updates
amplitude pairs `(a_i, a_{i|2^q})` in place with the `2x2` matrix product - no
`2^n x 2^n` matrix is ever formed, so one gate costs `O(2^n)` work and the
whole state costs `O(2^n)` memory. Controlled gates mask on the control bits;
`swap` exchanges paired amplitudes. After all operations, `P(i) = |a_i|^2`
gives the exact distribution over all `2^n` outcomes.

**Sampled mode (noisy execution)** is a Monte-Carlo quantum-trajectory loop.
Each shot starts from `|0...0>` (with initialization flips), applies every
operation ideally, then applies the configured noise channels of each
participating qubit as stochastic events drawn from one seeded PRNG, collapses
mid-circuit measurements projectively, and finally samples one outcome from
the terminal statevector. Readout confusion flips the reported bits
classically. The returned probabilities are the empirical shot frequencies and
are labeled `empirical-shot-frequencies` in the metadata; they converge to the
noisy channel's exact probabilities as shots grow.

## Noise channel models (all formulas as implemented)

Per gate application on qubit `q`, with per-qubit parameters:

1. **Rotation error** - before the unitary, each rotation angle `theta` of a
   rotation gate (`rx ry rz crx cry crz`) is scaled by `(1 + sigma * g)`, where
   `sigma` is the configured `rotationError` and `g ~ N(0,1)` from the seeded
   PRNG.
2. **Depolarizing (gate error)** - after the unitary, with probability `1 - p`
   nothing happens; otherwise one of `X, Y, Z` is applied with probability
   `p/3` each. This is the trajectory form of
   `E(rho) = (1 - p) rho + p * I/2`.
   - Explicit: `p = gateError + depolarizingError`.
   - From fidelity: `p = 2 * (1 - F)`, the exact inversion of the average gate
     fidelity of the qubit depolarizing channel,
     `F_avg = 1 - p (d-1)/d` with `d = 2`. Fidelity is never used as an error
     probability directly; `gateError` and `gateFidelity` are mutually
     exclusive in one qubit's configuration.
3. **Thermal relaxation (T1)** - amplitude damping with
   `p1 = 1 - exp(-t / T1)`, `t = gateTime`, applied as a trajectory: the jump
   Kraus `K1 = [[0, sqrt(p1)], [0, 0]]` fires with probability
   `p1 * P(q = 1)`, otherwise the no-jump Kraus
   `K0 = diag(1, sqrt(1 - p1))` applies; the state is renormalized after
   either branch.
4. **Dephasing (T2)** - phase-flip (Pauli-Z) channel with
   `p_phi = (1 - exp(-t / T_phi)) / 2`, where
   `1/T_phi = 1/T2 - 1/(2*T1)`. Amplitude damping already contributes
   `1/(2*T1)` to the coherence decay rate, so adding the `T_phi` channel
   reproduces the total `1/T2`. Validation requires `T2 <= 2*T1` (physical
   consistency); when only `T2` is given, `T1 = infinity` is assumed and
   `T_phi = T2`. When `T2 = 2*T1`, `p_phi = 0` by construction.
5. **Initialization** - before the first gate, the qubit starts in `|1>` with
   the configured probability.
6. **Readout** - classical assignment/confusion model on each reported bit:
   `P(report 1 | actual 0) = p1given0`, `P(report 0 | actual 1) = p0given1`.
   Applied to every reported bit of a configured qubit (an unmeasured qubit is
   read out at the end of the shot).

**Multi-qubit gates:** the ideal unitary acts on all operands first; then every
participating qubit applies its own configured channels independently. This
independent-per-qubit rule is a documented approximation: it does not model
correlated two-qubit depolarizing noise.

## Reproducibility

All randomness flows through one `mulberry32` PRNG seeded by `options.seed`
(Gaussian draws via Box-Muller). Same seed + same inputs = identical
frequencies; verified by test.

## References

- OpenQASM 2.0 specification (arXiv:1707.03429) and OpenQASM 3.0 specification
  (arXiv:2104.14722) for the grammar subset and standard gate semantics.
- Nielsen & Chuang, *Quantum Computation and Quantum Information*, for the
  statevector formalism and the amplitude-damping / phase-flip channel
  definitions.
- Standard hardware noise-model practice (e.g. Qiskit Aer noise model
  documentation) for the `T_phi` decomposition
  `1/T2 = 1/(2*T1) + 1/T_phi` and the trajectory implementation of amplitude
  damping.
