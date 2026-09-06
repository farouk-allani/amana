// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../contract/', import.meta.url));
const args = ['compile', '+0.31.1', ...process.argv.slice(2), 'src/amana.compact', './src/managed/amana'];
let command = 'compact', commandArgs = args;
if (process.platform === 'win32') {
  // Windows compact.exe compresses files. Invoke the WSL compiler without a shell.
  const distro = process.env.AMANA_WSL_DISTRO ?? 'Ubuntu';
  const home = spawnSync('wsl.exe', ['-d', distro, '--exec', 'printenv', 'HOME'], { encoding: 'utf8' });
  if (home.status !== 0 || !home.stdout.trim().startsWith('/')) throw new Error('Cannot locate the WSL user home.');
  command = 'wsl.exe';
  commandArgs = ['-d', distro, '--cd', cwd, '--exec', home.stdout.trim() + '/.local/bin/compact', ...args];
}
const result = spawnSync(command, commandArgs, { cwd, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
