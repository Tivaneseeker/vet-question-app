import type { ChoiceKey, Question } from './types';

const HEADERS = ['分类', '题干', 'A', 'B', 'C', 'D', 'E', '正确答案', '解析'];
const CHOICES: ChoiceKey[] = ['A', 'B', 'C', 'D', 'E'];

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (char === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeAnswer(value: string): ChoiceKey | null {
  const match = value.trim().toUpperCase().match(/[A-E]/);
  return match ? (match[0] as ChoiceKey) : null;
}

export function parseQuestionCsv(text: string): { questions: Question[]; errors: string[] } {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ''));
  const errors: string[] = [];
  if (rows.length < 2) return { questions: [], errors: ['CSV 没有题目数据'] };

  const header = rows[0].map((value) => value.trim());
  const ok = HEADERS.every((name, index) => header[index] === name);
  if (!ok) {
    return { questions: [], errors: [`表头必须是：${HEADERS.join(',')}`] };
  }

  const questions: Question[] = [];
  rows.slice(1).forEach((row, index) => {
    if (!row.some(Boolean)) return;
    const [category, stem, a, b, c, d, e, answerRaw, explanation] = row;
    const answer = normalizeAnswer(answerRaw ?? '');
    if (!stem || !a || !b || !answer) {
      errors.push(`第 ${index + 2} 行缺少题干、选项或正确答案`);
      return;
    }
    questions.push({
      id: `${Date.now()}-${index}-${stem.slice(0, 16)}`,
      category: category || '未分类',
      stem,
      options: { A: a || '', B: b || '', C: c || '', D: d || '', E: e || '' },
      answer,
      explanation: explanation || '暂无解析',
      createdAt: Date.now() + index,
    });
  });

  return { questions, errors };
}

export { CHOICES };
