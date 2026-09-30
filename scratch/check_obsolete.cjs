const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..', 'src');
const keywords = [
  'flutter', 'dart', 'reminders_screen', 'TODO', 'FIXME', 'HACK', 'XXX',
  'DEPRECATED', 'WORKAROUND', 'TEMP', 'MOCK', 'PLACEHOLDER', 'STUB', 'OBSOLETE'
];

function walk(dir) {
  let res = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) res = res.concat(walk(full));
    else if (/\.(tsx?|jsx?)$/.test(item.name)) res.push(full);
  }
  return res;
}

const files = walk(srcDir);
const matches = [];

for (const file of files) {
  const rel = path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/');
  const lines = fs.readFileSync(file, 'utf-8').split('\n');
  lines.forEach((line, i) => {
    for (const kw of keywords) {
      const reg = new RegExp(`\\b${kw}\\b`, 'i');
      if (reg.test(line)) {
        matches.push({
          file: rel,
          line: i + 1,
          keyword: kw,
          snippet: line.trim()
        });
        break;
      }
    }
  });
}

console.log(`Found ${matches.length} keyword matches in comments/code:`);
matches.forEach(m => console.log(`${m.file}:${m.line} [${m.keyword}] ${m.snippet}`));
