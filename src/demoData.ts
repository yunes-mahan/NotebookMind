import { IChallenge, Difficulty } from './challenge';

// ──────────────────────────────────────────────────────────────────────────
// Placeholder/seed content so the demo notebook feels real without the AI.
// Keyed by notebook file name. Only learn_demo.ipynb ships with data.
// ──────────────────────────────────────────────────────────────────────────

export interface ICellSlides {
  pdf: string;
  page: number;
  label: string;
}

export interface ICellMeta {
  title: string;
  ai: string; // markdown
  teacher: string; // markdown
  students: { author: string; text: string }[];
}

// Per-cell lecture-slide references (teacher-linked materials).
const DEMO_SLIDES: Record<string, Record<number, ICellSlides>> = {
  'learn_demo.ipynb': {
    0: { pdf: 'materials/lecture_w1.pdf', page: 1, label: 'Week 1 — Course intro & tooling' },
    1: { pdf: 'materials/lecture_w1.pdf', page: 5, label: 'Week 1 — Reproducible data (seeds)' },
    2: { pdf: 'materials/lecture_w2.pdf', page: 2, label: 'Week 2 — Feature engineering' },
    3: { pdf: 'materials/lecture_w2.pdf', page: 3, label: 'Week 2 — Boolean statistics' },
    4: { pdf: 'materials/lecture_w2.pdf', page: 4, label: 'Week 2 — Group-by aggregation' },
    5: { pdf: 'materials/lecture_w3.pdf', page: 2, label: 'Week 3 — Correlation' },
    6: { pdf: 'materials/lecture_w3.pdf', page: 4, label: 'Week 3 — Plotting with matplotlib' },
    7: { pdf: 'materials/lecture_w3.pdf', page: 5, label: 'Week 3 — Lab: scatter & insights' }
  }
};

export function demoCellSlides(
  notebookName: string,
  i: number
): ICellSlides | undefined {
  return DEMO_SLIDES[notebookName]?.[i];
}

const DEMO_ASSIGNMENT: Record<string, string> = {
  'learn_demo.ipynb':
    "In this notebook you'll analyse a synthetic class of 40 students to see how study and sleep habits relate to exam performance. Work through each cell: build the dataset, derive exam scores, compute the pass rate, compare study groups, check correlations, and finally visualise the result. By the end you should be comfortable with pandas transforms, groupby aggregations, boolean statistics and a basic matplotlib scatter plot."
};

const DEMO_CELLS: Record<string, Record<number, ICellMeta>> = {
  'learn_demo.ipynb': {
    0: {
      title: 'Imports & setup',
      ai:
        "**What this cell does**\n\nIt loads the three libraries the rest of the notebook depends on and prints their versions as a sanity check. Nothing is computed yet — this is pure environment setup.\n\n- `numpy` (as `np`) — fast numeric arrays and the random-number generator we seed next\n- `pandas` (as `pd`) — the `DataFrame`, the table-like structure that holds our students\n- `matplotlib.pyplot` (as `plt`) — the plotting library used at the end\n\n**Why print the versions?** Library APIs change between releases. Printing `np.__version__` and `pd.__version__` makes it obvious which versions you're running — invaluable when a snippet from the internet behaves differently for you.",
      teacher:
        '## Setup\n\nEvery analysis starts by importing what you need **once**, at the very top, using the conventional aliases.\n\n- `np`, `pd`, `plt` are near-universal — readers expect them, so stick to the convention.\n- Importing at the top (not scattered through the notebook) keeps dependencies obvious.\n\n**Common pitfalls**\n- `import matplotlib` is **not** the same as `import matplotlib.pyplot as plt` — you need the `pyplot` module for `plt.scatter`.\n- If a function seems to be missing later, a version mismatch (shown by these prints) is often the cause.',
      students: [
        { author: 'Mia', text: 'I always forget plt is matplotlib.pyplot, not matplotlib itself 😅' },
        { author: 'Tom', text: 'Printing versions saved me once when a function only existed in newer pandas.' },
        { author: 'Carlos', text: 'Aliases (np, pd, plt) felt arbitrary until I realised every tutorial uses the same ones — muscle memory now.' },
        { author: 'Sara', text: 'TIL the import line runs top-to-bottom, so if this cell errors nothing else will work. Run it first!' },
        { author: 'James', text: 'I keep a tiny snippet with these three imports and paste it into every new notebook.' }
      ]
    },
    1: {
      title: 'Build the student dataset',
      ai:
        "**What this cell does**\n\nIt builds the dataset the whole notebook analyses: a `DataFrame` called `students` with 40 rows, then shows the first five with `students.head()`.\n\n- `np.random.seed(7)` fixes the random stream so the numbers are identical every run\n- `study_hours` — integers 0–7 via `np.random.randint`\n- `sleep_hours` — a normal distribution around 7 via `np.random.normal`, rounded\n- `group` — A/B/C chosen uniformly with `np.random.choice`\n- `noise` — random wiggle used in the next cell to make scores less perfect\n\n**Key idea:** because *all* randomness is drawn here, every later cell is a pure transformation of `students` — re-running them never changes the data.",
      teacher:
        "## Building reproducible data\n\nThe single most important habit here is **reproducibility**: `np.random.seed(7)` guarantees everyone gets the same 40 students, so results can be compared and debugged.\n\n- Drawing `noise` now (even though it's used next cell) keeps every random call in one place.\n- `np.random.normal(7, 1.2, size=n)` means *mean 7, standard deviation 1.2*.\n- A `DataFrame` is built from a dict of equal-length columns.\n\n**Try it:** change the seed and watch every downstream number change together — that's the random stream at work.",
      students: [
        { author: 'Priya', text: 'Took me a second to notice `noise` is generated now but only used in the next cell.' },
        { author: 'Mia', text: 'Changing the seed and re-running really does change every number downstream — neat way to see the random stream.' },
        { author: 'Tom', text: 'np.random.normal(7, 1.2) → mean 7, std 1.2. I always mix up the argument order, so this stuck with me.' },
        { author: 'Sara', text: 'A DataFrame from a dict of columns finally clicked here: keys become column names, lists become rows.' }
      ]
    },
    2: {
      title: 'Compute the exam score',
      ai:
        "**What this cell does**\n\nIt creates the target variable `exam_score` as a formula of the other columns, then prints summary statistics.\n\n- A base of `40`, **plus** `5` points per study hour, **plus** `2` per sleep hour, **plus** the random `noise`\n- `.clip(0, 100)` bounds the result to a valid 0–100 range\n- `.round(1)` keeps one decimal\n- `describe()` prints count, mean, std, min/max and quartiles\n\nNotice study hours are weighted more heavily than sleep — that shows up later as a much stronger correlation.",
      teacher:
        '## Feature engineering\n\nThis turns a **linear formula** into a new column — exactly how engineered features are built in practice.\n\n- Arithmetic on columns is *vectorised*: `5.0 * students["study_hours"]` multiplies every row at once, no loop needed.\n- `clip(0, 100)` is `max(0, min(100, x))` applied element-wise.\n- `describe()` is your first stop for sanity-checking a numeric column.\n\n**Watch for:** the weights (5 vs 2) encode the assumption that studying matters more than sleeping — an assumption you can later test against the data.',
      students: [
        { author: 'Carlos', text: 'clip() is basically min/max combined into one call — neat.' },
        { author: 'James', text: 'I wrote a for-loop first, then realised the whole formula is vectorised — way shorter and faster.' },
        { author: 'Priya', text: 'The weights (5 vs 2) are the "model": study hours matter more than sleep. Good to make that explicit.' },
        { author: 'Mia', text: 'round(1) keeps the describe() output readable. Without it the decimals are endless.' }
      ]
    },
    3: {
      title: 'Pass / fail & pass rate',
      ai:
        '**What this cell does**\n\nIt flags who passed and reports the pass rate.\n\n- `students["exam_score"] >= 60` produces a boolean `Series` (one True/False per student)\n- `.mean()` of booleans equals the **proportion** of `True` — i.e. the pass rate\n- `value_counts()` shows the raw counts of True vs False\n\n**The trick:** in Python `True == 1` and `False == 0`, so averaging a boolean column gives a fraction between 0 and 1 — perfect for a rate.',
      teacher:
        '## Boolean statistics\n\nThe headline lesson: **the mean of a boolean Series is a proportion.** This is one of the most useful pandas idioms.\n\n- `f"{pass_rate:.1%}"` formats `0.775` as `77.5%` — the `%` does the ×100 and adds the sign.\n- `value_counts()` counts occurrences of each value; your go-to for categorical summaries.\n\n**Extension:** `(students["exam_score"] >= 60).sum()` gives the raw number of passers, since True sums as 1.',
      students: [
        { author: 'Mia', text: 'Mind blown that mean() of booleans equals the proportion of True.' },
        { author: 'Tom', text: 'I tried .sum() first to count passers — also works, just gives the raw count instead of the rate.' },
        { author: 'Sara', text: 'The :.1% in the f-string does the ×100 AND adds the % sign. Stopped me multiplying by hand.' },
        { author: 'Carlos', text: 'value_counts() is my new favourite — instant tally of any column.' }
      ]
    },
    4: {
      title: 'Compare the study groups',
      ai:
        '**What this cell does**\n\nIt summarises the three study groups in one table.\n\n- `groupby("group")` splits the rows into groups A, B and C\n- `.agg(...)` computes named aggregates per group: `avg_score`, `avg_study`, `n_students`\n- `.round(2)` tidies the numbers\n\nThe result has exactly one row per group — a compact comparison.',
      teacher:
        '## Group-by aggregation\n\n`groupby(...).agg(...)` is the **split–apply–combine** pattern and the workhorse of pandas analysis.\n\n- **Split:** rows are partitioned by the `group` value.\n- **Apply:** each aggregation runs within every group.\n- **Combine:** results are stitched into one table.\n\n**Named aggregation** reads as *new_column = (source_column, function)*, e.g. `avg_score=("exam_score", "mean")`. Swap `"mean"` for `"max"` or `"count"` to ask different questions of the same groups.',
      students: [
        { author: 'James', text: 'The named-aggregation syntax is so much cleaner than passing a dict to agg.' },
        { author: 'Priya', text: 'split–apply–combine finally made sense visually: one row comes out per group.' },
        { author: 'Mia', text: 'Swapped "mean" for "max" to see the top scorer per group — same code, different question.' },
        { author: 'Tom', text: 'count uses any column just to tally rows; I used student_id but it could be anything non-null.' }
      ]
    },
    5: {
      title: 'Correlation analysis',
      ai:
        '**What this cell does**\n\nIt measures how the numeric columns move together and names the strongest driver of the score.\n\n- `corr()` returns a **correlation matrix** — every pairwise correlation, from −1 to 1\n- `.drop("exam_score")` removes the trivial self-correlation (a column always correlates 1.0 with itself)\n- `idxmax()` returns the index label of the largest value — here, the feature most correlated with `exam_score`\n\nStudy hours come out on top (~0.9); sleep hours are essentially unrelated (~0).',
      teacher:
        '## Correlation\n\nCorrelation measures **linear** association on a scale from −1 (perfectly opposite) through 0 (none) to +1 (perfectly together).\n\n- `study_hours` ≈ **0.9** with score — strong, as the formula implies.\n- `sleep_hours` ≈ **0** — basically unrelated here.\n- `idxmax()` vs `idxmin()` is the difference between *most* and *least* — easy to mix up.\n\n**Crucial caveat:** correlation is **not** causation. Here we built the dependency, so we know it is causal — but with real data a high correlation alone never proves cause.',
      students: [
        { author: 'Sara', text: 'Good reminder: correlation ≠ causation. study_hours just tracks score here.' },
        { author: 'Carlos', text: 'idxmax returns the LABEL, not the value — got that wrong on the quiz first time.' },
        { author: 'James', text: 'Dropping the self-correlation (always 1.0) before idxmax is the key trick here.' },
        { author: 'Priya', text: 'sleep ≈ 0 surprised me — I expected more sleep to clearly help. The data says otherwise.' }
      ]
    },
    6: {
      title: 'Scatter: study hours vs. score',
      ai:
        "**What this cell does**\n\nIt draws the notebook's key visualisation: a **scatter plot** of `study_hours` (x-axis) against `exam_score` (y-axis).\n\n- `fig, ax = plt.subplots(figsize=(7, 4))` creates the figure and a single axes to draw on\n- `ax.scatter(...)` plots one point per student\n- Each point is **coloured by pass/fail** using a mapped boolean (blue = passed, red = failed)\n- `set_xlabel` / `set_ylabel` / `set_title` label the chart and `plt.show()` renders it\n\nThe upward cloud of points is the visual confirmation of the strong positive correlation from the previous cell.",
      teacher:
        '## Reading a scatter plot\n\nA scatter plot is the best way to **see** the relationship between two numeric variables.\n\n- Moving **right** (more study hours) tends to move **up** (higher score) — a positive trend.\n- **Colour** encodes a third variable: whether the student cleared the 60-point pass line.\n\n**Plotting tips**\n- `figsize=(7, 4)` sets the size in inches (width, height).\n- `alpha=0.8` adds slight transparency so overlapping points stay visible.\n- Always label your axes and give the chart a title — an unlabelled plot is hard to trust.',
      students: [
        { author: 'Tom', text: 'Colouring points by a mapped boolean is a slick trick.' },
        { author: 'Mia', text: 'fig, ax = plt.subplots() confused me — ax is the thing you actually draw on.' },
        { author: 'Sara', text: 'alpha=0.8 makes overlapping dots visible. Without it the cluster is a solid blob.' },
        { author: 'James', text: 'You can literally see the positive trend — way more convincing than the 0.9 number alone.' }
      ]
    },
    7: {
      title: 'Find the top student',
      ai:
        '**What this cell does**\n\nIt finds and prints the single best-performing student.\n\n- `sort_values("exam_score", ascending=False)` orders the rows from highest score to lowest\n- `.iloc[0]` takes the **first** row of that ordering — the top scorer\n- `int(top["student_id"])` prints the id as a whole number (without a trailing `.0`)\n\nThe printed line reports that student\'s id, group and score.',
      teacher:
        '## Selecting the top row\n\nTo pull out a whole record, the reliable recipe is **sort, then take the first row**.\n\n- `ascending=False` is what makes `.iloc[0]` the *highest*, not the lowest.\n- `.iloc[0]` is **positional** indexing, as opposed to `.loc` which is label-based.\n- Casting `student_id` to `int` is purely cosmetic, for clean output.\n\n**Alternative:** `students.loc[students["exam_score"].idxmax()]` does the same in one step using the index of the max.',
      students: [
        { author: 'Priya', text: 'iloc[0] after sorting is cleaner than idxmax + loc for a whole row.' },
        { author: 'Carlos', text: 'ascending=False is the whole trick — flip it and you get the WORST student.' },
        { author: 'Tom', text: 'int(...) on student_id just removes the .0 — pandas stored it as float because of the other columns.' },
        { author: 'Mia', text: 'iloc is positional, loc is label-based. I finally have that straight.' }
      ]
    }
  }
};

interface IDemoChallenge {
  type: IChallenge['type'];
  difficulty: Difficulty;
  summary: string;
  instructions: string;
  hints: string[];
  corrupt?: (src: string) => string; // bugfix only
  options?: string[]; // predict-mc
  answer?: string; // predict-mc
}

const DEMO_CHALLENGES: Record<string, Record<number, IDemoChallenge>> = {
  'learn_demo.ipynb': {
    0: {
      type: 'predict-mc',
      difficulty: 'easy',
      summary: 'The opening cell prepares the libraries everything else relies on.',
      instructions:
        'The cell has already been run (its output is shown). Read it and pick what it does.',
      hints: [],
      options: [
        'Imports NumPy, pandas and matplotlib, then prints the installed NumPy and pandas versions.',
        'Installs NumPy, pandas and matplotlib into the environment.',
        'Loads the student dataset from a CSV file.',
        'Defines the helper functions used later in the notebook.'
      ],
      answer:
        'Imports NumPy, pandas and matplotlib, then prints the installed NumPy and pandas versions.'
    },
    1: {
      type: 'predict-mc',
      difficulty: 'medium',
      summary: 'This cell creates the dataset the whole notebook analyses.',
      instructions:
        'The cell has already been run. Read it and pick the best description of what it does.',
      hints: [],
      options: [
        'Creates a reproducible 40-row DataFrame of students with random study hours, sleep hours, group and a noise column.',
        'Trains a model to predict student exam scores.',
        'Reads 40 student records from a database.',
        'Plots the distribution of study hours.'
      ],
      answer:
        'Creates a reproducible 40-row DataFrame of students with random study hours, sleep hours, group and a noise column.'
    },
    2: {
      type: 'bugfix',
      difficulty: 'medium',
      summary: 'exam_score is built from study hours, sleep hours and the pre-drawn noise.',
      instructions:
        'There is exactly one bug in the score formula. Find it, fix it, and run the cell so the summary statistics come out right.',
      hints: [
        'Think about each factor: should more sleep raise or lower the score?',
        'Check the sign in front of the sleep_hours term.'
      ],
      corrupt: src =>
        src.replace(
          '+ 2.0 * students["sleep_hours"]',
          '- 2.0 * students["sleep_hours"]'
        )
    },
    3: {
      type: 'fillblank',
      difficulty: 'easy',
      summary: 'A student passes when their exam score reaches the passing threshold of 60.',
      instructions:
        'Write the code for this cell from scratch: add a boolean column `passed` that is True when `exam_score` is at least 60, compute the pass rate with `.mean()`, then print the pass rate as a percentage and the True/False counts.',
      hints: [
        'Compare exam_score to 60 to get a boolean Series, then take its .mean() for the rate.',
        'Use an f-string like f"Pass rate: {pass_rate:.1%}" and students["passed"].value_counts().'
      ]
    },
    4: {
      type: 'bugfix',
      difficulty: 'hard',
      summary: 'Each study group is summarised with a few named aggregations.',
      instructions:
        'One aggregation is wrong, so avg_score is not actually an average. Fix it and run the cell.',
      hints: [
        'Look at the function used for avg_score.',
        "An average uses 'mean', not 'sum'."
      ],
      corrupt: src =>
        src.replace('avg_score=("exam_score", "mean")', 'avg_score=("exam_score", "sum")')
    },
    5: {
      type: 'bugfix',
      difficulty: 'medium',
      summary: 'This cell reports which feature is most correlated with the exam score.',
      instructions:
        'One function call points to the wrong feature, so the reported result is back-to-front. Fix it and run the cell.',
      hints: [
        'Do we want the largest or the smallest correlation?',
        'Compare idxmax and idxmin.'
      ],
      corrupt: src => src.replace('idxmax()', 'idxmin()')
    },
    6: {
      type: 'predict-mc',
      difficulty: 'easy',
      summary: 'The final visualisation of the relationship we have been analysing.',
      instructions:
        'The cell renders a chart (shown below). Read the code and pick what the chart shows.',
      hints: [],
      options: [
        'A scatter plot of study hours vs. exam score, with each point coloured by whether the student passed.',
        'A bar chart of the average score per group.',
        'A histogram of the exam scores.',
        'A line chart of scores over time.'
      ],
      answer:
        'A scatter plot of study hours vs. exam score, with each point coloured by whether the student passed.'
    },
    7: {
      type: 'fillblank',
      difficulty: 'medium',
      summary: 'We want to report the single best-performing student.',
      instructions:
        'Write the code for this cell: find the student with the highest exam_score (sort by it, descending, and take the first row), then print their id (as an int), group and score.',
      hints: [
        'sort_values("exam_score", ascending=False).iloc[0] gives the top row.',
        'Wrap the id in int(...) so it prints without a trailing .0.'
      ]
    }
  }
};

function firstComment(code: string): string | undefined {
  for (const raw of code.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#')) {
      return line.replace(/^#+\s*/, '').trim();
    }
    if (line) {
      return undefined;
    }
  }
  return undefined;
}

export function demoAssignment(notebookName: string): string | undefined {
  return DEMO_ASSIGNMENT[notebookName];
}

// ── Teacher-authored overrides (set from the Teacher dashboard, session-scoped) ──
const teacherExplainOverrides = new Map<string, string>();

export interface IAuthoredChallenge {
  type: 'bugfix' | 'fillblank' | 'predict-mc';
  difficulty: Difficulty;
  summary: string;
  instructions: string;
  hints: string[];
  presentedCode?: string; // bugfix: buggy code
  options?: string[]; // predict-mc
  answer?: string; // predict-mc
}
const authoredChallenges = new Map<string, IAuthoredChallenge>();

export function setTeacherExplain(key: string, i: number, text: string): void {
  teacherExplainOverrides.set(`${key}:${i}`, text);
}
export function getTeacherExplain(key: string, i: number): string | undefined {
  return teacherExplainOverrides.get(`${key}:${i}`);
}
export function setAuthoredChallenge(
  key: string,
  i: number,
  a: IAuthoredChallenge
): void {
  authoredChallenges.set(`${key}:${i}`, a);
}

export function demoCellMeta(
  notebookName: string,
  i: number
): ICellMeta | undefined {
  const base = DEMO_CELLS[notebookName]?.[i];
  const override = teacherExplainOverrides.get(`${notebookName}:${i}`);
  if (override) {
    return base
      ? { ...base, teacher: override }
      : { title: `Cell ${i + 1}`, ai: '', teacher: override, students: [] };
  }
  return base;
}

export function cellTitle(notebookName: string, code: string, i: number): string {
  const meta = DEMO_CELLS[notebookName]?.[i];
  if (meta) {
    return meta.title;
  }
  const comment = firstComment(code);
  if (comment) {
    return comment.length > 60 ? comment.slice(0, 57) + '…' : comment;
  }
  return `Block ${i + 1}`;
}

export function demoChallenge(
  notebookName: string,
  i: number,
  source: string
): IChallenge | null {
  // Teacher-authored challenges take precedence over the built-in seeds.
  const a = authoredChallenges.get(`${notebookName}:${i}`);
  if (a) {
    return {
      type: a.type,
      difficulty: a.difficulty,
      originalCode: source,
      presentedCode:
        a.type === 'fillblank'
          ? ''
          : a.type === 'bugfix'
          ? a.presentedCode ?? source
          : source,
      options: a.options,
      answer: a.answer,
      hints: a.hints,
      summary: a.summary,
      instructions: a.instructions
    };
  }

  const d = DEMO_CHALLENGES[notebookName]?.[i];
  if (!d) {
    return null;
  }
  if (d.type === 'fillblank') {
    // Fill-in cells start EMPTY — the learner writes the whole cell.
    return {
      type: 'fillblank',
      difficulty: d.difficulty,
      originalCode: source,
      presentedCode: '',
      hints: d.hints,
      summary: d.summary,
      instructions: d.instructions
    };
  }
  if (d.type === 'bugfix') {
    const presented = d.corrupt ? d.corrupt(source) : source;
    if (presented === source) {
      return null; // corruption pattern didn't match → let the AI handle it
    }
    return {
      type: 'bugfix',
      difficulty: d.difficulty,
      originalCode: source,
      presentedCode: presented,
      hints: d.hints,
      summary: d.summary,
      instructions: d.instructions
    };
  }
  return {
    type: 'predict-mc',
    difficulty: d.difficulty,
    originalCode: source,
    presentedCode: source,
    options: d.options,
    answer: d.answer,
    hints: d.hints,
    summary: d.summary,
    instructions: d.instructions
  };
}
