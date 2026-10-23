const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'extension');

const ALLOWED_FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'calculator.js',
  'rate-converter.js',
  'content-scam.css',
  'rate-converter.css',
  'options.css',
  'options.html',
  'options.js',
  'popup.css',
  'popup.html',
  'popup.js',
  'scam-detector.js',
  'scam-engine.js',
  'scam-parsers.js',
  'User_Guide_FreeUp_Calc.pdf',
];

const ALLOWED_DIRS = ['icons'];

function copyFile(rel) {
  const src = path.join(ROOT, rel);
  const dest = path.join(EXT, rel);
  if (!fs.existsSync(src)) {
    console.warn('Missing source file:', rel);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(rel) {
  const src = path.join(ROOT, rel);
  const dest = path.join(EXT, rel);
  if (!fs.existsSync(src)) {
    console.warn('Missing source dir:', rel);
    return;
  }
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}

if (fs.existsSync(EXT)) {
  fs.rmSync(EXT, { recursive: true, force: true });
}
fs.mkdirSync(EXT, { recursive: true });

for (const f of ALLOWED_FILES) copyFile(f);
for (const d of ALLOWED_DIRS) copyDir(d);

console.log('Extension built into', EXT);
