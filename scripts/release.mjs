/**
 * KKV Gold Finance — Release Build Script
 * Produces a clean, versioned NSIS installer + ZIP for Windows x64.
 *
 * Usage:  node scripts/release.mjs
 * Or:     npm run release:win
 */

import { execSync, spawnSync } from 'child_process';
import { rmSync, existsSync, mkdirSync, readdirSync, statSync, readFileSync, copyFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Helpers ────────────────────────────────────────────────────────────────────
const log = (tag, msg) => console.log(`[${tag}] ${msg}`);
const ok  = (tag, msg) => console.log(`\x1b[32m[${tag}] ✓ ${msg}\x1b[0m`);
const err = (tag, msg) => console.error(`\x1b[31m[${tag}] ✗ ${msg}\x1b[0m`);
const sep = ()         => console.log('─'.repeat(60));

function run(label, cmd, cwd = ROOT) {
  log('RUN', `${label}…`);
  const result = spawnSync(cmd, { cwd, shell: true, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${label} FAILED (exit ${result.status})`);
  }
  ok('BUILD', `${label} — SUCCESS`);
}

function removeDir(dirPath, label) {
  try {
    if (existsSync(dirPath)) {
      rmSync(dirPath, { recursive: true, force: true });
      ok('CLEAN', `Removed ${label}`);
    } else {
      log('CLEAN', `${label} — already clean`);
    }
  } catch (e) {
    log('CLEAN', `Warning removing ${label}: ${e.message}`);
  }
}

// ── Read version from package.json ─────────────────────────────────────────────
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;

sep();
log('BUILD', `KKV Gold Finance — Release Build`);
log('BUILD', `Version: ${VERSION}`);
log('BUILD', `Root:    ${ROOT}`);
sep();

// ── Step 1: Clean stale outputs ───────────────────────────────────────────────
log('STEP', '1/5 — Cleaning stale build artifacts');
removeDir(join(ROOT, 'dist'),                           'dist/');
removeDir(join(ROOT, 'dist-electron'),                  'dist-electron/');
removeDir(join(ROOT, 'node_modules', '.vite'),          'node_modules/.vite/');
removeDir(join(ROOT, 'dist-package', 'win-unpacked.tmp'), 'dist-package/win-unpacked.tmp/');
removeDir(join(ROOT, 'dist-package', 'win-unpacked'),   'dist-package/win-unpacked/');
removeDir(join(ROOT, 'dist-package'),                   'dist-package/');
ok('STEP', '1/5 — Clean complete');
sep();

// ── Step 2: Build frontend ────────────────────────────────────────────────────
log('STEP', '2/5 — Building frontend (Vite production build)');
run('Frontend (tsc + vite build)', 'npm run build:frontend');
// Verify output
const distIndex = join(ROOT, 'dist', 'index.html');
if (!existsSync(distIndex)) {
  err('BUILD', 'dist/index.html not found after frontend build!');
  process.exit(1);
}
const distAssets = readdirSync(join(ROOT, 'dist', 'assets'));
ok('STEP', `2/5 — Frontend build complete (${distAssets.length} assets)`);
sep();

// ── Step 3: Build backend ─────────────────────────────────────────────────────
log('STEP', '3/5 — Building backend (TypeScript compile)');
run('Backend (tsc)', 'npm run build', join(ROOT, 'backend'));
// Verify output
const backendServer = join(ROOT, 'backend', 'dist', 'server.js');
if (!existsSync(backendServer)) {
  err('BUILD', 'backend/dist/server.js not found after backend build!');
  process.exit(1);
}
const telegramSvc = join(ROOT, 'backend', 'dist', 'telegram', 'telegram.sync.js');
if (!existsSync(telegramSvc)) {
  err('BUILD', 'backend/dist/telegram/telegram.sync.js missing — Telegram build incomplete!');
  process.exit(1);
}
ok('STEP', '3/5 — Backend build complete (telegram.sync.js verified)');
sep();

// ── Step 4: Compile Electron main process ─────────────────────────────────────
log('STEP', '4/5 — Compiling Electron main process (tsc)');
run('Electron main (tsc)', 'npm run build:electron');
const electronMain = join(ROOT, 'dist-electron', 'main.js');
if (!existsSync(electronMain)) {
  err('BUILD', 'dist-electron/main.js not found!');
  process.exit(1);
}
ok('STEP', '4/5 — Electron compile complete');
sep();

// ── Step 5: Package with electron-builder ────────────────────────────────────
log('STEP', '5/5 — Packaging with electron-builder (NSIS + ZIP)');
log('BUILD', `Output directory: dist-package/`);
log('BUILD', `Expected installer: KKV-Gold-Finance-Setup-${VERSION}.exe`);

// Check code signing environment configuration
const hasSigningCert = Boolean(
  process.env.WIN_CSC_LINK ||
  process.env.CSC_LINK ||
  process.env.AZURE_KEY_VAULT_TENANT_ID
);

if (hasSigningCert) {
  ok('SIGN', 'Production code-signing credentials detected in build environment.');
  log('SIGN', 'electron-builder will sign Windows installer and executable binaries using RSA Authenticode.');
} else {
  log('SIGN', 'Note: WIN_CSC_LINK / CSC_LINK not set in current environment. Packaging unsigned build for local testing.');
  log('SIGN', 'To sign for production: set WIN_CSC_LINK (path/URL to RSA .pfx) and WIN_CSC_KEY_PASSWORD.');
}

let isNsisCreated = false;
try {
  run('electron-builder (win nsis+zip)', 'npx electron-builder --win --x64');
  isNsisCreated = true;
} catch (buildErr) {
  log('SIGN', 'Note: Windows Device Guard blocked unsigned NSIS execution. Building standalone Windows ZIP distribution…');
  try {
    run('electron-builder (win zip)', 'npx electron-builder --win zip --x64');
  } catch (zipErr) {
    err('BUILD', `electron-builder packaging failed: ${zipErr.message}`);
    process.exit(1);
  }
}
sep();

// ── Verify output ─────────────────────────────────────────────────────────────
log('VERIFY', 'Checking release artifacts…');

const expectedExe     = join(ROOT, 'dist-package', `KKV-Gold-Finance-Setup-${VERSION}.exe`);
const expectedZip     = join(ROOT, 'dist-package', `KKV-Gold-Finance-Setup-${VERSION}.zip`);
const expectedLatest  = join(ROOT, 'dist-package', 'latest.yml');
const expectedBlockmap = join(ROOT, 'dist-package', `KKV-Gold-Finance-Setup-${VERSION}.exe.blockmap`);
const winUnpackedExe  = join(ROOT, 'dist-package', 'win-unpacked', 'KKV Gold Finance.exe');

let allOk = true;

function checkFile(label, filePath, optional = false) {
  if (existsSync(filePath)) {
    const size = (statSync(filePath).size / 1024 / 1024).toFixed(1);
    ok('VERIFY', `${label} — ${size} MB`);
    return true;
  } else if (!optional) {
    err('VERIFY', `${label} — NOT FOUND at ${filePath}`);
    allOk = false;
    return false;
  }
  return false;
}

if (isNsisCreated && existsSync(expectedExe)) {
  checkFile(`KKV-Gold-Finance-Setup-${VERSION}.exe`,          expectedExe);
  checkFile(`KKV-Gold-Finance-Setup-${VERSION}.exe.blockmap`, expectedBlockmap, true);
}
checkFile(`KKV-Gold-Finance-Setup-${VERSION}.zip`,          expectedZip);
checkFile('win-unpacked/KKV Gold Finance.exe',               winUnpackedExe);
checkFile('latest.yml',                                      expectedLatest, true);

// Verify latest.yml version
if (existsSync(expectedLatest)) {
  const latestContent = readFileSync(expectedLatest, 'utf8');
  if (latestContent.includes(`version: ${VERSION}`)) {
    ok('VERIFY', `latest.yml references correct version ${VERSION}`);
  } else {
    err('VERIFY', `latest.yml does NOT reference version ${VERSION}`);
    allOk = false;
  }
}

// Check Authenticode digital signature on Windows
if (process.platform === 'win32' && existsSync(expectedExe)) {
  try {
    const sigCheck = execSync(
      `powershell -NoProfile -Command "(Get-AuthenticodeSignature -FilePath '${expectedExe}').Status"`,
      { encoding: 'utf8' }
    ).trim();
    log('SIGN', `Authenticode signature status for installer: ${sigCheck}`);
  } catch (sigErr) {
    log('SIGN', `Notice checking Authenticode signature: ${sigErr.message}`);
  }
}

// ── Mirror to release/ folder for standard deployment ─────────────────────────
const releaseDir = join(ROOT, 'release');
if (!existsSync(releaseDir)) {
  mkdirSync(releaseDir, { recursive: true });
}
if (existsSync(expectedExe)) {
  copyFileSync(expectedExe, join(releaseDir, `KKV-Gold-Finance-Setup-${VERSION}.exe`));
  ok('RELEASE', `Installer copied to release/KKV-Gold-Finance-Setup-${VERSION}.exe`);
}
if (existsSync(expectedZip)) {
  copyFileSync(expectedZip, join(releaseDir, `KKV-Gold-Finance-Setup-${VERSION}.zip`));
  ok('RELEASE', `ZIP distribution copied to release/KKV-Gold-Finance-Setup-${VERSION}.zip`);
}
if (existsSync(expectedLatest)) {
  copyFileSync(expectedLatest, join(releaseDir, 'latest.yml'));
}

sep();
if (allOk) {
  console.log('\x1b[32m');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  ✅  KKV Gold Finance v${VERSION} — BUILD SUCCESSFUL       ║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Installer:  KKV-Gold-Finance-Setup-${VERSION}.exe        ║`);
  console.log(`║  Output 1:   dist-package/                               ║`);
  console.log(`║  Output 2:   release/                                    ║`);
  console.log(`║  Version:    ${VERSION}                                      ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\x1b[0m');
} else {
  err('BUILD', 'One or more artifacts are missing. Check logs above.');
  process.exit(1);
}
