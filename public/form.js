let meta = null;
let form = null;
let current = 0;
let answers = {};
let variables = {};
const app = document.getElementById('app');
const rules = window.FormFlowRules;
const previewMode = new URLSearchParams(location.search).get('preview') === '1';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
function documentRunHtml(run, context) { let text = esc(interpolatePreview(run.text || '', context)); if (run.bold) text = `<strong>${text}</strong>`; if (run.italic) text = `<em>${text}</em>`; if (run.underline) text = `<u>${text}</u>`; const font = String(run.font || '').replace(/[^a-zA-Z0-9 ]/g, ''); return font ? `<span style="font-family:${font}">${text}</span>` : text; }
function showState(title, text, link = '') { app.setAttribute('aria-busy','false'); app.innerHTML = `<div class="empty"><p class="eyebrow">FormFlow</p><h1>${esc(title)}</h1><p class="muted">${esc(text)}</p>${link ? `<a class="btn btn-dark" href="${link}">Admin sign in</a>` : ''}</div>`; }
function visibleQuestions(page) { const visibility = rules.createVisibility(form, answers, variables); return page.questions.filter(question => visibility.question(question.id)); }
function renderVisibleQuestions(page) { const seen = new Set(); return visibleQuestions(page).map(question => { const section = page.sections?.find(item => item.id === question.sectionId); const heading = section && !seen.has(section.id) ? `<div class="respondent-section-title"><h2>${esc(section.title)}</h2></div>` : ''; if (section) seen.add(section.id); return heading + questionMarkup(question); }).join(''); }
function answerLabel(value) { const ids = Array.isArray(value) ? value : [value]; return ids.filter(Boolean).map(id => form.pages.flatMap(page => page.questions).flatMap(question => question.answers || []).find(answer => answer.id === id)?.text || id).join(', '); }
function recalculateVariables() {
  const defaults = Object.fromEntries(form.variables.map(variable => [variable.id, variable.defaultValue]));
  const calculate = active => {
    const result = { ...defaults };
    for (const page of form.pages) for (const question of page.questions) {
      const value = active[question.id];
      for (const answer of question.answers || []) if (value === answer.id || Array.isArray(value) && value.includes(answer.id)) for (const operation of answer.varOps || []) {
        const previous = result[operation.varId] || 0;
        result[operation.varId] = operation.op === '=' ? operation.value : operation.op === '+' ? previous + operation.value : operation.op === '-' ? previous - operation.value : previous * operation.value;
      }
    }
    return result;
  };
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const solve = source => {
    let computed = { ...defaults };
    const history = [];
    for (let step = 0; step < form.pages.reduce((sum, page) => sum + page.questions.length, 0) * 2 + 4; step += 1) {
      const active = rules.activeAnswers(form, source, computed);
      if (history.some(snapshot => same(snapshot, active))) break;
      history.push(active);
      const next = calculate(active);
      const nextActive = rules.activeAnswers(form, source, next);
      if (same(active, nextActive)) return { answers:nextActive, variables:calculate(nextActive) };
      computed = next;
    }
    // Cyclic visibility/effect dependencies fail closed: only answers active in every
    // iteration remain eligible, so an oscillating hidden answer cannot affect state.
    const stable = { ...history[0] };
    for (const key of Object.keys(stable)) if (history.some(snapshot => !same({value:snapshot[key]}, {value:stable[key]}))) delete stable[key];
    return solveStable(stable);
  };
  const solveStable = source => {
    let computed = { ...defaults };
    let active = rules.activeAnswers(form, source, computed);
    for (let step = 0; step < form.pages.reduce((sum, page) => sum + page.questions.length, 0) + 2; step += 1) {
      computed = calculate(active);
      const next = rules.activeAnswers(form, source, computed);
      if (same(active, next)) return { answers:next, variables:calculate(next) };
      active = next;
    }
    const filtered = { ...active };
    return { answers:filtered, variables:calculate(filtered) };
  };
  const result = solve(answers) || solveStable(answers);
  answers = result.answers;
  variables = result.variables;
}
function nextPage(page) { for (const condition of page.varConditions || []) { const actual = variables[condition.varId] || 0; const matched = ({ '>=':actual >= condition.value, '<=':actual <= condition.value, '==':actual === condition.value, '!=':actual !== condition.value, '>':actual > condition.value, '<':actual < condition.value })[condition.op]; if (matched && condition.gotoPageId) return form.pages.findIndex(item => item.id === condition.gotoPageId); } const active = rules.activeAnswers(form, answers, variables); const routed = visibleQuestions(page).flatMap(question => { const value = active[question.id]; return (Array.isArray(value) ? value : [value]).map(id => (question.answers || []).find(answer => answer.id === id)); }).find(answer => answer?.gotoPageId); if (routed) return form.pages.findIndex(item => item.id === routed.gotoPageId); if (page.defaultNextPageId) return form.pages.findIndex(item => item.id === page.defaultNextPageId); return current + 1; }
function questionMarkup(question) { const value = answers[question.id]; const required = rules.questionRequired(form, question, answers, variables); if (question.type === 'text') return `<section class="respondent-question"><h2>${esc(question.text)}${required ? ' <span aria-hidden="true">*</span>' : ''}</h2><textarea class="area" rows="4" data-question="${question.id}" ${required ? 'required' : ''} oninput="updateTextAnswer('${question.id}',this.value,this)">${esc(value || '')}</textarea></section>`; const multiple = question.type === 'checkbox'; return `<section class="respondent-question"><h2>${esc(question.text)}${required ? ' <span aria-hidden="true">*</span>' : ''}</h2>${(question.answers || []).map(answer => `<label class="choice"><input type="${multiple ? 'checkbox' : 'radio'}" name="question_${question.id}" value="${answer.id}" ${multiple ? (value || []).includes(answer.id) ? 'checked' : '' : value === answer.id ? 'checked' : ''} onchange="choose('${question.id}','${answer.id}',${multiple})" ${required && !multiple ? 'required' : ''}><span>${esc(answer.text || 'Option')}</span></label>`).join('')}</section>`; }
function render() { app.setAttribute('aria-busy','false'); current = rules.nextVisiblePageIndex(form, current, answers, variables); if (current >= form.pages.length) return showDocumentResult(); const page = form.pages[current]; if (!page) return showDocumentResult(); const visibility = rules.createVisibility(form, answers, variables); const visiblePages = form.pages.filter(item => visibility.page(item.id)); app.innerHTML = `<div class="public-header"><p class="eyebrow">${previewMode ? 'Draft preview · unpublished' : `${esc(form.formTitle)} · version ${meta.version}`}</p><h1>${esc(page.title)}</h1><p>${esc(page.description)}</p><div class="muted" style="font-size:12px">Step ${visiblePages.findIndex(item => item.id === page.id) + 1} of ${visiblePages.length}${previewMode ? ' · Preview only' : ''}</div></div>${previewMode ? '<div class="notice preview-notice">This is an unpublished draft. Changes here are not saved as respondent answers.</div>' : ''}<form id="response-form">${renderVisibleQuestions(page)}<div class="public-footer"><span class="muted">Your responses stay in this form session.</span><button class="btn btn-orange">${esc(page.nextButtonLabel || 'Next')}</button></div></form>`; document.getElementById('response-form').onsubmit = event => { event.preventDefault(); for (const question of visibleQuestions(page)) if (question.type === 'checkbox' && rules.questionRequired(form, question, answers, variables) && !(answers[question.id] || []).length) { const first = event.currentTarget.querySelector(`input[name="question_${question.id}"]`); if (first) { first.setCustomValidity('Choose at least one option.'); first.reportValidity(); first.addEventListener('change', () => first.setCustomValidity(''), { once:true }); } return; } answers = rules.activeAnswers(form, answers, variables); recalculateVariables(); const target = nextPage(page); if (page.isEnd || target >= form.pages.length) return showDocumentResult(); current = rules.nextVisiblePageIndex(form, target, answers, variables); render(); }; }
function choose(questionId, answerId, multiple) { if (multiple) { const values = answers[questionId] || []; answers[questionId] = values.includes(answerId) ? values.filter(value => value !== answerId) : [...values, answerId]; } else answers[questionId] = answerId; recalculateVariables(); const focused = document.activeElement; render(); const input = [...app.querySelectorAll('input')].find(item => item.name === focused?.name && item.value === focused?.value); input?.focus(); }
function updateTextAnswer(questionId,value,element) { const start = element.selectionStart; const end = element.selectionEnd; answers[questionId] = value; render(); const input = app.querySelector(`textarea[data-question="${questionId}"]`); if (input) { input.focus(); input.setSelectionRange(start,end); } }
function documentContext() { const context = { ...variables }; const active = rules.activeAnswers(form, answers, variables); for (const page of form.pages) for (const question of page.questions) if (active[question.id] !== undefined) context[`q_${question.id}`] = question.type === 'text' ? active[question.id] : answerLabel(active[question.id]); return context; }
function interpolatePreview(text, context) { return String(text || '').replace(/{{\s*([^}]+?)\s*}}/g, function(_, key) { return context[key] ?? ''; }); }
function documentConditionMet(block, effectiveAnswers = rules.activeAnswers(form, answers, variables)) { if (block.condType === 'variable') { const actual = Number(variables[block.varId] || 0); const expected = Number(block.varValue || 0); return ({ '>=':actual >= expected, '<=':actual <= expected, '==':actual === expected, '!=':actual !== expected, '>':actual > expected, '<':actual < expected })[block.varOp || '>=']; } return block.answerText ? Object.values(effectiveAnswers).flatMap(value => Array.isArray(value) ? value : [value]).includes(block.answerText) : true; }
function documentText() { const context = documentContext(); const active = rules.activeAnswers(form, answers, variables); const blocks = form.docTemplate?.length ? form.docTemplate : [{ type:'heading', text:form.formTitle }, { type:'paragraph', text:'Generated from the completed FormFlow form.' }]; return blocks.filter(block => block.type !== 'conditional' || documentConditionMet(block, active)).map(block => { const content = block.runs?.length ? block.runs.map(run => documentRunHtml(run, context)).join('') : esc(interpolatePreview(block.text || '', context)); return `<section class="document-preview-block ${block.type === 'heading' ? 'document-preview-heading' : ''}">${content}</section>`; }).join(''); }
function showDocumentResult() { app.setAttribute('aria-busy','false'); app.innerHTML = `<div class="public-header"><p class="eyebrow">Complete</p><h1>Your document is ready.</h1><p>Review the generated preview below. You can download a Word document for your records or court preparation.</p></div><section class="document-preview">${documentText()}</section><div class="public-footer"><button class="btn btn-light" style="color:var(--ink);border-color:var(--line)" onclick="current=form.pages.length-1;render()">Review answers</button><button class="btn btn-orange" id="download-document">Download Word document</button></div>`; document.getElementById('download-document').onclick = downloadDocument; }
async function downloadDocument() { const button = document.getElementById('download-document'); button.disabled = true; button.textContent = 'Preparing document…'; try { const endpoint = previewMode ? '/api/admin/preview/document' : '/api/public/document'; const response = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ answers, variables }) }); if (!response.ok) throw new Error('The document could not be generated.'); const blob = await response.blob(); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${(form.docTitle || 'FormFlow-document').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}.docx`; link.click(); URL.revokeObjectURL(link.href); button.textContent = 'Downloaded'; } catch (error) { button.disabled = false; button.textContent = 'Download Word document'; showState('Document unavailable', error.message); } }
(async () => { try { const response = await fetch(previewMode ? '/api/admin/preview' : '/api/public/form'); if (previewMode && response.status === 401) return showState('Admin access required', 'Sign in to view an unpublished draft preview.', '/admin-login.html'); if (!previewMode && response.status === 404) return showState('Not published yet', 'The administrator has not published a form.'); if (!response.ok) throw new Error(previewMode ? 'Unable to load the draft preview.' : 'Unable to load the published form.'); const result = await response.json(); meta = previewMode ? { version:'draft' } : result; form = previewMode ? result.form : meta.form; form.variables.forEach(variable => variables[variable.id] = variable.defaultValue); if (!form.pages.length) return showState('Nothing to show', 'This form has no pages.'); render(); } catch (error) { showState('Unable to load form', error.message); } })();
