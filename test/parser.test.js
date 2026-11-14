'use strict';

// Parser tests: accepted subset, version gating, and diagnostics with line
// numbers for malformed or unsupported input.

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseQasm, QasmError } = require('../src');

test('rejects empty or non-string source', () => {
  assert.throws(() => parseQasm(''), QasmError);
  assert.throws(() => parseQasm('   \n // only a comment\n'), QasmError);
  assert.throws(() => parseQasm(42), QasmError);
});

test('rejects a missing version header', () => {
  assert.throws(() => parseQasm('qreg q[2];'), /version header/);
});

test('rejects unsupported major versions', () => {
  assert.throws(() => parseQasm('OPENQASM 4.0;\nqreg q[1];'), /unsupported OpenQASM version/);
});

test('a missing semicolon merges lines into one statement, which is rejected with its line', () => {
  try {
    parseQasm('OPENQASM 2.0;\nqreg q[2]\nh q[0];');
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err instanceof QasmError);
    assert.equal(err.line, 2);
    assert.match(err.message, /unsupported or malformed statement/);
  }
});

test('unknown gate names are parse errors with the line number', () => {
  try {
    parseQasm('OPENQASM 2.0;\nqreg q[2];\nh q[0];\nfoo q[1];');
    assert.fail('should have thrown');
  } catch (err) {
    assert.match(err.message, /unknown or unsupported gate "foo"/);
    assert.equal(err.line, 4);
  }
});

test('custom gate definitions are explicitly rejected', () => {
  assert.throws(
    () => parseQasm('OPENQASM 2.0;\nqreg q[1];\ngate mygate a { x a; }'),
    /custom gate definitions.*not supported/,
  );
});

test('classical control flow is explicitly rejected', () => {
  assert.throws(
    () => parseQasm('OPENQASM 2.0;\nqreg q[1];\ncreg c[1];\nif(c==1) x q[0];'),
    /control flow.*not supported/,
  );
});

test('version gating: qreg in 3.0 and qubit in 2.0 are errors', () => {
  assert.throws(() => parseQasm('OPENQASM 3;\nqreg q[1];'), /2\.0 syntax/);
  assert.throws(() => parseQasm('OPENQASM 2.0;\nqubit[1] q;'), /3\.0 syntax/);
});

test('duplicate register declarations are rejected', () => {
  assert.throws(() => parseQasm('OPENQASM 2.0;\nqreg q[1];\nqreg q[2];'), /declared more than once/);
});

test('out-of-range qubit index is rejected', () => {
  assert.throws(() => parseQasm('OPENQASM 2.0;\nqreg q[2];\nx q[2];'), /out of range/);
});

test('duplicate gate operands are rejected', () => {
  assert.throws(() => parseQasm('OPENQASM 2.0;\nqreg q[2];\ncx q[0],q[0];'), /duplicate qubit operands/);
});

test('wrong parameter arity is rejected', () => {
  assert.throws(() => parseQasm('OPENQASM 2.0;\nqreg q[1];\nrx q[0];'), /takes 1 parameter/);
  assert.throws(() => parseQasm('OPENQASM 2.0;\nqreg q[1];\nu3(pi/2,0) q[0];'), /takes 3 parameter/);
});

test('angle expressions: pi arithmetic, unary minus, parentheses', () => {
  const c = parseQasm('OPENQASM 2.0;\nqreg q[1];\nrx(pi/2 + 3*pi/4) q[0];\nry(-(pi)) q[0];\nrz(2*(pi/4)) q[0];');
  assert.ok(Math.abs(c.ops[0].params[0] - (Math.PI / 2 + (3 * Math.PI) / 4)) < 1e-12);
  assert.ok(Math.abs(c.ops[1].params[0] + Math.PI) < 1e-12);
  assert.ok(Math.abs(c.ops[2].params[0] - Math.PI / 2) < 1e-12);
});

test('invalid angle expressions are rejected', () => {
  assert.throws(() => parseQasm('OPENQASM 2.0;\nqreg q[1];\nrx(theta) q[0];'), QasmError);
  assert.throws(() => parseQasm('OPENQASM 2.0;\nqreg q[1];\nrx(pi/) q[0];'), QasmError);
});

test('comments are stripped; trailing comment text cannot hide statements', () => {
  const c = parseQasm('OPENQASM 2.0; // header\n// a full-line comment\nqreg q[1]; // reg\nx q[0];');
  assert.equal(c.numQubits, 1);
  assert.equal(c.ops.length, 1);
});

test('no quantum register declared is an error', () => {
  assert.throws(() => parseQasm('OPENQASM 2.0;\ncreg c[1];'), /no quantum register/);
});

test('measure size mismatch is rejected', () => {
  assert.throws(
    () => parseQasm('OPENQASM 2.0;\nqreg q[2];\ncreg c[1];\nmeasure q -> c;'),
    /sizes must match/,
  );
});

test('whole-register measure expands elementwise', () => {
  const c = parseQasm('OPENQASM 2.0;\nqreg q[2];\ncreg c[2];\nmeasure q -> c;');
  const measures = c.ops.filter((o) => o.kind === 'measure');
  assert.equal(measures.length, 2);
  assert.deepEqual(measures.map((m) => [m.qubit, m.cbit]), [[0, 0], [1, 1]]);
});

test('barrier parses to a no-op with a warning', () => {
  const c = parseQasm('OPENQASM 2.0;\nqreg q[2];\nbarrier q[0],q[1];');
  assert.equal(c.ops[0].kind, 'barrier');
  assert.equal(c.warnings.length, 1);
  assert.match(c.warnings[0].message, /no effect/);
});

test('OPENQASM 3.0 spelled with minor version is accepted', () => {
  const c = parseQasm('OPENQASM 3.0;\nqubit q;\nx q;');
  assert.equal(c.version, '3.0');
  assert.equal(c.numQubits, 1);
});
