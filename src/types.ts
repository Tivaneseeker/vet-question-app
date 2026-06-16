export type ChoiceKey = 'A' | 'B' | 'C' | 'D' | 'E';

export type Question = {
  id: string;
  category: string;
  stem: string;
  options: Record<ChoiceKey, string>;
  answer: ChoiceKey;
  explanation: string;
  createdAt: number;
};

export type View =
  | { name: 'home' }
  | { name: 'quiz'; mode: 'all' | 'category' | 'wrong'; category?: string }
  | { name: 'categories' }
  | { name: 'import' };
