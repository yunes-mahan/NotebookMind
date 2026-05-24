// Fake lecture-slide decks (styled after a real university deck) shown in a
// scrollable popup. Keyed by the PDF path so existing references map over.

export interface ISlide {
  kind: 'title' | 'bullets' | 'statement';
  eyebrow?: string;
  title?: string;
  titleHi?: string; // a word inside the title to highlight green
  bullets?: string[];
  text?: string;
  presenter?: string;
}

export interface IDeck {
  title: string;
  slides: ISlide[];
}

const DECKS: Record<string, IDeck> = {
  'materials/lecture_w1.pdf': {
    title: 'Week 1 — Foundations',
    slides: [
      {
        kind: 'title',
        eyebrow: 'Practical course · Week 1',
        title: 'Foundations: arrays & DataFrames',
        presenter: 'Dr. A. Lindqvist · Data Analysis with Python'
      },
      {
        kind: 'bullets',
        title: 'Today',
        bullets: [
          'Why NumPy and pandas',
          'The DataFrame mental model',
          'Reproducibility with seeds',
          'Lab: build a dataset'
        ]
      },
      {
        kind: 'statement',
        title: 'NumPy',
        titleHi: 'NumPy',
        text: 'Fast numeric arrays and vectorised operations — no Python loops needed.'
      },
      {
        kind: 'bullets',
        title: 'The DataFrame',
        bullets: [
          'Built from a dict of equal-length columns',
          'head(), info(), describe()',
          'Select columns and rows by label or position',
          'dtypes matter — int, float, object'
        ]
      },
      {
        kind: 'statement',
        title: 'Reproducibility',
        titleHi: 'Reproducibility',
        text: 'np.random.seed fixes the random stream, so results never drift between runs.'
      },
      {
        kind: 'bullets',
        title: 'Lab',
        bullets: [
          'Build the students DataFrame (40 rows, seeded)',
          'Draw study hours, sleep hours, group and noise',
          'Inspect with head()'
        ]
      }
    ]
  },
  'materials/lecture_w2.pdf': {
    title: 'Week 2 — Exploratory data analysis',
    slides: [
      {
        kind: 'title',
        eyebrow: 'Practical course · Week 2',
        title: 'Exploratory data analysis',
        presenter: 'Dr. A. Lindqvist · Data Analysis with Python'
      },
      {
        kind: 'bullets',
        title: 'Today',
        bullets: [
          'Feature engineering',
          'Boolean statistics',
          'Group-by aggregation',
          'Lab: student performance'
        ]
      },
      {
        kind: 'statement',
        title: 'Feature engineering',
        titleHi: 'Feature',
        text: 'Derive new columns from existing ones — a linear formula, clip() and round().'
      },
      {
        kind: 'bullets',
        title: 'Boolean statistics',
        bullets: [
          'Comparisons return a boolean Series',
          'mean() of booleans = a proportion',
          'value_counts() tallies categories'
        ]
      },
      {
        kind: 'bullets',
        title: 'Group-by',
        bullets: [
          'split – apply – combine',
          'Named aggregations: new = (column, function)',
          'One row per group'
        ]
      },
      {
        kind: 'statement',
        title: 'Lab',
        titleHi: 'Lab',
        text: 'Compute the pass rate and compare the three study groups.'
      }
    ]
  },
  'materials/lecture_w3.pdf': {
    title: 'Week 3 — Visualisation & correlation',
    slides: [
      {
        kind: 'title',
        eyebrow: 'Practical course · Week 3',
        title: 'Visualisation & correlation',
        presenter: 'Dr. A. Lindqvist · Data Analysis with Python'
      },
      {
        kind: 'bullets',
        title: 'Today',
        bullets: [
          'Correlation',
          'Plotting with matplotlib',
          'Reading charts',
          'Lab: scatter & insights'
        ]
      },
      {
        kind: 'statement',
        title: 'Correlation',
        titleHi: 'Correlation',
        text: 'A number from −1 to 1 measuring linear association. idxmax finds the strongest feature.'
      },
      {
        kind: 'bullets',
        title: 'Plotting',
        bullets: [
          'figure and axes: fig, ax = plt.subplots()',
          'scatter, bar, hist',
          'Always label axes and title the chart',
          'Colour can encode a third variable'
        ]
      },
      {
        kind: 'statement',
        title: 'Correlation is not causation',
        titleHi: 'causation',
        text: 'A high correlation alone never proves one thing causes another.'
      },
      {
        kind: 'bullets',
        title: 'Lab',
        bullets: [
          'Scatter study hours vs. exam score',
          'Colour points by pass / fail',
          'Read the trend off the chart'
        ]
      }
    ]
  }
};

export function deckForPdf(pdf: string): IDeck | undefined {
  return DECKS[pdf];
}
