const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'debug_logs_output.json'), 'utf-8'));

const srcFindings = data.findings.filter(f => f.file.startsWith('src/'));
console.log(`Total in src/: ${srcFindings.length}`);
console.log(JSON.stringify(srcFindings, null, 2));
