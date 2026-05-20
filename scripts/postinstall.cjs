#!/usr/bin/env node
// Ensures the correct prebuilt better-sqlite3 binary is present.
// On Alpine Linux (musl libc), the prebuild-install step uses the wrong binary
// and native compilation fails (no cc1plus). This script detects that scenario
// and downloads the linuxmusl prebuilt from the GitHub release.
'use strict';
const { execSync, spawnSync } = require('child_process');
const { existsSync, mkdirSync, copyFileSync, rmSync } = require('fs');
const { join } = require('path');
const os = require('os');

try {
  require('better-sqlite3');
  // Already working — nothing to do.
  process.exit(0);
} catch {
  // Fall through to repair.
}

const isMusl = (() => {
  try {
    const ldd = spawnSync('ldd', ['--version'], { encoding: 'utf8' });
    return (ldd.stdout + ldd.stderr).toLowerCase().includes('musl');
  } catch {
    return false;
  }
})();

if (!isMusl) {
  console.warn('[postinstall] better-sqlite3 failed to load and libc is not musl — skipping repair');
  process.exit(0);
}

const pkg = require('./node_modules/better-sqlite3/package.json');
const nodeAbi = process.versions.modules;
const arch = process.arch;
const version = pkg.version;
const filename = `better-sqlite3-v${version}-node-v${nodeAbi}-linuxmusl-${arch}.tar.gz`;
const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${version}/${filename}`;
const dest = join(require.resolve('better-sqlite3'), '../../build/Release');

console.log(`[postinstall] downloading musl prebuilt: ${filename}`);

const tmp = join(os.tmpdir(), `bsqlite3-${Date.now()}`);
mkdirSync(tmp, { recursive: true });
const archive = join(tmp, filename);

try {
  execSync(`curl -sfL "${url}" -o "${archive}"`, { stdio: 'inherit' });
  execSync(`tar -xzf "${archive}" -C "${tmp}"`, { stdio: 'inherit' });
  mkdirSync(dest, { recursive: true });
  copyFileSync(join(tmp, 'build/Release/better_sqlite3.node'), join(dest, 'better_sqlite3.node'));
  console.log('[postinstall] better-sqlite3 musl binary installed successfully');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
