const QUESTION_TYPES = new Set(['radio', 'checkbox', 'text']);
const OPERATORS = new Set(['+', '-', '*', '=']);

function id(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeForm(input) {
  const source = input && typeof input === 'object' ? input : {};
  const pages = Array.isArray(source.pages) ? source.pages : [];
  return {
    schemaVersion: 1,
    formTitle: typeof source.formTitle === 'string' ? source.formTitle : 'My Form',
    variables: Array.isArray(source.variables) ? source.variables.map(variable => ({
      id: String(variable.id || id('var')),
      name: String(variable.name || 'score'),
      defaultValue: Number.isFinite(Number(variable.defaultValue)) ? Number(variable.defaultValue) : 0,
      type: variable.type === 'integer' ? 'integer' : 'number',
      visible: Boolean(variable.visible)
    })) : [],
    pages: pages.map((page, pageIndex) => ({
      id: String(page.id || id('page')),
      title: String(page.title || `Page ${pageIndex + 1}`),
      description: String(page.description || ''),
      isEnd: Boolean(page.isEnd),
      nextButtonLabel: String(page.nextButtonLabel || 'Next'),
      defaultNextPageId: page.defaultNextPageId ? String(page.defaultNextPageId) : null,
      image: page.image && typeof page.image === 'object' ? {
        dataUrl: String(page.image.dataUrl || ''),
        position: String(page.image.position || 'top'),
        alt: String(page.image.alt || '')
      } : null,
      questions: Array.isArray(page.questions) ? page.questions.map(question => ({
        id: String(question.id || id('question')),
        text: String(question.text || ''),
        type: QUESTION_TYPES.has(question.type) ? question.type : 'text',
        conditional: Boolean(question.conditional),
        parentAnswerId: question.parentAnswerId ? String(question.parentAnswerId) : null,
        answers: Array.isArray(question.answers) ? question.answers.map(answer => ({
          id: String(answer.id || id('answer')),
          text: String(answer.text || ''),
          gotoPageId: answer.gotoPageId ? String(answer.gotoPageId) : null,
          revealQuestionId: answer.revealQuestionId ? String(answer.revealQuestionId) : null,
          varOps: Array.isArray(answer.varOps) ? answer.varOps.filter(op => op && OPERATORS.has(op.op)).map(op => ({
            varId: String(op.varId || ''), op: op.op, value: Number(op.value) || 0
          })) : []
        })) : []
      })) : [],
      varConditions: Array.isArray(page.varConditions) ? page.varConditions.map(condition => ({
        id: String(condition.id || id('condition')),
        varId: String(condition.varId || ''),
        op: ['>=', '<=', '==', '!=', '>', '<'].includes(condition.op) ? condition.op : '>=',
        value: Number(condition.value) || 0,
        gotoPageId: condition.gotoPageId ? String(condition.gotoPageId) : null
      })) : []
    })),
    docTemplate: Array.isArray(source.docTemplate) ? source.docTemplate : [],
    docTitle: String(source.docTitle || 'Generated Document')
  };
}

function validateForm(input) {
  const form = normalizeForm(input);
  const errors = [];
  if (!form.pages.length) errors.push('Add at least one page.');
  const pageIds = new Set(form.pages.map(page => page.id));
  const variableIds = new Set(form.variables.map(variable => variable.id));
  for (const page of form.pages) {
    if (!page.title.trim()) errors.push('Every page needs a title.');
    if (page.defaultNextPageId && !pageIds.has(page.defaultNextPageId)) errors.push(`Page ${page.id} has an invalid default route.`);
    for (const condition of page.varConditions) {
      if (!variableIds.has(condition.varId)) errors.push(`Page ${page.id} references an unknown variable.`);
      if (condition.gotoPageId && !pageIds.has(condition.gotoPageId)) errors.push(`Page ${page.id} has an invalid variable route.`);
    }
    for (const question of page.questions) {
      if (!question.text.trim()) errors.push('Every question needs text.');
      if (!QUESTION_TYPES.has(question.type)) errors.push(`Question ${question.id} has an invalid type.`);
      for (const answer of question.answers) {
        if (answer.gotoPageId && !pageIds.has(answer.gotoPageId)) errors.push(`Answer ${answer.id} has an invalid route.`);
        for (const op of answer.varOps) if (!variableIds.has(op.varId)) errors.push(`Answer ${answer.id} references an unknown variable.`);
      }
    }
  }
  return { valid: errors.length === 0, errors, form };
}

module.exports = { normalizeForm, validateForm };
