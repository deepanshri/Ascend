const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../src');

function walk(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, fileList);
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) fileList.push(full);
  }
  return fileList;
}

const files = walk(srcDir);
const unused = [];

for (const file of files) {
  const rel = path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/');
  const code = fs.readFileSync(file, 'utf-8');
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);

  const importedIdents = [];

  ts.forEachChild(sf, node => {
    if (ts.isImportDeclaration(node)) {
      if (node.importClause) {
        // default import
        if (node.importClause.name) {
          importedIdents.push({
            name: node.importClause.name.text,
            pos: node.importClause.name.getStart(sf),
            line: sf.getLineAndCharacterOfPosition(node.importClause.name.getStart(sf)).line + 1,
            isType: node.importClause.isTypeOnly
          });
        }
        // named bindings
        if (node.importClause.namedBindings) {
          if (ts.isNamedImports(node.importClause.namedBindings)) {
            for (const elem of node.importClause.namedBindings.elements) {
              importedIdents.push({
                name: elem.name.text,
                pos: elem.name.getStart(sf),
                line: sf.getLineAndCharacterOfPosition(elem.name.getStart(sf)).line + 1,
                isType: node.importClause.isTypeOnly || elem.isTypeOnly
              });
            }
          } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
            importedIdents.push({
              name: node.importClause.namedBindings.name.text,
              pos: node.importClause.namedBindings.name.getStart(sf),
              line: sf.getLineAndCharacterOfPosition(node.importClause.namedBindings.name.getStart(sf)).line + 1,
              isType: node.importClause.isTypeOnly
            });
          }
        }
      }
    }
  });

  // Now count occurrences of each imported identifier in the AST outside the import statements
  for (const imp of importedIdents) {
    let count = 0;
    function check(node) {
      // Don't count inside import declarations
      if (ts.isImportDeclaration(node)) return;
      if (ts.isIdentifier(node) && node.text === imp.name) {
        count++;
      }
      ts.forEachChild(node, check);
    }
    ts.forEachChild(sf, check);

    if (count === 0) {
      // If it's React and JSX is used, React might be needed depending on JSX runtime, but let's note it
      unused.push({
        file: rel,
        line: imp.line,
        name: imp.name,
        isType: imp.isType
      });
    }
  }
}

console.log(`Found ${unused.length} unused imports:`);
unused.forEach(u => console.log(`${u.file}:${u.line} - '${u.name}' (type: ${u.isType})`));
