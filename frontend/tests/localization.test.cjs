const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./source-loader.cjs')();
const { parseNativeText, validateNativeDocument } = load('lib/nativeDocument.ts');
const { sampleDocument } = load('data/sample.ts');

test('malformed imported JSON reports a Portuguese message', () => {
  assert.throws(() => parseNativeText('{'), /o conteúdo JSON é inválido/);
});

test('nested schema validation reports a Portuguese message', () => {
  const document = structuredClone(sampleDocument);
  document.employees[0].allowsOvertime = 'yes';
  assert.throws(() => validateNativeDocument(document), error => {
    assert.match(error.message, /Documento inválido/);
    assert.match(error.message, /valor booleano/);
    assert.doesNotMatch(error.message, /Invalid input|expected|Too small/);
    return true;
  });
});
