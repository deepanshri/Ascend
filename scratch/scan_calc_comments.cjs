const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../src');

function walk(dir) {
  let list = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) list = list.concat(walk(full));
    else if (/\.(ts|tsx)$/.test(item.name)) list.push(full);
  }
  return list;
}

const files = walk(srcDir);
const results = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      if (/(weight|decay|streak|score|percent|formula|1\.5|1\.0|0\.5|0\.7|100|80%)/i.test(trimmed)) {
        // Collect comment + next 5 lines
        const context = lines.slice(idx, Math.min(lines.length, idx + 8)).join('\n');
        results.push({
          file: path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/'),
          line: idx + 1,
          comment: trimmed,
          context
        });
      }
    }
  });
}

console.log(`Found ${results.length} comment lines referencing calculation rules.`);
// Filter interesting ones
const keyFindings = results.filter(r => 
  /weight|decay|multiplier|reversal|observation|streak|purge|formula/i.test(r.comment)
);

console.log(`Key calculation comments: ${keyFindings.length}`);
keyFindings.slice(0, 30).forEach(k => {
  console.log(`\n--- ${k.file}:${k.line} ---\n${k.comment}`);
});
