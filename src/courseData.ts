// Dummy course ("Bereich") a teacher created: a subject with weekly content
// that unlocks over time. Used by the start screen and the course map.

export type NbStatus = 'done' | 'available' | 'locked';

export interface ICourseNotebook {
  id: string;
  title: string;
  topic: string; // short label for the map
  blurb: string;
  week: number;
  status: NbStatus;
  path?: string; // real .ipynb in the workspace (openable) — undefined = dummy
  deps: string[]; // ids of notebooks this builds on
}

export interface ICourseWeek {
  week: number;
  theme: string;
  topics: string[];
  slides: { pdf: string; label: string };
  notebookIds: string[];
}

export interface ICourse {
  subject: string;
  teacher: string;
  currentWeek: number;
  weeks: ICourseWeek[];
  notebooks: Record<string, ICourseNotebook>;
}

export const COURSE: ICourse = {
  subject: 'Data Analysis with Python',
  teacher: 'Dr. A. Lindqvist',
  currentWeek: 3,
  weeks: [
    {
      week: 1,
      theme: 'Foundations: arrays & DataFrames',
      topics: ['NumPy arrays', 'pandas DataFrames', 'Reproducibility'],
      slides: { pdf: 'materials/lecture_w1.pdf', label: 'Week 1 slides' },
      notebookIds: ['nb-foundations', 'nb-reproducible']
    },
    {
      week: 2,
      theme: 'Exploratory data analysis',
      topics: ['Feature engineering', 'Boolean stats', 'Group-by'],
      slides: { pdf: 'materials/lecture_w2.pdf', label: 'Week 2 slides' },
      notebookIds: ['nb-students', 'nb-eda']
    },
    {
      week: 3,
      theme: 'Visualisation & correlation',
      topics: ['Correlation', 'matplotlib', 'Reading charts'],
      slides: { pdf: 'materials/lecture_w3.pdf', label: 'Week 3 slides' },
      notebookIds: ['nb-correlation', 'nb-plotting']
    }
  ],
  notebooks: {
    'nb-foundations': {
      id: 'nb-foundations',
      title: 'NumPy & pandas intro',
      topic: 'Arrays & DataFrames',
      blurb: 'Arrays, vectorisation and the DataFrame mental model.',
      week: 1,
      status: 'done',
      deps: []
    },
    'nb-reproducible': {
      id: 'nb-reproducible',
      title: 'Reproducible datasets',
      topic: 'Reproducibility',
      blurb: 'Seeding random data so results never drift.',
      week: 1,
      status: 'done',
      deps: ['nb-foundations']
    },
    'nb-students': {
      id: 'nb-students',
      title: 'Student performance analysis',
      topic: 'Exploratory analysis',
      blurb: 'Build a dataset, derive scores, pass rates and groups.',
      week: 2,
      status: 'available',
      path: 'learn_demo.ipynb',
      deps: ['nb-reproducible']
    },
    'nb-eda': {
      id: 'nb-eda',
      title: 'Sales data EDA',
      topic: 'Aggregation',
      blurb: 'Summary statistics and group aggregations on sales data.',
      week: 2,
      status: 'done',
      deps: ['nb-foundations']
    },
    'nb-correlation': {
      id: 'nb-correlation',
      title: 'Correlation & regression',
      topic: 'Correlation',
      blurb: 'Measuring how variables move together.',
      week: 3,
      status: 'available',
      path: 'test_analysis.ipynb',
      deps: ['nb-students']
    },
    'nb-plotting': {
      id: 'nb-plotting',
      title: 'Plotting with matplotlib',
      topic: 'Visualisation',
      blurb: 'Scatter, bar and histogram charts that tell a story.',
      week: 3,
      status: 'locked',
      deps: ['nb-students', 'nb-eda']
    }
  }
};

/** Curated learning order used to draw the course-map flow. */
export const COURSE_FLOW: string[] = [
  'nb-foundations',
  'nb-reproducible',
  'nb-students',
  'nb-eda',
  'nb-correlation',
  'nb-plotting'
];

export function coursePercent(): number {
  const all = Object.values(COURSE.notebooks);
  const done = all.filter(n => n.status === 'done').length;
  return Math.round((done / all.length) * 100);
}

export const STATUS_META: Record<
  NbStatus,
  { icon: string; color: string; label: string }
> = {
  done: { icon: '✓', color: '#1F8A5B', label: 'Completed' },
  available: { icon: '▶', color: '#FE7030', label: 'Unlocked' },
  locked: { icon: '🔒', color: '#8A8780', label: 'Locked' }
};
