// Lecture-slide decks shown in the reader. Structured (not flat text) so the
// reader can render publication-quality slides. Keyed by PDF path so the
// existing course references map straight over.

export interface ISlideStep {
  n: string;
  title: string;
  code?: string;
  text: string;
}

export interface ISlide {
  kind:
    | 'title'
    | 'overview'
    | 'bullets'
    | 'statement'
    | 'code'
    | 'steps'
    | 'stat'
    | 'compare'
    | 'exercise';
  eyebrow?: string;
  title?: string;
  titleHi?: string; // a word inside the title to highlight
  subtitle?: string; // intro paragraph under the title
  presenter?: string;
  tags?: string[]; // tech chips on the title slide
  bullets?: string[];
  text?: string;
  code?: string; // multi-line code block
  codeCaption?: string;
  steps?: ISlideStep[]; // numbered cards (2–4)
  stat?: { value: string; label: string };
  compare?: {
    avoid: { title: string; text: string };
    prefer: { title: string; text: string };
  };
  footer?: string;
}

export interface IDeck {
  title: string;
  slides: ISlide[];
}

// ── Coffee & Climate — a real, cohesive data-analysis deck ────────────
// Mapped across the demo course's three weeks.

const DECKS: Record<string, IDeck> = {
  // Week 1 — Foundations & setup
  'materials/lecture_w1.pdf': {
    title: 'Coffee & Climate — Getting started',
    slides: [
      {
        kind: 'title',
        eyebrow: 'Jupyter Notebook Data Analysis Course',
        title: 'Coffee & Climate',
        subtitle:
          'Reading, cleaning, and visualizing real-world data in Jupyter — a hands-on module exploring a global coffee-production dataset alongside regional climate trends.',
        tags: ['pandas', 'matplotlib', 'NumPy', 'Jupyter'],
        presenter: 'Module 04 · Applied Data Science'
      },
      {
        kind: 'overview',
        eyebrow: 'Course overview',
        title: 'Why coffee, and why now?',
        subtitle:
          'Coffee is grown in over 70 countries, almost all within the “Bean Belt.” Its yields are exquisitely sensitive to temperature and rainfall — an ideal, real-world case study for time-series analysis, messy joins, and geographic visualization.',
        stat: {
          value: '70+',
          label: 'countries supply the global coffee market we’ll analyze'
        },
        steps: [
          { n: '01', title: 'Ingest', text: 'Load CSVs and API pulls into pandas DataFrames.' },
          { n: '02', title: 'Clean', text: 'Handle missing values, outliers, and unit mismatches.' },
          { n: '03', title: 'Explore', text: 'Uncover trends across decades and regions.' },
          { n: '04', title: 'Visualize', text: 'Build publication-ready charts with matplotlib.' }
        ]
      },
      {
        kind: 'code',
        eyebrow: 'Lesson 1',
        title: 'Setting up your notebook',
        subtitle:
          'Every analysis starts with the same three imports. We also set a plotting style so every chart in the course looks consistent.',
        bullets: [
          'Run once per kernel session — imports are cached after that',
          'pandas ≥ 2.0 required for the .convert_dtypes() calls we’ll use',
          '%matplotlib inline keeps charts embedded in the notebook'
        ],
        codeCaption: 'In [1]:',
        code:
          "import pandas as pd\nimport numpy as np\nimport matplotlib.pyplot as plt\nplt.style.use('seaborn-v0_8-whitegrid')\n%matplotlib inline\n\ncoffee = pd.read_csv(\n    'data/coffee_production.csv',\n    parse_dates=['year'],\n)\ncoffee.head()"
      }
    ]
  },

  // Week 2 — Cleaning & exploration
  'materials/lecture_w2.pdf': {
    title: 'Coffee & Climate — Cleaning & exploration',
    slides: [
      {
        kind: 'steps',
        eyebrow: 'Lesson 2',
        title: 'From raw export to analysis-ready',
        subtitle:
          'Our raw file arrives with inconsistent country names, mixed units, and gaps for war- and drought-affected years. We resolve these in four passes.',
        steps: [
          {
            n: '01',
            title: 'Standardize names',
            code: "df['country'].replace(alias_map)",
            text: 'Merge duplicate spellings like “Cote d’Ivoire” and “Ivory Coast.”'
          },
          {
            n: '02',
            title: 'Fix units',
            code: 'convert lbs → 60kg bags',
            text: 'Older records report pounds; newer ones use 60kg bags.'
          },
          {
            n: '03',
            title: 'Handle gaps',
            code: 'interpolate() short gaps only',
            text: 'Only fill gaps ≤ 2 years; longer gaps stay NaN.'
          },
          {
            n: '04',
            title: 'Validate',
            code: 'assert no negative yields',
            text: 'Guard against silent unit-conversion errors before analysis.'
          }
        ]
      },
      {
        kind: 'stat',
        eyebrow: 'Lesson 3 · Exploration',
        title: 'Global production, 1990–2024',
        codeCaption: 'Notebook snippet',
        code: "df.groupby('year')['bags_60kg'].sum().plot()\nplt.xlabel('Year')\nplt.ylabel('Bags (millions)')\nplt.title('Global Coffee Output')",
        stat: {
          value: '+84%',
          label:
            'growth in global output over 34 seasons — but not evenly distributed across regions, as the next slide shows.'
        }
      },
      {
        kind: 'code',
        eyebrow: 'Lesson 3 · Exploration',
        title: 'Regional yield vs. rainfall anomaly',
        subtitle:
          'Joining our production table with a climate dataset reveals which regions are most exposed to rainfall swings.',
        codeCaption: 'Notebook snippet',
        code: "merged = coffee.merge(\n    climate,\n    on=['country', 'year'],\n)\nmerged.corr()['yield']",
        text:
          'Colombia’s steep rainfall deficit lines up with its lower relative yield — a candidate for a follow-up regression in Lesson 4.'
      }
    ]
  },

  // Week 3 — Visualisation & the exercise
  'materials/lecture_w3.pdf': {
    title: 'Coffee & Climate — Charting & practice',
    slides: [
      {
        kind: 'compare',
        eyebrow: 'Lesson 4',
        title: 'Charting that earns trust',
        subtitle:
          'The same data, plotted two ways. Small choices in axis scale and color change what a reader concludes.',
        compare: {
          avoid: {
            title: 'Truncated y-axis',
            text: 'Axis starts at 55 — a 5% gap looks like a landslide.'
          },
          prefer: {
            title: 'Zero-based y-axis',
            text: 'plt.ylim(0, max_val * 1.1) makes true proportions visible.'
          }
        }
      },
      {
        kind: 'statement',
        eyebrow: 'Lesson 4',
        title: 'Read the axes before the trend',
        titleHi: 'axes',
        text:
          'A chart is an argument. Always label both axes, start counts at zero, and let colour encode meaning — never decoration.'
      },
      {
        kind: 'exercise',
        eyebrow: 'Your turn',
        title: 'Exercise: predict next season’s yield',
        subtitle:
          'Using the cleaned coffee_climate.csv from Lesson 2, build a notebook that answers three questions before next week’s session.',
        steps: [
          {
            n: '01',
            title: 'Correlate',
            text: 'Compute Pearson r between rainfall anomaly and yield for each country.'
          },
          {
            n: '02',
            title: 'Segment',
            text: 'Group countries into high / medium / low climate sensitivity.'
          },
          {
            n: '03',
            title: 'Report',
            text: 'Summarize findings in 3 markdown cells with supporting charts.'
          }
        ],
        footer: 'Due before next session · Submit as a rendered .ipynb via the course portal'
      }
    ]
  }
};

export function deckForPdf(pdf: string): IDeck | undefined {
  return DECKS[pdf];
}

/** Clean prose for a slide — used to seed quizzes & flashcards (no ASCII art). */
export function slideProse(slide: ISlide): string {
  const parts: string[] = [];
  if (slide.title) parts.push(slide.title + '.');
  if (slide.subtitle) parts.push(slide.subtitle);
  if (slide.text) parts.push(slide.text);
  if (slide.stat) parts.push(`${slide.stat.value} — ${slide.stat.label}`);
  if (slide.bullets?.length) parts.push(slide.bullets.join('. ') + '.');
  if (slide.steps?.length) {
    slide.steps.forEach(s => parts.push(`${s.title}: ${s.text}`));
  }
  if (slide.compare) {
    parts.push(`Avoid — ${slide.compare.avoid.title}: ${slide.compare.avoid.text}`);
    parts.push(`Prefer — ${slide.compare.prefer.title}: ${slide.compare.prefer.text}`);
  }
  return parts.join(' ');
}
