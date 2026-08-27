const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeForm, validateForm } = require('../lib/schema');
const { hydrateState, storageErrorMessage } = require('../server');

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

test('hydrates a Supabase row with an empty draft', () => {
  const state = hydrateState({ draft: null, published: null, publishedAt: null, version: 0 });
  assert.ok(state.draft.pages.length > 0);
  assert.equal(state.published, null);
});

test('hydrates a nested persisted state shape', () => {
  const state = hydrateState({ state: { draft: { pages: [{ title: 'Saved page' }] } } });
  assert.equal(state.draft.pages[0].title, 'Saved page');
});

test('explains common Supabase setup errors without exposing secrets', () => {
  assert.match(storageErrorMessage({ code: '42P01' }), /form_state is missing/);
  assert.match(storageErrorMessage({ code: '42501' }), /denied access/);
});
