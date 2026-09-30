const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..', 'src');

function walk(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, fileList);
    else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) fileList.push(full);
  }
  return fileList;
}

const files = walk(srcDir);
const realCommentedCode = [];

for (const file of files) {
  const rel = path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/');
  const lines = fs.readFileSync(file, 'utf-8').split('\n');

  let currentBlock = [];
  let blockStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Check if line starts with // and is NOT a JSDoc or markdown-like comment
    if (line.startsWith('//') && !line.startsWith('///')) {
      const content = line.replace(/^\/\/\s*/, '');
      // Check if line looks like actual programming code:
      const looksLikeCode = /^(import|export|const\s+\w+|let\s+\w+|var\s+\w+|function\s+\w+|if\s*\(|else\s*\{|return\s+|await\s+|\w+\.\w+\(|<[A-Z]\w+|console\.|[a-zA-Z_$][a-zA-Z0-9_$]*\s*=[^=]|switch\s*\(|case\s+|break;|[{}];?$)/.test(content);
      
      if (looksLikeCode) {
        if (currentBlock.length === 0) blockStart = i + 1;
        currentBlock.push({ lineNum: i + 1, text: line });
      } else {
        if (currentBlock.length >= 3) {
          realCommentedCode.push({
            file: rel,
            startLine: blockStart,
            endLine: i,
            count: currentBlock.length,
            code: currentBlock.map(c => c.text).join('\n')
          });
        }
        currentBlock = [];
      }
    } else {
      if (currentBlock.length >= 3) {
        realCommentedCode.push({
          file: rel,
          startLine: blockStart,
          endLine: i,
          count: currentBlock.length,
          code: currentBlock.map(c => c.text).join('\n')
        });
      }
      currentBlock = [];
    }
  }
  if (currentBlock.length >= 3) {
    realCommentedCode.push({
      file: rel,
      startLine: blockStart,
      endLine: lines.length,
      count: currentBlock.length,
      code: currentBlock.map(c => c.text).join('\n')
    });
  }
}

console.log('Real commented code blocks (>=3 lines):', realCommentedCode.length);
realCommentedCode.forEach(c => {
  console.log(`\n=== ${c.file}:${c.startLine}-${c.endLine} (${c.count} lines) ===\n${c.code}`);
});
