import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './gsap';
import './styles.css';
import { addWrongQuestion, clearQuestions, getQuestions, getWrongIds, removeWrongQuestion, saveQuestions } from './db';
import { CHOICES, parseQuestionCsv } from './csv';
import type { ChoiceKey, Question, View } from './types';

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function App() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  async function refresh() {
    const [loadedQuestions, loadedWrongIds] = await Promise.all([getQuestions(), getWrongIds()]);
    setQuestions(loadedQuestions);
    setWrongIds(loadedWrongIds);
  }

  useEffect(() => {
    refresh();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(questions.map((question) => question.category))).filter(Boolean).sort(),
    [questions],
  );

  async function importFile(file: File) {
    const text = await file.text();
    const parsed = parseQuestionCsv(text);
    if (parsed.questions.length > 0) await saveQuestions(parsed.questions);
    await refresh();
    setMessage(`导入 ${parsed.questions.length} 题${parsed.errors.length ? `，跳过 ${parsed.errors.length} 行` : ''}`);
  }

  async function resetAll() {
    if (!window.confirm('确定清空本机题库和错题本吗？')) return;
    await clearQuestions();
    await refresh();
    setMessage('已清空本机数据');
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
          <p className="muted">请选择字段为“分类,题干,A,B,C,D,E,正确答案,解析”的 CSV 文件。</p>
          <label className="filePicker">
            <input type="file" accept=".csv,text/csv" onChange={(event) => event.target.files?.[0] && importFile(event.target.files[0])} />
            选择 CSV 文件
          </label>
          <button className="danger" onClick={resetAll}>清空本机数据</button>
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
          <p>{question.explanation}</p>
          <button className="primary" onClick={next}>下一题</button>
        </div>
      )}
    </section>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
