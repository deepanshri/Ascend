const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..', 'src');

function walk(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, fileList);
    } else if (entry.isFile() && /\.(tsx?|jsx?|css)$/.test(entry.name)) {
      fileList.push(full);
    }
  }
  return fileList;
}

const files = walk(srcDir);
const findings = [];

for (const file of files) {
  const rel = path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/');
  const lines = fs.readFileSync(file, 'utf-8').split('\n');

  // Check contiguous single-line comments //
  let commentBlock = [];
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('//')) {
      if (commentBlock.length === 0) startLine = i + 1;
      commentBlock.push(line);
    } else {
      if (commentBlock.length >= 5) {
        // Check if looks like code or doc
        const codeLike = commentBlock.filter(l => /[{};=()=>]|const |let |var |import |export |return |<[A-Z]/.test(l)).length;
        findings.push({
          file: rel,
          startLine,
          endLine: i,
          count: commentBlock.length,
          type: codeLike >= 2 ? 'commented_code' : 'doc_or_text_block',
          sample: commentBlock.slice(0, 3).join('\n')
        });
      }
      commentBlock = [];
    }
  }
  if (commentBlock.length >= 5) {
    const codeLike = commentBlock.filter(l => /[{};=()=>]|const |let |var |import |export |return |<[A-Z]/.test(l)).length;
    findings.push({
      file: rel,
      startLine,
      endLine: lines.length,
      count: commentBlock.length,
      type: codeLike >= 2 ? 'commented_code' : 'doc_or_text_block',
      sample: commentBlock.slice(0, 3).join('\n')
    });
  }

  // Also check block comments /* ... */
  const fullContent = fs.readFileSync(file, 'utf-8');
  const blockCommentRegex = /\/\*([\s\S]*?)\*\//g;
  let match;
  while ((match = blockCommentRegex.exec(fullContent)) !== null) {
    const commentContent = match[1];
    const commentLines = commentContent.split('\n');
    if (commentLines.length >= 5) {
      // Find line number
      const upToMatch = fullContent.substring(0, match.index);
      const bStartLine = upToMatch.split('\n').length;
      const bEndLine = bStartLine + commentLines.length - 1;
      const codeLike = commentLines.filter(l => /[{};=()=>]|const |let |var |import |export |return |<[A-Z]/.test(l)).length;
      findings.push({
        file: rel,
        startLine: bStartLine,
        endLine: bEndLine,
        count: commentLines.length,
        type: codeLike >= 2 ? 'commented_code_block' : 'doc_comment_block',
        sample: commentLines.slice(0, 3).map(l => l.trim()).join('\n')
      });
    }
  }
}

fs.writeFileSync(path.join(__dirname, 'comment_blocks.json'), JSON.stringify(findings, null, 2), 'utf-8');
console.log(`Found ${findings.length} blocks with 5+ comment lines.`);
