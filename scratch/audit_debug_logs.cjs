const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const dirsToScan = ['src', 'public', 'android', 'scripts'];
const rootFiles = fs.readdirSync(rootDir).filter(f => {
  const full = path.join(rootDir, f);
  return fs.statSync(full).isFile() && !f.startsWith('.git') && !f.endsWith('.lock') && f !== 'package-lock.json';
});

const ignoreDirs = ['node_modules', '.git', 'dist', 'scratch', '.agents', '.tools', '.vscode', 'build', '.gradle', 'intermediates', 'generated', 'outputs', 'tmp'];

function walk(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoreDirs.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, fileList);
    } else if (entry.isFile()) {
      fileList.push(full);
    }
  }
  return fileList;
}

let allFiles = [];
for (const d of dirsToScan) {
  const p = path.join(rootDir, d);
  if (fs.existsSync(p)) {
    walk(p, allFiles);
  }
}
for (const rf of rootFiles) {
  allFiles.push(path.join(rootDir, rf));
}

const consoleRegex = /console\.(log|warn|error|info|debug|trace)\s*\(/g;

const findings = [];
let totalLog = 0;
let totalWarn = 0;
let totalError = 0;
let totalOther = 0;

for (const file of allFiles) {
  // skip binary files by extension
  if (/\.(png|jpg|jpeg|gif|glb|ico|webp|svg|apk|jar|keystore|so|aar|zip|lock)$/i.test(file)) continue;

  try {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      let match;
      while ((match = consoleRegex.exec(line)) !== null) {
        const type = match[1];
        if (type === 'log') totalLog++;
        else if (type === 'warn') totalWarn++;
        else if (type === 'error') totalError++;
        else totalOther++;

        findings.push({
          file: path.relative(rootDir, file).replace(/\\/g, '/'),
          line: idx + 1,
          type: `console.${type}`,
          snippet: line.trim()
        });
      }
    });
  } catch (err) {
    // binary or unreadable
  }
}

fs.writeFileSync(
  path.join(__dirname, 'debug_logs_output.json'),
  JSON.stringify({
    counts: {
      log: totalLog,
      warn: totalWarn,
      error: totalError,
      other: totalOther,
      total: totalLog + totalWarn + totalError + totalOther
    },
    findings
  }, null, 2),
  'utf-8'
);
console.log(`Audited ${allFiles.length} files. Total console statements: ${totalLog + totalWarn + totalError + totalOther}`);
