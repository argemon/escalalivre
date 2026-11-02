const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('guide stays open during StrictMode effect replay and can be reopened after closing', () => {
  const file = path.join(__dirname, '../src/components/UsageGuide.tsx');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  let effect;
  let closeEvents = 0;
  let openCalls = 0;
  const dialog = {
    open: false,
    showModal() { this.open = true; openCalls++; },
    close() { this.open = false; closeEvents++; },
  };
  vm.runInNewContext(code, {
    exports,
    require: name => name === 'react' ? {
      useRef: () => ({ current: dialog }),
      useEffect: callback => { effect = callback; },
    } : name === 'react/jsx-runtime' ? require(name) : {},
  });
  exports.UsageGuide({ onClose() {} });
  const cleanup = effect();
  if (typeof cleanup === 'function') cleanup();
  effect();
  assert.equal(dialog.open, true);
  assert.equal(closeEvents, 0, 'effect replay must not trigger the onClose event that dismisses the guide');
  assert.equal(openCalls, 1);
  dialog.close();
  exports.UsageGuide({ onClose() {} });
  effect();
  assert.equal(dialog.open, true);
  assert.equal(openCalls, 2);
});
