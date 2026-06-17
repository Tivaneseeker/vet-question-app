import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { addWrongQuestion, clearQuestions, getQuestions, getWrongIds, removeWrongQuestion, saveQuestions } from './db';
import { CHOICES, parseQuestionCsv } from './csv';
import type { ChoiceKey, Question, View } from './types';

const BASE_URL = import.meta.env.BASE_URL;
const BUNDLED_QUESTION_VERSION = '2026-06-17-direct-answer-source';

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function parseExplanation(text: string): { standardAnswer: string; source: string; detail: string } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const standardAnswer = lines.find((line) => line.startsWith('标准答案：'))?.replace('标准答案：', '').trim() || '';
  const source = lines.find((line) => line.startsWith('出处：'))?.replace('出处：', '').trim() || '';
  const detail = lines
    .filter((line) => !line.startsWith('标准答案：') && !line.startsWith('出处：'))
    .join('\n')
    .replace(/^解析：/, '')
    .trim();
  return { standardAnswer, source, detail };
}

async function loadBundledQuestions(): Promise<{ count: number; skipped: number }> {
  const current = await getQuestions();
  const storedVersion = window.localStorage.getItem('bundledQuestionVersion');
  if (current.length > 0 && storedVersion === BUNDLED_QUESTION_VERSION) return { count: 0, skipped: 0 };

  const response = await fetch(`${BASE_URL}questions.csv`, { cache: 'no-cache' });
  if (!response.ok) return { count: 0, skipped: 0 };

  const parsed = parseQuestionCsv(await response.text());
  if (parsed.questions.length > 0) {
    await clearQuestions();
    await saveQuestions(parsed.questions);
    window.localStorage.setItem('bundledQuestionVersion', BUNDLED_QUESTION_VERSION);
  }
  return { count: parsed.questions.length, skipped: parsed.errors.length };
}

function App() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [message, setMessage] = useState('正在准备题库...');

  async function refresh() {
    const [loadedQuestions, loadedWrongIds] = await Promise.all([getQuestions(), getWrongIds()]);
    setQuestions(loadedQuestions);
    setWrongIds(loadedWrongIds);
  }

  useEffect(() => {
    async function boot() {
      try {
        const seeded = await loadBundledQuestions();
        await refresh();
        setMessage(seeded.count > 0 ? `已自动导入 ${seeded.count} 题` : '');
      } catch {
        await refresh();
        setMessage('');
      }
    }
    boot();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(`${BASE_URL}sw.js`);
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(questions.map((question) => question.category))).filter(Boolean).sort(),
    [questions],
  );

  async function importFile(file: File) {
    const parsed = parseQuestionCsv(await file.text());
    if (parsed.questions.length > 0) await saveQuestions(parsed.questions);
    await refresh();
    setMessage(`导入 ${parsed.questions.length} 题${parsed.errors.length ? `，跳过 ${parsed.errors.length} 行` : ''}`);
  }

  async function resetAll() {
    if (!window.confirm('确定清空本机题库和错题本吗？清空后刷新页面会重新导入内置题库。')) return;
    await clearQuestions();
    const seeded = await loadBundledQuestions();
    await refresh();
    setMessage(`已重置，并重新导入 ${seeded.count} 题`);
  }

  return (
    <main className="app">
      <header className="topbar">
        <button className="ghost" onClick={() => setView({ name: 'home' })}>首页</button>
        <div>
          <strong>兽医刷题</strong>
          <span>{questions.length} 题 · 错题 {wrongIds.length}</span>
        </div>
      </header>

      {view.name === 'home' && (
        <section className="home">
          <button onClick={() => setView({ name: 'quiz', mode: 'all' })}>开始刷题</button>
          <button onClick={() => setView({ name: 'categories' })}>分类刷题</button>
          <button onClick={() => setView({ name: 'quiz', mode: 'wrong' })}>错题本</button>
          <button onClick={() => setView({ name: 'import' })}>导入题库</button>
          {message && <p className="notice">{message}</p>}
        </section>
      )}

      {view.name === 'categories' && (
        <section className="panel">
          <h1>选择分类</h1>
          {categories.length === 0 ? <p className="muted">暂无分类，请先导入题库。</p> : null}
          <div className="list">
            {categories.map((category) => (
              <button key={category} onClick={() => setView({ name: 'quiz', mode: 'category', category })}>
                {category}
              </button>
            ))}
          </div>
        </section>
      )}

      {view.name === 'import' && (
        <section className="panel">
          <h1>导入题库</h1>
          <p className="muted">应用已内置整理好的题库。你也可以继续导入字段为“分类,题干,A,B,C,D,E,正确答案,解析”的 CSV 文件。</p>
          <label className="filePicker">
            <input type="file" accept=".csv,text/csv" onChange={(event) => event.target.files?.[0] && importFile(event.target.files[0])} />
            选择 CSV 文件
          </label>
          <button className="danger" onClick={resetAll}>重置为内置题库</button>
          {message && <p className="notice">{message}</p>}
        </section>
      )}

      {view.name === 'quiz' && (
        <Quiz
          view={view}
          allQuestions={questions}
          wrongIds={wrongIds}
          onBack={() => setView({ name: 'home' })}
          onWrong={async (id) => {
            await addWrongQuestion(id);
            await refresh();
          }}
          onCorrectWrong={async (id) => {
            await removeWrongQuestion(id);
            await refresh();
          }}
        />
      )}
    </main>
  );
}

function Quiz({
  view,
  allQuestions,
  wrongIds,
  onBack,
  onWrong,
  onCorrectWrong,
}: {
  view: Extract<View, { name: 'quiz' }>;
  allQuestions: Question[];
  wrongIds: string[];
  onBack: () => void;
  onWrong: (id: string) => Promise<void>;
  onCorrectWrong: (id: string) => Promise<void>;
}) {
  const [queue, setQueue] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<ChoiceKey | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let pool = allQuestions;
    if (view.mode === 'category') pool = allQuestions.filter((question) => question.category === view.category);
    if (view.mode === 'wrong') pool = allQuestions.filter((question) => wrongIds.includes(question.id));
    setQueue(shuffle(pool));
    setIndex(0);
    setSelected(null);
    setSubmitted(false);
  }, [allQuestions, view.mode, view.category, wrongIds.join('|')]);

  const question = queue[index];
  const title = view.mode === 'wrong' ? '错题本' : view.mode === 'category' ? view.category || '分类刷题' : '随机刷题';
  const explanation = question ? parseExplanation(question.explanation) : { standardAnswer: '', source: '', detail: '' };

  async function submit() {
    if (!question || !selected) return;
    setSubmitted(true);
    if (selected !== question.answer) await onWrong(question.id);
    else if (view.mode === 'wrong') await onCorrectWrong(question.id);
  }

  function next() {
    setSelected(null);
    setSubmitted(false);
    setIndex((value) => (value + 1 < queue.length ? value + 1 : 0));
  }

  if (!question) {
    return (
      <section className="panel">
        <h1>{title}</h1>
        <p className="muted">暂无可刷题目。</p>
        <button onClick={onBack}>返回首页</button>
      </section>
    );
  }

  return (
    <section className="quiz">
      <div className="quizMeta">
        <span>{title}</span>
        <span>{index + 1} / {queue.length}</span>
      </div>
      <h1>{question.stem}</h1>
      <div className="options">
        {CHOICES.filter((key) => question.options[key]).map((key) => (
          <button
            key={key}
            className={selected === key ? 'selected' : ''}
            disabled={submitted}
            onClick={() => setSelected(key)}
          >
            <b>{key}</b>
            <span>{question.options[key]}</span>
          </button>
        ))}
      </div>
      {!submitted ? (
        <button className="primary" disabled={!selected} onClick={submit}>提交</button>
      ) : (
        <div className={selected === question.answer ? 'result ok' : 'result bad'}>
          <strong>{selected === question.answer ? '回答正确' : `回答错误，正确答案：${question.answer}`}</strong>
          <dl className="answerMeta">
            <div>
              <dt>标准答案</dt>
              <dd>{explanation.standardAnswer || question.answer}</dd>
            </div>
            <div>
              <dt>出处</dt>
              <dd>{explanation.source || '未标注'}</dd>
            </div>
          </dl>
          {explanation.detail && <p className="explanationText">{explanation.detail}</p>}
          <button className="primary" onClick={next}>下一题</button>
        </div>
      )}
    </section>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
