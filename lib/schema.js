const QUESTION_TYPES = new Set(['radio', 'checkbox', 'text']);
const OPERATORS = new Set(['+', '-', '*', '=']);
const RULE_OPERATORS = new Set(['selected', 'notSelected', 'answered', 'notAnswered', '>=', '<=', '==', '!=', '>', '<']);

function id(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeCondition(condition) {
  if (!condition || typeof condition !== 'object') return null;
  return {
    match: condition.match === 'any' ? 'any' : 'all',
    rules: Array.isArray(condition.rules) ? condition.rules.map(rule => ({
      source: rule?.source === 'variable' ? 'variable' : 'answer',
      questionId: String(rule?.questionId || ''),
      answerId: String(rule?.answerId || ''),
      variableId: String(rule?.variableId || ''),
      operator: String(rule?.operator || 'selected'),
      value: Number.isFinite(Number(rule?.value)) ? Number(rule.value) : 0
    })) : []
  };
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
      visibilityCondition: normalizeCondition(page.visibilityCondition),
      image: page.image && typeof page.image === 'object' ? {
        dataUrl: String(page.image.dataUrl || ''),
        position: String(page.image.position || 'top'),
        alt: String(page.image.alt || '')
      } : null,
      sections: Array.isArray(page.sections) ? page.sections.map(section => ({
        id: String(section.id || id('section')),
        title: String(section.title || 'Section'),
        visibilityCondition: normalizeCondition(section.visibilityCondition),
        requiredWhen: normalizeCondition(section.requiredWhen)
      })) : [],
      questions: Array.isArray(page.questions) ? page.questions.map(question => ({
        id: String(question.id || id('question')),
        text: String(question.text || ''),
        type: QUESTION_TYPES.has(question.type) ? question.type : 'text',
        required: question.required !== false,
        requiredWhen: normalizeCondition(question.requiredWhen),
        visibilityCondition: normalizeCondition(question.visibilityCondition),
        conditional: Boolean(question.conditional),
        parentAnswerId: question.parentAnswerId ? String(question.parentAnswerId) : null,
        sectionId: question.sectionId ? String(question.sectionId) : null,
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
  const questionIds = new Set(form.pages.flatMap(page => page.questions.map(question => question.id)));
  function validateCondition(condition, label) {
    if (!condition) return;
    if (!['all', 'any'].includes(condition.match)) errors.push(`${label} has an invalid rule-group operator.`);
    if (!condition.rules.length) errors.push(`${label} needs at least one rule.`);
    for (const rule of condition.rules) {
      if (!RULE_OPERATORS.has(rule.operator)) errors.push(`${label} has an invalid rule operator.`);
      if (rule.source === 'variable') {
        if (!variableIds.has(rule.variableId)) errors.push(`${label} references an unknown variable.`);
        if (!['>=', '<=', '==', '!=', '>', '<'].includes(rule.operator)) errors.push(`${label} uses an answer operator for a variable.`);
      } else {
        const question = form.pages.flatMap(page => page.questions).find(item => item.id === rule.questionId);
        if (!questionIds.has(rule.questionId)) errors.push(`${label} references an unknown question.`);
        if (!['selected', 'notSelected', 'answered', 'notAnswered'].includes(rule.operator)) errors.push(`${label} uses a variable operator for an answer.`);
        if (['selected', 'notSelected'].includes(rule.operator)
          && !question?.answers.some(answer => answer.id === rule.answerId)) errors.push(`${label} references an unknown answer.`);
      }
    }
  }
  for (const [pageIndex, page] of form.pages.entries()) {
    if (!page.title.trim()) errors.push(`Page ${pageIndex + 1} needs a title.`);
    if (page.defaultNextPageId && !pageIds.has(page.defaultNextPageId)) errors.push(`Page ${page.id} has an invalid default route.`);
    validateCondition(page.visibilityCondition, `Page ${page.id} visibility`);
    const sectionIds = new Set(page.sections.map(section => section.id));
    for (const section of page.sections) {
      validateCondition(section.visibilityCondition, `Section ${section.id} visibility`);
      validateCondition(section.requiredWhen, `Section ${section.id} requiredness`);
    }
    for (const condition of page.varConditions) {
      if (!variableIds.has(condition.varId)) errors.push(`Page ${page.id} references an unknown variable.`);
      if (condition.gotoPageId && !pageIds.has(condition.gotoPageId)) errors.push(`Page ${page.id} has an invalid variable route.`);
    }
    for (const [questionIndex, question] of page.questions.entries()) {
      if (!question.text.trim()) errors.push(`Page ${pageIndex + 1}, question ${questionIndex + 1} needs text.`);
      if (!QUESTION_TYPES.has(question.type)) errors.push(`Question ${question.id} has an invalid type.`);
      validateCondition(question.visibilityCondition, `Question ${question.id} visibility`);
      validateCondition(question.requiredWhen, `Question ${question.id} requiredness`);
      if (question.sectionId && !sectionIds.has(question.sectionId)) errors.push(`Question ${question.id} references an unknown section.`);
      for (const answer of question.answers) {
        if (answer.gotoPageId && !pageIds.has(answer.gotoPageId)) errors.push(`Answer ${answer.id} has an invalid route.`);
        for (const op of answer.varOps) if (!variableIds.has(op.varId)) errors.push(`Answer ${answer.id} references an unknown variable.`);
      }
    }
  }
  return { valid: errors.length === 0, errors, form };
}

module.exports = { normalizeForm, validateForm };
