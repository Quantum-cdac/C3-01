# 08 - AI-Tool Usage Disclosure

The participant briefing permits AI/LLM assistance for coding, debugging,
research and documentation, and requires that material AI-tool use be
disclosed and that the team review, validate and be able to explain the work.

## What was used

An AI coding assistant (Instinct) was used materially during the hackathon
period for this repository, including:

- drafting the simulator architecture and source code (`src/`),
- drafting the test suite (`test/`), examples, benchmark and documentation,
- grounding the problem-statement requirements and mapping them to the
  implementation (`docs/01`).

## How the work was validated

- The full test suite (80 tests) passes, including cross-checks of the sparse
  statevector engine against an independently written dense-matrix reference
  and statistical tests of every noise channel with fixed seeds.
- Performance figures in `docs/06` were measured by running `perf.js` in this
  environment, not estimated.
- Team members reviewed the code and documents and can explain the design
  (statevector method, trajectory noise channels, fidelity conversion and the
  T1/T2 model) as presented in `docs/03`.

No confidential information, credentials or restricted material was entered
into external AI services.
