'use strict';

// OpenQASM 2.0 / 3.0 subset parser.
//
// Produces an internal circuit representation (IR):
//   {
//     version: '2.0' | '3.0',
//     numQubits, numClbits,
//     qregs: [{ name, size, offset }],   // global qubit index = offset + local
//     cregs: [{ name, size, offset }],
//     ops: [
//       { kind: 'gate', name, params: [...], controls: [...], targets: [...], line },
//       { kind: 'swap', qubits: [a, b], line },
//       { kind: 'measure', qubit, cbit, line },
//       { kind: 'reset', qubit, line },
//       { kind: 'barrier', qubits: [...], line },
//     ],
//     warnings: [{ message, line }],
//   }
//
// Everything outside the documented subset throws a QasmError with the source
// line number so the caller can report it to the user.

const { GATES } = require('./gates');

class QasmError extends Error {
  constructor(message, line) {
    super(line ? `line ${line}: ${message}` : message);
    this.name = 'QasmError';
    this.line = line || null;
  }
}

// ---------------------------------------------------------------------------
// Angle expressions: numbers, pi, + - * / and parentheses. No eval().
// ---------------------------------------------------------------------------

function tokenizeExpr(text, line) {
  const tokens = [];
  const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|(pi)|([()+\-*/]))/gy;
  let pos = 0;
  while (pos < text.length) {
    re.lastIndex = pos;
    const m = re.exec(text);
    if (!m || m.index !== pos) {
      throw new QasmError(`invalid character in expression "${text}"`, line);
    }
    if (m[1] !== undefined) tokens.push({ type: 'num', value: parseFloat(m[1]) });
    else if (m[2] !== undefined) tokens.push({ type: 'num', value: Math.PI });
    else tokens.push({ type: 'op', value: m[3] });
    pos = re.lastIndex;
  }
  return tokens;
}

function parseExpression(text, line) {
  const tokens = tokenizeExpr(text, line);
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];

  function parsePrimary() {
    const t = eat();
    if (!t) throw new QasmError(`unexpected end of expression "${text}"`, line);
    if (t.type === 'num') return t.value;
    if (t.type === 'op' && t.value === '-') return -parsePrimary();
    if (t.type === 'op' && t.value === '+') return parsePrimary();
    if (t.type === 'op' && t.value === '(') {
      const v = parseAddSub();
      const closing = eat();
      if (!closing || closing.value !== ')') {
        throw new QasmError(`missing ')' in expression "${text}"`, line);
      }
      return v;
    }
    throw new QasmError(`unexpected token in expression "${text}"`, line);
  }
  function parseMulDiv() {
    let v = parsePrimary();
    while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
      const op = eat().value;
      const rhs = parsePrimary();
      v = op === '*' ? v * rhs : v / rhs;
    }
    return v;
  }
  function parseAddSub() {
    let v = parseMulDiv();
    while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = eat().value;
      const rhs = parseMulDiv();
      v = op === '+' ? v + rhs : v - rhs;
    }
    return v;
  }

  const value = parseAddSub();
  if (pos !== tokens.length) {
    throw new QasmError(`trailing tokens in expression "${text}"`, line);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Statement splitting: OpenQASM statements end with ';'. Line numbers follow
// the source so diagnostics can point at the offending line.
// ---------------------------------------------------------------------------

function splitStatements(source) {
  const statements = [];
  let buf = '';
  let line = 1;
  let startLine = 1;
  let inString = false;
  let braceDepth = 0; // gate bodies group their ';'-terminated inner statements
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    // Line comments (// ...) run to end of line. QASM has no block comments in
    // the supported subset; treat /* as an error below via the parser.
    if (!inString && ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (!inString && ch === '{') braceDepth++;
    if (!inString && ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      // A closed brace block (e.g. a gate body) terminates its statement.
      if (braceDepth === 0) {
        buf += ch;
        const text = buf.trim();
        if (text !== '') statements.push({ text, line: startLine });
        buf = '';
        i++;
        continue;
      }
    }
    if (buf.trim() === '' && !/\s/.test(ch)) startLine = line;
    if (ch === ';' && !inString && braceDepth === 0) {
      const text = buf.trim();
      if (text !== '') statements.push({ text, line: startLine });
      buf = '';
      i++;
      continue;
    }
    buf += ch;
    if (ch === '\n') line++;
    i++;
  }
  if (buf.trim() !== '') {
    throw new QasmError(`missing ';' after "${buf.trim().slice(0, 60)}"`, startLine);
  }
  return statements;
}

// ---------------------------------------------------------------------------
// Register bookkeeping
// ---------------------------------------------------------------------------

class Registers {
  constructor() {
    this.qregs = [];
    this.cregs = [];
    this.qubitCount = 0;
    this.clbitCount = 0;
  }

  declare(list, name, size, line) {
    if (list.some((r) => r.name === name)) {
      throw new QasmError(`register "${name}" is declared more than once`, line);
    }
    if (!Number.isInteger(size) || size < 1) {
      throw new QasmError(`register "${name}" size must be a positive integer, got ${size}`, line);
    }
    const offset = list === this.qregs ? this.qubitCount : this.clbitCount;
    list.push({ name, size, offset });
    if (list === this.qregs) this.qubitCount += size;
    else this.clbitCount += size;
  }

  _resolve(list, ref, line, kind) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[(\d+)\])?$/.exec(ref.trim());
    if (!m) throw new QasmError(`invalid ${kind} reference "${ref}"`, line);
    const reg = list.find((r) => r.name === m[1]);
    if (!reg) throw new QasmError(`unknown ${kind} register "${m[1]}"`, line);
    if (m[2] === undefined) {
      // Whole-register reference: returns every element.
      return Array.from({ length: reg.size }, (_, i) => reg.offset + i);
    }
    const idx = parseInt(m[2], 10);
    if (idx >= reg.size) {
      throw new QasmError(
        `index ${idx} out of range for ${kind} register "${reg.name}" (size ${reg.size})`,
        line,
      );
    }
    return [reg.offset + idx];
  }

  qubits(ref, line) {
    return this._resolve(this.qregs, ref, line, 'qubit');
  }

  clbits(ref, line) {
    return this._resolve(this.cregs, ref, line, 'classical bit');
  }
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const IDENT = '[A-Za-z_][A-Za-z0-9_]*';

function parseQasm(source) {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new QasmError('QASM source must be a non-empty string');
  }
  const statements = splitStatements(source);
  if (statements.length === 0) throw new QasmError('no statements found in source');

  const header = /^OPENQASM\s+(\d+(?:\.\d+)?)$/i.exec(statements[0].text);
  if (!header) {
    throw new QasmError(
      `first statement must be an OPENQASM version header, got "${statements[0].text}"`,
      statements[0].line,
    );
  }
  const major = header[1].split('.')[0];
  const version = major === '2' ? '2.0' : major === '3' ? '3.0' : null;
  if (!version) {
    throw new QasmError(`unsupported OpenQASM version "${header[1]}" (supported: 2.0, 3.0)`, statements[0].line);
  }

  const regs = new Registers();
  const ops = [];
  const warnings = [];

  for (const { text, line } of statements.slice(1)) {
    // include "..." - the standard libraries are built in.
    let m = /^include\s+"([^"]+)"$/.exec(text);
    if (m) {
      const lib = m[1];
      if (lib !== 'qelib1.inc' && lib !== 'stdgates.inc') {
        warnings.push({
          line,
          message: `include "${lib}" ignored; only the built-in standard gate set is available`,
        });
      }
      continue;
    }

    // Register declarations.
    m = new RegExp(`^qreg\\s+(${IDENT})\\[(\\d+)\\]$`).exec(text);
    if (m) {
      if (version !== '2.0') throw new QasmError('qreg is OpenQASM 2.0 syntax; use "qubit[n] name" in 3.0', line);
      regs.declare(regs.qregs, m[1], parseInt(m[2], 10), line);
      continue;
    }
    m = new RegExp(`^creg\\s+(${IDENT})\\[(\\d+)\\]$`).exec(text);
    if (m) {
      if (version !== '2.0') throw new QasmError('creg is OpenQASM 2.0 syntax; use "bit[n] name" in 3.0', line);
      regs.declare(regs.cregs, m[1], parseInt(m[2], 10), line);
      continue;
    }
    m = new RegExp(`^qubit(?:\\[(\\d+)\\])?\\s+(${IDENT})$`).exec(text);
    if (m) {
      if (version !== '3.0') throw new QasmError('qubit declarations are OpenQASM 3.0 syntax; use qreg in 2.0', line);
      regs.declare(regs.qregs, m[2], m[1] === undefined ? 1 : parseInt(m[1], 10), line);
      continue;
    }
    m = new RegExp(`^bit(?:\\[(\\d+)\\])?\\s+(${IDENT})$`).exec(text);
    if (m) {
      if (version !== '3.0') throw new QasmError('bit declarations are OpenQASM 3.0 syntax; use creg in 2.0', line);
      regs.declare(regs.cregs, m[2], m[1] === undefined ? 1 : parseInt(m[1], 10), line);
      continue;
    }

    // measure: v2 "measure a -> b", v3 "b = measure a" (v3 also allows the arrow form).
    m = new RegExp(`^measure\\s+(.+?)\\s*->\\s*(.+)$`).exec(text);
    let measureFrom = null;
    let measureTo = null;
    if (m) {
      measureFrom = m[1];
      measureTo = m[2];
    } else {
      m = new RegExp(`^(.+?)\\s*=\\s*measure\\s+(.+)$`).exec(text);
      if (m) {
        if (version !== '3.0') {
          throw new QasmError('"c = measure q" assignment is OpenQASM 3.0 syntax; use "measure q -> c" in 2.0', line);
        }
        measureTo = m[1];
        measureFrom = m[2];
      }
    }
    if (measureFrom !== null) {
      const qs = regs.qubits(measureFrom, line);
      const cs = regs.clbits(measureTo, line);
      if (qs.length !== cs.length) {
        throw new QasmError(
          `measure maps ${qs.length} qubit(s) to ${cs.length} classical bit(s); sizes must match`,
          line,
        );
      }
      qs.forEach((q, i) => ops.push({ kind: 'measure', qubit: q, cbit: cs[i], line }));
      continue;
    }

    // reset
    m = /^reset\s+(.+)$/.exec(text);
    if (m) {
      for (const q of regs.qubits(m[1], line)) ops.push({ kind: 'reset', qubit: q, line });
      continue;
    }

    // barrier (no-op for simulation; recorded as a warning)
    m = /^barrier\s+(.+)$/.exec(text);
    if (m) {
      const qs = m[1].split(',').flatMap((part) => regs.qubits(part, line));
      ops.push({ kind: 'barrier', qubits: qs, line });
      warnings.push({ line, message: 'barrier has no effect in this simulator (no scheduling or optimization passes)' });
      continue;
    }

    // Explicitly rejected constructs, with clear diagnostics.
    if (/^(gate|opaque)\b/.test(text)) {
      throw new QasmError(
        'custom gate definitions (gate/opaque) are not supported; use the built-in gate set',
        line,
      );
    }
    if (/^(if|for|while|switch|box|delay)\b/.test(text)) {
      throw new QasmError(`classical control flow ("${text.split(/\s|\(/)[0]}") is not supported`, line);
    }

    // Gate application: name[(params)] operand,operand,...
    m = new RegExp(`^(${IDENT})(?:\\((.+)\\))?\\s+(.+)$`).exec(text);
    if (m) {
      const name = m[1];
      const spec = GATES[name];
      if (!spec) {
        throw new QasmError(`unknown or unsupported gate "${name}"`, line);
      }
      const params = m[2] === undefined ? [] : splitTopLevel(m[2]).map((e) => parseExpression(e, line));
      if (params.length !== spec.params) {
        throw new QasmError(`gate "${name}" takes ${spec.params} parameter(s), got ${params.length}`, line);
      }
      const operandLists = m[3].split(',').map((part) => regs.qubits(part, line));
      const arity = spec.targets + spec.controls;
      if (operandLists.length !== arity) {
        throw new QasmError(`gate "${name}" takes ${arity} operand(s), got ${operandLists.length}`, line);
      }
      // Whole-register operands broadcast elementwise when every register
      // operand has the same size (or the gate is single-operand).
      const sizes = operandLists.map((l) => l.length);
      const width = Math.max(...sizes);
      if (!sizes.every((s) => s === 1 || s === width)) {
        throw new QasmError(`register operands of "${name}" have mismatched sizes`, line);
      }
      if (width > 1 && sizes.some((s) => s !== width) && arity > 1) {
        throw new QasmError(
          `cannot broadcast mixed indexed and register operands for "${name}"`,
          line,
        );
      }
      for (let w = 0; w < width; w++) {
        const flat = operandLists.map((l) => l[l.length === 1 ? 0 : w]);
        if (new Set(flat).size !== flat.length) {
          throw new QasmError(`gate "${name}" has duplicate qubit operands`, line);
        }
        if (spec.targets === 2) {
          ops.push({ kind: 'swap', qubits: flat, line });
        } else {
          ops.push({
            kind: 'gate',
            name: spec.aliasOf || name,
            params,
            controls: flat.slice(0, spec.controls),
            targets: flat.slice(spec.controls),
            line,
          });
        }
      }
      continue;
    }

    throw new QasmError(`unsupported or malformed statement "${text.slice(0, 80)}"`, line);
  }

  if (regs.qubitCount === 0) throw new QasmError('no quantum register declared');

  return {
    version,
    numQubits: regs.qubitCount,
    numClbits: regs.clbitCount,
    qregs: regs.qregs,
    cregs: regs.cregs,
    ops,
    warnings,
  };
}

// Split "a, b, c" at top level (commas inside parentheses are kept together).
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim() !== '') parts.push(cur.trim());
  return parts;
}

module.exports = { parseQasm, QasmError, parseExpression };
