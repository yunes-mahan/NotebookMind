// Dummy analytics for the Teacher dashboard. All in-memory / illustrative.

export interface IStudentRow {
  name: string;
  xp: number;
  notebooks: number;
  firstTryPct: number;
  lastActive: string;
}

export interface ICellPerf {
  week: number;
  notebook: string;
  cell: string;
  students: number;
  firstTryPct: number;
  avgAttempts: number;
  struggle: number; // 0–100, higher = more students struggled
  issue: string; // the most common stumbling point
}

export interface ISubmission {
  student: string;
  notebook: string;
  when: string;
  xp: number;
  firstTryPct: number;
}

export const TEACHER_STUDENTS: IStudentRow[] = [
  { name: 'Alice M.', xp: 340, notebooks: 3, firstTryPct: 82, lastActive: '2h ago' },
  { name: 'Priya K.', xp: 290, notebooks: 3, firstTryPct: 71, lastActive: '5h ago' },
  { name: 'Carlos R.', xp: 250, notebooks: 2, firstTryPct: 64, lastActive: 'yesterday' },
  { name: 'Tom B.', xp: 210, notebooks: 2, firstTryPct: 58, lastActive: 'yesterday' },
  { name: 'Mia C.', xp: 180, notebooks: 2, firstTryPct: 75, lastActive: '3h ago' },
  { name: 'James O.', xp: 150, notebooks: 1, firstTryPct: 49, lastActive: '2 days ago' },
  { name: 'Sara L.', xp: 140, notebooks: 1, firstTryPct: 67, lastActive: 'today' },
  { name: 'Noah F.', xp: 90, notebooks: 1, firstTryPct: 41, lastActive: '4 days ago' }
];

export const CELL_PERF: ICellPerf[] = [
  { week: 1, notebook: 'NumPy & pandas intro', cell: 'Imports & setup', students: 24, firstTryPct: 92, avgAttempts: 1.1, struggle: 12, issue: 'Confuse matplotlib with matplotlib.pyplot.' },
  { week: 2, notebook: 'Student performance', cell: 'Build the dataset', students: 22, firstTryPct: 78, avgAttempts: 1.4, struggle: 28, issue: 'Unsure why all randomness lives in one cell.' },
  { week: 2, notebook: 'Student performance', cell: 'Compute the exam score', students: 22, firstTryPct: 55, avgAttempts: 2.1, struggle: 61, issue: 'Sign error in the formula; misuse of clip().' },
  { week: 2, notebook: 'Student performance', cell: 'Pass / fail & rate', students: 21, firstTryPct: 70, avgAttempts: 1.6, struggle: 34, issue: 'Don’t see that mean() of booleans is a rate.' },
  { week: 2, notebook: 'Student performance', cell: 'Compare study groups', students: 20, firstTryPct: 38, avgAttempts: 2.8, struggle: 79, issue: 'Named-aggregation syntax; mean vs sum.' },
  { week: 3, notebook: 'Student performance', cell: 'Correlation analysis', students: 18, firstTryPct: 47, avgAttempts: 2.3, struggle: 66, issue: 'idxmax vs idxmin; dropping self-correlation.' },
  { week: 3, notebook: 'Student performance', cell: 'Scatter plot', students: 17, firstTryPct: 73, avgAttempts: 1.5, struggle: 30, issue: 'fig/ax confusion; colour mapping.' },
  { week: 3, notebook: 'Student performance', cell: 'Find the top student', students: 16, firstTryPct: 62, avgAttempts: 1.8, struggle: 41, issue: 'ascending flag; iloc vs loc.' }
];

export const SUBMISSIONS: ISubmission[] = [
  { student: 'Alice M.', notebook: 'Student performance', when: 'Today 09:14', xp: 34, firstTryPct: 88 },
  { student: 'Priya K.', notebook: 'Student performance', when: 'Today 08:50', xp: 30, firstTryPct: 75 },
  { student: 'Mia C.', notebook: 'Sales data EDA', when: 'Yesterday 17:22', xp: 22, firstTryPct: 80 },
  { student: 'Carlos R.', notebook: 'Student performance', when: 'Yesterday 14:03', xp: 26, firstTryPct: 63 },
  { student: 'Tom B.', notebook: 'NumPy & pandas intro', when: 'Yesterday 11:40', xp: 18, firstTryPct: 57 },
  { student: 'James O.', notebook: 'Student performance', when: '2 days ago', xp: 12, firstTryPct: 44 }
];

// Struggle-flavoured comments pulled from Explain (feed the AI insights).
export const STRUGGLE_COMMENTS: { student: string; cell: string; text: string }[] = [
  { student: 'James O.', cell: 'Compare study groups', text: 'I genuinely could not tell why avg_score came out huge — turned out it was sum not mean.' },
  { student: 'Noah F.', cell: 'Compute the exam score', text: 'Spent ages here. Didn’t realise the minus sign flipped the whole thing.' },
  { student: 'Tom B.', cell: 'Correlation analysis', text: 'idxmax/idxmin keeps tripping me up — which one is the strongest again?' },
  { student: 'Sara L.', cell: 'Pass / fail & rate', text: 'Took me a while to trust that mean() of True/False gives a percentage.' },
  { student: 'Carlos R.', cell: 'Compare study groups', text: 'The (column, function) tuple syntax in agg is not intuitive at all.' }
];

export function insightsContext(): string {
  const perf = CELL_PERF.map(
    p =>
      `- Week ${p.week} · ${p.cell}: first-try ${p.firstTryPct}%, avg attempts ${p.avgAttempts}, struggle ${p.struggle}/100. Common issue: ${p.issue}`
  ).join('\n');
  const comments = STRUGGLE_COMMENTS.map(
    c => `- (${c.cell}) ${c.student}: "${c.text}"`
  ).join('\n');
  return `Per-cell performance:\n${perf}\n\nStudent comments:\n${comments}`;
}
