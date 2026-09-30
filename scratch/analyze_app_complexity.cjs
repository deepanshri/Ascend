const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const appFile = path.resolve(__dirname, '../src/App.tsx');
const code = fs.readFileSync(appFile, 'utf-8');
const lines = code.split('\n');
const totalLines = lines.length;

const sf = ts.createSourceFile(appFile, code, ts.ScriptTarget.Latest, true);

let useStateCount = 0;
let useEffectCount = 0;
let useLayoutEffectCount = 0;
let useMemoCount = 0;
let useCallbackCount = 0;
let useRefCount = 0;
let customHooks = [];
let contextConsumers = [];

const useStates = [];
const useEffects = [];
const useMemos = [];
const useCallbacks = [];

function visit(node) {
  if (ts.isCallExpression(node)) {
    const expr = node.expression;
    let hookName = '';
    if (ts.isIdentifier(expr)) {
      hookName = expr.text;
    } else if (ts.isPropertyAccessExpression(expr) && expr.expression.text === 'React') {
      hookName = expr.name.text;
    }

    if (hookName === 'useState') {
      useStateCount++;
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      useStates.push({ line: line + 1, snippet: lines[line].trim() });
    } else if (hookName === 'useEffect') {
      useEffectCount++;
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      useEffects.push({ line: line + 1, snippet: lines[line].trim() });
    } else if (hookName === 'useLayoutEffect') {
      useLayoutEffectCount++;
    } else if (hookName === 'useMemo') {
      useMemoCount++;
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      useMemos.push({ line: line + 1, snippet: lines[line].trim() });
    } else if (hookName === 'useCallback') {
      useCallbackCount++;
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      useCallbacks.push({ line: line + 1, snippet: lines[line].trim() });
    } else if (hookName === 'useRef') {
      useRefCount++;
    } else if (hookName.startsWith('use') && hookName !== 'useState' && hookName !== 'useEffect' && hookName !== 'useMemo' && hookName !== 'useCallback' && hookName !== 'useRef' && hookName !== 'useLayoutEffect') {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      customHooks.push({ name: hookName, line: line + 1, snippet: lines[line].trim() });
    }

    if (hookName === 'useContext' || (ts.isIdentifier(expr) && expr.text.includes('Context'))) {
      contextConsumers.push({ name: hookName, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
    }
  }
  ts.forEachChild(node, visit);
}

visit(sf);

console.log(JSON.stringify({
  totalLines,
  hookCounts: {
    useState: useStateCount,
    useEffect: useEffectCount,
    useLayoutEffect: useLayoutEffectCount,
    useMemo: useMemoCount,
    useCallback: useCallbackCount,
    useMemoAndCallbackTotal: useMemoCount + useCallbackCount,
    useRef: useRefCount,
    customHooksCount: customHooks.length,
    totalHooks: useStateCount + useEffectCount + useLayoutEffectCount + useMemoCount + useCallbackCount + useRefCount + customHooks.length
  },
  customHooks,
  contextConsumers
}, null, 2));
