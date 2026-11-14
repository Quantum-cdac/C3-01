'use strict';

// Complex-number helpers and the gate matrix library.
// A 2x2 complex matrix is [[a, b], [c, d]] where each entry is {re, im}.

const c = (re, im = 0) => ({ re, im });

function cExp(theta) {
  // e^{i*theta}
  return c(Math.cos(theta), Math.sin(theta));
}

function cScale(z, k) {
  return c(z.re * k, z.im * k);
}

function cMul(z, w) {
  return c(z.re * w.re - z.im * w.im, z.re * w.im + z.im * w.re);
}

function cNeg(z) {
  return c(-z.re, -z.im);
}

const SQRT1_2 = Math.SQRT1_2;

const MATRICES = {
  id: () => [[c(1), c(0)], [c(0), c(1)]],
  h: () => [
    [c(SQRT1_2), c(SQRT1_2)],
    [c(SQRT1_2), c(-SQRT1_2)],
  ],
  x: () => [[c(0), c(1)], [c(1), c(0)]],
  y: () => [[c(0), c(0, -1)], [c(0, 1), c(0)]],
  z: () => [[c(1), c(0)], [c(0), c(-1)]],
  s: () => [[c(1), c(0)], [c(0), c(0, 1)]],
  sdg: () => [[c(1), c(0)], [c(0), c(0, -1)]],
  t: () => [[c(1), c(0)], [c(0), cExp(Math.PI / 4)]],
  tdg: () => [[c(1), c(0)], [c(0), cExp(-Math.PI / 4)]],
};

function rx(theta) {
  const ct = Math.cos(theta / 2);
  const st = Math.sin(theta / 2);
  return [[c(ct), c(0, -st)], [c(0, -st), c(ct)]];
}

function ry(theta) {
  const ct = Math.cos(theta / 2);
  const st = Math.sin(theta / 2);
  return [[c(ct), c(-st)], [c(st), c(ct)]];
}

function rz(theta) {
  return [[cExp(-theta / 2), c(0)], [c(0), cExp(theta / 2)]];
}

// Phase gate (u1 in OpenQASM 2.0, p in 3.0).
function p(lambda) {
  return [[c(1), c(0)], [c(0), cExp(lambda)]];
}

function u2(phi, lambda) {
  return [
    [c(SQRT1_2), cScale(cExp(lambda), -SQRT1_2)],
    [cScale(cExp(phi), SQRT1_2), cScale(cExp(phi + lambda), SQRT1_2)],
  ];
}

function u3(theta, phi, lambda) {
  const ct = Math.cos(theta / 2);
  const st = Math.sin(theta / 2);
  return [
    [c(ct), cScale(cExp(lambda), -st)],
    [cScale(cExp(phi), st), cScale(cExp(phi + lambda), ct)],
  ];
}

// Gate table: name -> { params: number, matrix(...params), controlled: boolean }
// 'controlled' gates take exactly one target plus one or more controls.
const GATES = {
  id: { params: 0, targets: 1, controls: 0, matrix: () => MATRICES.id() },
  h: { params: 0, targets: 1, controls: 0, matrix: () => MATRICES.h() },
  x: { params: 0, targets: 1, controls: 0, matrix: () => MATRICES.x() },
  y: { params: 0, targets: 1, controls: 0, matrix: () => MATRICES.y() },
  z: { params: 0, targets: 1, controls: 0, matrix: () => MATRICES.z() },
  s: { params: 0, targets: 1, controls: 0, matrix: () => MATRICES.s() },
  sdg: { params: 0, targets: 1, controls: 0, matrix: () => MATRICES.sdg() },
  t: { params: 0, targets: 1, controls: 0, matrix: () => MATRICES.t() },
  tdg: { params: 0, targets: 1, controls: 0, matrix: () => MATRICES.tdg() },
  rx: { params: 1, targets: 1, controls: 0, matrix: (th) => rx(th) },
  ry: { params: 1, targets: 1, controls: 0, matrix: (th) => ry(th) },
  rz: { params: 1, targets: 1, controls: 0, matrix: (th) => rz(th) },
  p: { params: 1, targets: 1, controls: 0, matrix: (l) => p(l) },
  u1: { params: 1, targets: 1, controls: 0, matrix: (l) => p(l) },
  u2: { params: 2, targets: 1, controls: 0, matrix: (ph, l) => u2(ph, l) },
  u3: { params: 3, targets: 1, controls: 0, matrix: (th, ph, l) => u3(th, ph, l) },
  cx: { params: 0, targets: 1, controls: 1, matrix: () => MATRICES.x() },
  cnot: { params: 0, targets: 1, controls: 1, matrix: () => MATRICES.x(), aliasOf: 'cx' },
  cy: { params: 0, targets: 1, controls: 1, matrix: () => MATRICES.y() },
  cz: { params: 0, targets: 1, controls: 1, matrix: () => MATRICES.z() },
  ch: { params: 0, targets: 1, controls: 1, matrix: () => MATRICES.h() },
  cp: { params: 1, targets: 1, controls: 1, matrix: (l) => p(l) },
  cu1: { params: 1, targets: 1, controls: 1, matrix: (l) => p(l) },
  crx: { params: 1, targets: 1, controls: 1, matrix: (th) => rx(th) },
  cry: { params: 1, targets: 1, controls: 1, matrix: (th) => ry(th) },
  crz: { params: 1, targets: 1, controls: 1, matrix: (th) => rz(th) },
  swap: { params: 0, targets: 2, controls: 0, matrix: null },
  ccx: { params: 0, targets: 1, controls: 2, matrix: () => MATRICES.x() },
};

// Rotation gates whose angle parameter is perturbed by the rotation-error model.
const ROTATION_GATES = new Set(['rx', 'ry', 'rz', 'crx', 'cry', 'crz']);

module.exports = { GATES, ROTATION_GATES, MATRICES, c, cExp, cMul, cNeg, cScale };
