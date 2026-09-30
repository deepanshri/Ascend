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
const matches = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    // Look for success messages, alerts, setSuccess, showBanner, etc.
    if (/(setSuccess|successMessage|isSuccess|showToast|alert\(|notify\(|Success!|saved successfully|updated successfully)/i.test(line)) {
      matches.push({
        file: path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/'),
        line: idx + 1,
        snippet: line.trim()
      });
    }
  });
}

console.log(`Found ${matches.length} status/success/alert triggers:`);
matches.forEach(m => console.log(`${m.file}:${m.line} - ${m.snippet}`));
