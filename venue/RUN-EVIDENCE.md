# Venue run evidence - Qniverse hosted Jupyter notebook

Date: 2026-11-14 (IST), during the hackathon venue session.

This file records an actual run of the C3-01 simulator inside the Qniverse
hosted Jupyter notebook (accessed via the Qniverse side panel, "Launch
Notebook"; see https://qniverse.in/docs/qniverse-labs-resources/). The
notebook used was `venue/C3-01-demo.ipynb` from this repository.

## Environment reported by the notebook's first cell

```
python : 3.11.6
node   : v20.8.1 at /opt/conda/bin/node
git    : /usr/bin/git
$ /usr/bin/git clone --depth 1 https://github.com/Quantum-cdac/C3-01.git /home/jovyan/work/c301-demo/C3-01
repo ready at: /home/jovyan/work/c301-demo/C3-01
```

## What ran

1. `node demo.js` - ideal (exact) and noisy (1024 shots, seed 20261114) runs
   of all examples.
2. `node --test test/ideal.test.js test/parser.test.js test/noise.test.js test/validation.test.js test/reproducibility.test.js`
   - the full automated test suite.

Test summary printed in the venue notebook:

```
# tests 80
# suites 0
# pass 80
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1775.369301
```

## Noisy run outputs (as printed at the venue)

3-qubit Bell example, noisy (1024 shots, seed 20261114, per-qubit noise):

```json
{
  "probabilities": {
    "101": 0.0078125,
    "110": 0.025390625,
    "111": 0.4560546875,
    "000": 0.4853515625,
    "001": 0.0107421875,
    "010": 0.013671875,
    "011": 0.0009765625
  },
  "statevector": null,
  "metadata": {
    "qubitCount": 3, "clbitCount": 3, "qasmVersion": "2.0",
    "mode": "sampled", "probabilityKind": "empirical-shot-frequencies",
    "shots": 1024, "seed": 20261114, "gateCount": 3,
    "wallTimeMs": 8.112
  }
}
```

examples/rotations.qasm, noisy (1024 shots, seed 20261114, per-qubit noise):

```json
{
  "probabilities": {
    "10": 0.109375,
    "11": 0.048828125,
    "00": 0.603515625,
    "01": 0.23828125
  },
  "statevector": null,
  "metadata": {
    "qubitCount": 2, "clbitCount": 2, "qasmVersion": "2.0",
    "mode": "sampled", "probabilityKind": "empirical-shot-frequencies",
    "shots": 1024, "seed": 20261114, "gateCount": 4,
    "wallTimeMs": 87.015
  }
}
```

Both venue outputs are bit-for-bit identical to running `node demo.js`
locally with the same seed (20261114): same probabilities, same resolved
noise channels (`pRelax` / `pDephase` values), same fidelity conversion.
This is the seeded-reproducibility property demonstrated end to end.

## Scope of this evidence

- This run executed our JavaScript simulator and its test suite inside
  Qniverse's hosted Jupyter notebook environment, using the Node.js runtime
  available there.
- It was not a job submitted to a Qniverse quantum backend, and it does not
  use the QSDK. The C3-01 problem statement defines a JavaScript
  environment; the simulator and its custom noise model run in Node.js.
- Whether hosted-notebook execution satisfies the rulebook's substantive
  Qniverse-use requirement for this problem statement is the organisers'
  interpretation, not something this document asserts.
