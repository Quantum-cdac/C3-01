// Rotations and controlled rotations (OpenQASM 2.0).
OPENQASM 2.0;
include "qelib1.inc";
qreg q[2];
creg c[2];
rx(pi/3) q[0];
ry(-pi/4) q[1];
crz(pi/6) q[0],q[1];
cp(pi/8) q[1],q[0];
measure q -> c;
