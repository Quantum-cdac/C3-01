# 04 - Supported OpenQASM Constructs

The parser accepts a documented subset of OpenQASM 2.0 and 3.0. Anything
outside the subset is a parse error with the source line number - never a
silently ignored statement.

## Version detection

- First statement must be `OPENQASM 2.0;` (2.0) or `OPENQASM 3;` / `OPENQASM 3.0;` (3.0).
- 2.0 declarations: `qreg name[N];`, `creg name[N];`, standard include `include "qelib1.inc";`.
- 3.0 declarations: `qubit[N] name;` / `qubit name;`, `bit[N] name;` / `bit name;`, standard include `include "stdgates.inc";`.
- Mixing declaration styles across versions is rejected (e.g. `qreg` in a 3.0 program).
- Unknown includes are ignored with a warning; the built-in gate set is always available.

## Gates

| Kind | Names | Parameters |
|---|---|---|
| Single-qubit, fixed | `h x y z s sdg t tdg id` | 0 |
| Single-qubit, rotation/phase | `rx ry rz p u1` | 1 |
| Single-qubit, general | `u2` | 2 |
| Single-qubit, general | `u3` | 3 |
| Controlled (1 control, 1 target) | `cx` (alias `cnot`), `cy cz ch` | 0 |
| Controlled rotation/phase | `cp cu1 crx cry crz` | 1 |
| Two-target | `swap` | 0 |
| Two controls | `ccx` | 0 |

Gate names are lowercase. Angle expressions support numbers, `pi`, `+ - * /`
and parentheses (e.g. `rz(pi/2 + 3*pi/4)`, `rx(-pi)`).

## Operands

- Indexed: `q[0]`. Whole register: `q` (single-qubit gates broadcast
  elementwise; multi-operand gates require same-sized register operands and
  broadcast pairwise).
- Multiple quantum registers are allowed; global qubit indices follow
  declaration order (`qreg a[1]; qreg b[2];` puts `b[0]` at global index 1).
  Noise configuration and probability keys always use the global index.

## Non-unitary operations

- `measure q[i] -> c[j];` (2.0 and 3.0) and `c[j] = measure q[i];` (3.0 only);
  whole-register `measure q -> c;` requires matching sizes and maps
  elementwise.
- `reset q[i];` (or whole register).
- `barrier ...;` parses to a no-op and adds a warning: this simulator has no
  scheduling or optimization passes for a barrier to constrain.

**Measurement semantics.** In exact mode the full final statevector
distribution is reported and `measure` does not collapse the state (exact mode
is a distribution computation, not a shot). In sampled mode each `measure`
projectively collapses the trajectory and records the bit. `reset` is
supported in sampled mode (measure-and-flip trajectory) and rejected in exact
mode with a clear diagnostic, because it is non-unitary.

## Explicitly rejected (with diagnostics)

- Custom gate definitions: `gate name ... { ... }` and `opaque`.
- Classical control flow: `if`, `for`, `while`, `switch`, `box`, `delay`.
- Everything else not listed above (e.g. 3.0 type declarations, `extern`,
  pulse constructs) - rejected as an unsupported/malformed statement with its
  line number.
