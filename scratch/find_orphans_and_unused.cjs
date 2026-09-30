const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const tsConfigPath = path.resolve(__dirname, '../tsconfig.json');
const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
const parsedCommandLine = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  path.resolve(__dirname, '..')
);

// We want to find reachable files from src/main.tsx
const program = ts.createProgram(parsedCommandLine.fileNames, parsedCommandLine.options);
const rootFile = path.resolve(__dirname, '../src/main.tsx').replace(/\\/g, '/');

const visitedFiles = new Set();
function visitSourceFile(sf) {
  if (!sf || visitedFiles.has(sf.fileName)) return;
  visitedFiles.add(sf.fileName);

  ts.forEachChild(sf, function checkNode(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const resolved = ts.resolveModuleName(
          node.moduleSpecifier.text,
          sf.fileName,
          program.getCompilerOptions(),
          ts.sys
        );
        if (resolved && resolved.resolvedModule && !resolved.resolvedModule.isExternalLibraryImport) {
          const depSf = program.getSourceFile(resolved.resolvedModule.resolvedFileName);
          if (depSf) visitSourceFile(depSf);
        }
      }
    }
    // Also handle dynamic import()
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        const resolved = ts.resolveModuleName(
          arg.text,
          sf.fileName,
          program.getCompilerOptions(),
          ts.sys
        );
        if (resolved && resolved.resolvedModule && !resolved.resolvedModule.isExternalLibraryImport) {
          const depSf = program.getSourceFile(resolved.resolvedModule.resolvedFileName);
          if (depSf) visitSourceFile(depSf);
        }
      }
    }
    ts.forEachChild(node, checkNode);
  });
}

const mainSf = program.getSourceFile(rootFile);
if (mainSf) {
  visitSourceFile(mainSf);
}

const srcDir = path.resolve(__dirname, '../src').replace(/\\/g, '/');
const allSrcFiles = [];
function getFiles(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name).replace(/\\/g, '/');
    if (f.isDirectory()) getFiles(full);
    else if (/\.(tsx?|jsx?)$/.test(f.name) && !f.name.endsWith('.d.ts')) {
      allSrcFiles.push(full);
    }
  }
}
getFiles(srcDir);

const unreachable = allSrcFiles.filter(f => !visitedFiles.has(f));
console.log('--- UNREACHABLE FILES FROM src/main.tsx ---');
unreachable.forEach(f => {
  console.log(path.relative(path.resolve(__dirname, '..'), f).replace(/\\/g, '/'));
});

// Also check unused imports using TypeScript diagnostics
console.log('\n--- CHECKING UNUSED IMPORTS VIA TS DIAGNOSTICS ---');
// Create a program with noUnusedLocals: true
const customOptions = {
  ...parsedCommandLine.options,
  noUnusedLocals: true,
  noUnusedParameters: false
};
const diagProgram = ts.createProgram(parsedCommandLine.fileNames, customOptions);
const diagnostics = ts.getPreEmitDiagnostics(diagProgram);

const unusedImports = [];
for (const diag of diagnostics) {
  // 6133: is declared but its value is never read (covers unused imports)
  // 6192: All imports in import declaration are unused
  if (diag.code === 6133 || diag.code === 6192) {
    if (diag.file && diag.file.fileName.includes('/src/')) {
      const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start);
      const text = ts.flattenDiagnosticMessageText(diag.messageText, '\n');
      unusedImports.push({
        file: path.relative(path.resolve(__dirname, '..'), diag.file.fileName).replace(/\\/g, '/'),
        line: line + 1,
        column: character + 1,
        code: diag.code,
        message: text
      });
    }
  }
}

console.log(`Found ${unusedImports.length} unused local/import diagnostics in src:`);
unusedImports.forEach(u => {
  console.log(`${u.file}:${u.line}:${u.column} - ${u.message}`);
});
