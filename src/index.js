'use strict';

// QC-C3-01 - JavaScript-based OpenQASM quantum circuit simulator with
// configurable noise. Public API entry point.

const { simulate, SimulationError } = require('./simulator');
const { parseQasm, QasmError } = require('./parser');
const { NoiseConfigError } = require('./noise');
const { StateVector } = require('./statevector');

module.exports = {
  simulate,
  parseQasm,
  StateVector,
  SimulationError,
  QasmError,
  NoiseConfigError,
};
