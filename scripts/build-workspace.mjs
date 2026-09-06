// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0
import { cp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const name = process.argv[2];
if (!['contract', 'api'].includes(name)) throw new Error('Expected contract or api workspace.');
const workspace = path.resolve(root, name);
const output = path.resolve(workspace, 'dist');
// Only remove this known workspace's generated dist directory.
if (path.dirname(output) !== workspace || path.dirname(workspace) !== path.resolve(root)) throw new Error('Unsafe build path.');
await rm(output, { recursive: true, force: true });
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { cwd: workspace, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (name === 'contract') {
  await cp(path.join(workspace, 'src', 'managed'), path.join(output, 'managed'), { recursive: true });
  await cp(path.join(workspace, 'src', 'amana.compact'), path.join(output, 'amana.compact'));
} else {
  // API source imports the contract by a relative path; preserve that layout.
  await cp(path.join(root, 'contract', 'src', 'managed'), path.join(output, 'contract', 'src', 'managed'), { recursive: true });
}
