(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.FormFlowRules = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const NUMERIC_OPERATORS = new Set(['>=', '<=', '==', '!=', '>', '<']);
  const ANSWER_OPERATORS = new Set(['selected', 'notSelected', 'answered', 'notAnswered']);
  const hasValue = value => value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0);

  function conditionMatches(form, condition, answers = {}, variables = {}, visibility) {
    if (!condition || !Array.isArray(condition.rules) || !condition.rules.length) return true;
    const test = rule => {
      if (rule.source === 'variable') {
        const actual = Number(variables[rule.variableId] ?? 0);
        const expected = Number(rule.value ?? 0);
        return ({
          '>=': actual >= expected, '<=': actual <= expected, '==': actual === expected,
          '!=': actual !== expected, '>': actual > expected, '<': actual < expected
        })[rule.operator] === true;
      }
      if (rule.source !== 'answer' || !ANSWER_OPERATORS.has(rule.operator)) return false;
      const question = form.pages.flatMap(page => page.questions).find(item => item.id === rule.questionId);
      if (!question || visibility && !visibility.question(question.id)) return false;
      const value = answers[question.id];
      const selected = Array.isArray(value) ? value.includes(rule.answerId) : value === rule.answerId;
      const answered = hasValue(value);
      return ({
        selected, notSelected: !selected, answered, notAnswered: !answered
      })[rule.operator] === true;
    };
    return condition.match === 'any'
      ? condition.rules.some(test)
      : condition.rules.every(test);
  }

  function createVisibility(form, answers = {}, variables = {}) {
    const pageMemo = new Map();
    const sectionMemo = new Map();
    const questionMemo = new Map();
    const inProgress = new Set();
    const visibility = {
      page(pageId) {
        if (pageMemo.has(pageId)) return pageMemo.get(pageId);
        const page = form.pages.find(item => item.id === pageId);
        if (!page) return false;
        const key = `page:${pageId}`;
        if (inProgress.has(key)) return false;
        inProgress.add(key);
        const result = conditionMatches(form, page.visibilityCondition, answers, variables, visibility);
        inProgress.delete(key);
        pageMemo.set(pageId, result);
        return result;
      },
      section(sectionId) {
        if (sectionMemo.has(sectionId)) return sectionMemo.get(sectionId);
        const page = form.pages.find(item => item.sections?.some(section => section.id === sectionId));
        const section = page?.sections.find(item => item.id === sectionId);
        if (!page || !section) return false;
        const key = `section:${sectionId}`;
        if (inProgress.has(key)) return false;
        inProgress.add(key);
        const result = visibility.page(page.id)
          && conditionMatches(form, section.visibilityCondition, answers, variables, visibility);
        inProgress.delete(key);
        sectionMemo.set(sectionId, result);
        return result;
      },
      question(questionId) {
        if (questionMemo.has(questionId)) return questionMemo.get(questionId);
        const page = form.pages.find(item => item.questions.some(question => question.id === questionId));
        const question = page?.questions.find(item => item.id === questionId);
        if (!page || !question) return false;
        const key = `question:${questionId}`;
        if (inProgress.has(key)) return false;
        inProgress.add(key);
        let result = visibility.page(page.id)
          && (!question.sectionId || visibility.section(question.sectionId))
          && conditionMatches(form, question.visibilityCondition, answers, variables, visibility);
        // Older exports use conditional + parentAnswerId for follow-up questions.
        if (result && question.conditional && question.parentAnswerId) {
          const parent = form.pages.flatMap(item => item.questions)
            .find(item => item.answers.some(answer => answer.id === question.parentAnswerId));
          result = Boolean(parent && visibility.question(parent.id)
            && (Array.isArray(answers[parent.id])
              ? answers[parent.id].includes(question.parentAnswerId)
              : answers[parent.id] === question.parentAnswerId));
        }
        inProgress.delete(key);
        questionMemo.set(questionId, result);
        return result;
      }
    };
    return visibility;
  }

  function activeAnswers(form, answers = {}, variables = {}) {
    const visibility = createVisibility(form, answers, variables);
    const active = {};
    for (const page of form.pages) {
      if (!visibility.page(page.id)) continue;
      for (const question of page.questions) {
        if (!visibility.question(question.id) || !Object.hasOwn(answers, question.id)) continue;
        const value = answers[question.id];
        if (question.type === 'text') {
          if (typeof value === 'string' && value !== '') active[question.id] = value;
          continue;
        }
        const validIds = new Set(question.answers.map(answer => answer.id));
        if (question.type === 'checkbox') {
          const selected = Array.isArray(value) ? value.filter(id => validIds.has(id)) : [];
          if (selected.length) active[question.id] = selected;
        } else if (validIds.has(value)) active[question.id] = value;
      }
    }
    return active;
  }

  function questionRequired(form, question, answers = {}, variables = {}) {
    const visibility = createVisibility(form, answers, variables);
    if (!visibility.question(question.id)) return false;
    if (question.requiredWhen) return conditionMatches(form, question.requiredWhen, answers, variables, visibility);
    const page = form.pages.find(item => item.questions.some(candidate => candidate.id === question.id));
    const section = page?.sections?.find(item => item.id === question.sectionId);
    if (section?.requiredWhen) return conditionMatches(form, section.requiredWhen, answers, variables, visibility);
    return question.required !== false;
  }

  function nextVisiblePageIndex(form, startIndex, answers = {}, variables = {}) {
    const visibility = createVisibility(form, answers, variables);
    for (let index = Math.max(0, startIndex); index < form.pages.length; index += 1) {
      if (visibility.page(form.pages[index].id)) return index;
    }
    return form.pages.length;
  }

  return { conditionMatches, createVisibility, activeAnswers, questionRequired, nextVisiblePageIndex };
});
