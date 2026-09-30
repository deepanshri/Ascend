const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const dirs = ['src', 'public', 'android', 'scripts'];
const ignoreDirs = ['node_modules', '.git', 'dist', 'scratch', '.agents', '.tools', '.vscode', 'build', '.gradle', 'intermediates'];

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    if (ignoreDirs.includes(item.name)) continue;
    const p = path.join(dir, item.name);
    if (item.isDirectory()) results = results.concat(walk(p));
    else if (/\.(tsx?|jsx?|html|css|gradle|json|ts)$/.test(item.name)) results.push(p);
  }
  return results;
}

let allFiles = [];
dirs.forEach(d => {
  const p = path.join(rootDir, d);
  if (fs.existsSync(p)) allFiles = allFiles.concat(walk(p));
});
['index.html', 'vite.config.ts', 'capacitor.config.ts', 'tailwind.config.js'].forEach(f => {
  const p = path.join(rootDir, f);
  if (fs.existsSync(p)) allFiles.push(p);
});

console.log(`Checking ${allFiles.length} files for commented-out code or blocks...`);

for (const f of allFiles) {
  const rel = path.relative(rootDir, f).replace(/\\/g, '/');
  const content = fs.readFileSync(f, 'utf-8');
  
  // Check for HTML comment blocks <!-- ... -->
  const htmlComments = content.match(/<!--[\s\S]*?-->/g);
  if (htmlComments) {
    for (const hc of htmlComments) {
      const lc = hc.split('\n').length;
      if (lc >= 3) {
        console.log(`HTML Comment in ${rel} (${lc} lines):`, hc.slice(0, 100).replace(/\n/g, ' '));
      }
    }
  }

  // Check for block comments with code
  const blockComments = content.match(/\/\*[\s\S]*?\*\//g);
  if (blockComments) {
    for (const bc of blockComments) {
      const lines = bc.split('\n');
      if (lines.length >= 5) {
        // Does it contain code? (e.g., semicolons, braces, var/let/const, tags)
        const codeLines = lines.filter(l => /[;{}]/.test(l) && !l.includes('*/') && !l.includes('/*') && !/@param|@returns|@type/.test(l));
        if (codeLines.length >= 3) {
          console.log(`Code-like block comment in ${rel} (${lines.length} lines, ${codeLines.length} code-like):`);
          console.log(lines.slice(0, 5).join('\n'));
          console.log('---');
        }
      }
    }
  }
}
