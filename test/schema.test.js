const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeForm, validateForm } = require('../lib/schema');

test('normalizes legacy form shapes with defaults', () => {
  const form = normalizeForm({ pages: [{ title: 'One', questions: [{ text: 'Name', type: 'text' }] }] });
  assert.equal(form.schemaVersion, 1);
  assert.equal(form.pages[0].questions[0].type, 'text');
  assert.deepEqual(form.pages[0].varConditions, []);
});

test('rejects an empty or unroutable form', () => {
  const result = validateForm({ pages: [{ id: 'p1', title: '', questions: [{ id: 'q1', text: '', type: 'radio', answers: [{ gotoPageId: 'missing' }] }] }] });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 2);
});

test('accepts a valid published form', () => {
  const result = validateForm({ pages: [{ id: 'p1', title: 'Start', isEnd: true, questions: [{ id: 'q1', text: 'Choose', type: 'radio', answers: [{ id: 'a1', text: 'Yes' }] }] }] });
  assert.equal(result.valid, true);
});
