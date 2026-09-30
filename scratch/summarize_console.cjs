const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'debug_logs_output.json'), 'utf-8'));

console.log('--- CONSOLE COUNTS ---');
console.log(data.counts);

// Group by file
const byFile = {};
for (const f of data.findings) {
  if (!byFile[f.file]) {
    byFile[f.file] = { log: 0, warn: 0, error: 0, other: 0, total: 0, items: [] };
  }
  const type = f.type.replace('console.', '');
  byFile[f.file][type] = (byFile[f.file][type] || 0) + 1;
  byFile[f.file].total++;
  byFile[f.file].items.push({ line: f.line, type: f.type, snippet: f.snippet });
}

const sortedFiles = Object.entries(byFile).sort((a, b) => b[1].total - a[1].total);

console.log('\n--- TOP FILES BY CONSOLE CALLS ---');
for (const [file, info] of sortedFiles) {
  console.log(`${file}: ${info.total} (log: ${info.log}, warn: ${info.warn}, error: ${info.error})`);
}
