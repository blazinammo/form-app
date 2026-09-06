const { Document, HeadingLevel, Packer, Paragraph, TextRun } = require('docx');

function answerLabel(form, value) {
  const ids = Array.isArray(value) ? value : [value];
  return ids.filter(Boolean).map(id => {
    for (const page of form.pages) for (const question of page.questions) {
      const answer = (question.answers || []).find(item => item.id === id);
      if (answer) return answer.text || id;
    }
    return String(id);
  }).join(', ');
}

function buildContext(form, answers = {}, variables = {}) {
  const context = { ...variables };
  for (const page of form.pages) for (const question of page.questions) {
    const value = answers[question.id];
    if (value === undefined || value === '') continue;
    context[question.id] = Array.isArray(value) ? answerLabel(form, value) : (question.type === 'radio' ? answerLabel(form, value) : value);
    context[`q_${question.id}`] = context[question.id];
  }
  return context;
}

function interpolate(text, context) {
  return String(text || '').replace(/{{\s*([^}]+?)\s*}}/g, (_, key) => String(context[key] ?? ''));
}

function blockText(block) {
  if (Array.isArray(block.runs)) return block.runs.map(run => run.text || '').join('');
  return block.text || '';
}

function conditionMet(block, answers, variables) {
  if (block.condType === 'variable') {
    const actual = Number(variables[block.varId] || 0);
    const expected = Number(block.varValue || 0);
    return { '>=': actual >= expected, '<=': actual <= expected, '==': actual === expected, '!=': actual !== expected, '>': actual > expected, '<': actual < expected }[block.varOp || '>='];
  }
  return block.answerText ? Object.values(answers).flatMap(value => Array.isArray(value) ? value : [value]).includes(block.answerText) : true;
}

function flattenBlocks(blocks, context, answers, variables, output = []) {
  for (const block of blocks || []) {
    if (block.type === 'conditional' && !conditionMet(block, answers, variables)) continue;
    const text = interpolate(blockText(block), context);
    if (block.type === 'heading') output.push({ type: 'heading', text });
    else if (block.type === 'paragraph' || block.type === 'conditional') output.push({ type: 'paragraph', text });
    if (block.children?.length) flattenBlocks(block.children, context, answers, variables, output);
  }
  return output;
}

async function generateDocx(form, answers, variables) {
  const context = buildContext(form, answers, variables);
  const blocks = form.docTemplate?.length ? flattenBlocks(form.docTemplate, context, answers, variables) : [{ type: 'heading', text: form.formTitle }, { type: 'paragraph', text: 'Generated from the completed Inspir form.' }];
  const children = blocks.map(block => new Paragraph({ heading: block.type === 'heading' ? HeadingLevel.HEADING_1 : undefined, spacing: { after: 180 }, children: [new TextRun({ text: block.text })] }));
  const document = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(document);
}

module.exports = { buildContext, interpolate, flattenBlocks, generateDocx };
