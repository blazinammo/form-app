const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeForm, validateForm } = require('../lib/schema');
const { hydrateState, storageErrorMessage, supabaseProjectUrl } = require('../server');
const { interpolate, buildContext, flattenBlocks, generateDocx } = require('../lib/document');

test('normalizes legacy form shapes with defaults', () => {
  const form = normalizeForm({ pages: [{ title: 'One', questions: [{ text: 'Name', type: 'text' }] }] });
  assert.equal(form.schemaVersion, 1);
  assert.equal(form.pages[0].questions[0].type, 'text');
  assert.equal(form.pages[0].questions[0].required, true);
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
  assert.match(storageErrorMessage({ code: 'PGRST301' }), /provider code: PGRST301/);
  assert.match(storageErrorMessage({ code: 'PGRST125' }), /without \/rest\/v1/);
});

test('normalizes a copied Supabase Data API URL', () => {
  assert.equal(supabaseProjectUrl(' https://project.supabase.co/rest/v1/ '), 'https://project.supabase.co');
});

test('builds document interpolation context from answers', () => {
  const form = { pages: [{ questions: [{ id: 'q1', type: 'text', answers: [] }, { id: 'q2', type: 'radio', answers: [{ id: 'a1', text: 'Accepted' }] }] }] };
  const context = buildContext(form, { q1: 'North', q2: 'a1' }, { score: 4 });
  assert.equal(interpolate('{{q_q1}} / {{q_q2}} / {{score}}', context), 'North / Accepted / 4');
});

test('includes conditional document text only when its rule matches', () => {
  const blocks = [{ type: 'conditional', condType: 'answer', answerText: 'yes', text: 'Consent was given.' }, { type: 'conditional', condType: 'variable', varId: 'score', varOp: '>=', varValue: 10, text: 'High priority.' }];
  assert.equal(flattenBlocks(blocks, {}, { q1: 'yes' }, { score: 12 }).length, 2);
  assert.equal(flattenBlocks(blocks, {}, { q1: 'no' }, { score: 2 }).length, 0);
});

test('generates a Word document with formatted runs', async () => {
  const buffer = await generateDocx({ formTitle: 'Test', pages: [], docTemplate: [{ type: 'paragraph', runs: [{ text: 'Important', bold: true }, { text: ' record', italic: true }] }] }, {}, {});
  assert.ok(buffer.length > 1000);
});
