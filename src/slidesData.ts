// Lecture-slide decks shown in the reader. Structured (not flat text) so the
// reader can render publication-quality slides. Keyed by PDF path so the
// existing course references map straight over.

export interface ISlideStep {
  n: string;
  title: string;
  code?: string;
  text: string;
}

export interface ISlideCard {
  value: string;
  title?: string;
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
    | 'exercise'
    | 'cards';
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
  cards?: ISlideCard[]; // value + description cards (2–3)
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

// ── Principal Component Analysis in Jupyter (Wine dataset) ────────────
// A cohesive, from-first-principles deck, split across the demo course's
// three weeks: motivation & maths → the algorithm → results & projection.

const DECKS: Record<string, IDeck> = {
  // Week 1 — Motivation & the mathematics
  'materials/lecture_w1.pdf': {
    title: 'PCA — Motivation & mathematics',
    slides: [
      {
        kind: 'title',
        eyebrow: 'Dimensionality reduction from first principles',
        title: 'Principal Component Analysis in Jupyter',
        subtitle:
          'Derive the variance-maximizing objective, reduce it to an eigenproblem, and implement every step on a real 13-dimensional dataset.',
        tags: ['NumPy', 'scikit-learn', 'Jupyter'],
        presenter: 'Notebook Methods · Computer Science'
      },
      {
        kind: 'cards',
        eyebrow: 'Motivation',
        title: 'The curse of high dimensionality',
        subtitle:
          'Real feature spaces are wide. As dimension grows, data becomes sparse, pairwise distances concentrate, and direct visualization is impossible. We need a projection that keeps what matters.',
        cards: [
          {
            value: '13→2',
            title: 'Plot the unplottable',
            text: 'Compress 13 wine features into two coordinates we can actually plot.'
          },
          {
            value: 'd²',
            title: 'Structure hides in correlations',
            text: 'A covariance matrix grows quadratically — structure hides in correlations between features.'
          },
          {
            value: 'min L',
            title: 'Less noise, less overfit',
            text: 'A faithful low-rank view reduces noise and overfitting for downstream models.'
          }
        ]
      },
      {
        kind: 'code',
        eyebrow: 'The mathematics',
        title: 'The PCA objective',
        subtitle:
          'Find the unit direction w along which the projected data has maximal variance. Enforcing ‖w‖ = 1 with a Lagrange multiplier and differentiating turns this into an eigenproblem.',
        codeCaption: 'Objective → eigenproblem',
        code:
          'w* = argmax  wᵀ Σ w        subject to  ‖w‖ = 1\n\nΣ w = λ w',
        text:
          'Σ is the d×d covariance matrix of the centered data; its eigenvectors are the principal components (orthogonal axes) and each eigenvalue λ is the variance captured by that axis. Equivalently, PCA minimizes squared reconstruction error — the same eigenvectors, viewed as the best low-rank approximation.'
      }
    ]
  },

  // Week 2 — The algorithm, step by step
  'materials/lecture_w2.pdf': {
    title: 'PCA — The algorithm, step by step',
    slides: [
      {
        kind: 'steps',
        eyebrow: 'The recipe',
        title: 'The algorithm in four steps',
        subtitle:
          'PCA is four linear-algebra moves: put features on equal footing, measure how they co-vary, find the axes of that co-variation, and project onto the strongest ones.',
        steps: [
          {
            n: '01',
            title: 'Standardize',
            code: 'Z = (X − μ) / σ',
            text: 'Zero-mean, unit-variance features so scale doesn’t distort variance.'
          },
          {
            n: '02',
            title: 'Covariance',
            code: 'Σ = ZᵀZ / (n−1)',
            text: 'The d×d matrix of feature co-variation — PCA’s central object.'
          },
          {
            n: '03',
            title: 'Eigendecompose',
            code: 'Σ = W Λ Wᵀ',
            text: 'Eigenvectors sorted by eigenvalue give the ordered principal axes.'
          },
          {
            n: '04',
            title: 'Project',
            code: 'Y = Z Wₖ',
            text: 'Map onto the top-k eigenvectors to get a k-dim embedding.'
          }
        ]
      },
      {
        kind: 'code',
        eyebrow: 'Notebook · Step 1',
        title: 'Loading and inspecting the data',
        subtitle:
          'The Wine dataset: 178 samples, 13 chemical features, 3 cultivars.',
        codeCaption: 'In [1]:',
        code:
          'import numpy as np\nfrom sklearn.datasets import load_wine\n\ndata = load_wine()\nX, y = data.data, data.target\nprint(X.shape, np.unique(y))\n# → (178, 13) [0 1 2]',
        text:
          'Features span very different scales — from proline in the hundreds to hue near 1. That difference is exactly why standardization comes first.'
      },
      {
        kind: 'code',
        eyebrow: 'Notebook · Step 2',
        title: 'Standardizing and the covariance matrix',
        subtitle:
          'On standardized data, Σ equals the correlation matrix — diagonal entries are all 1.',
        codeCaption: 'In [2]:',
        code:
          '# standardize: zero mean, unit variance\nZ = (X - X.mean(0)) / X.std(0)\n\n# covariance, features in columns\nS = np.cov(Z, rowvar=False)\nprint(S.shape)   # → (13, 13)',
        text:
          'The n−1 divisor gives the unbiased estimate; rowvar=False keeps features in columns.'
      }
    ]
  },

  // Week 3 — Results & projection
  'materials/lecture_w3.pdf': {
    title: 'PCA — Results & projection',
    slides: [
      {
        kind: 'stat',
        eyebrow: 'Notebook · Step 3',
        title: 'Eigendecomposition and explained variance',
        codeCaption: 'In [3]:',
        code:
          '# symmetric → use eigh (real, orthonormal)\nvals, vecs = np.linalg.eigh(S)\norder = vals.argsort()[::-1]\nvals, vecs = vals[order], vecs[:, order]\n\nevr = vals / vals.sum()\nprint(evr[:3].round(3))   # → [0.362 0.192 0.111]',
        stat: {
          value: '55%',
          label:
            'of total variance captured by the first two components (PC1 36% + PC2 19%) — the rest tapers off quickly.'
        }
      },
      {
        kind: 'code',
        eyebrow: 'Notebook · Step 4',
        title: 'Projecting onto principal components',
        subtitle:
          'Multiply the standardized data by the top-2 eigenvectors and scatter the result.',
        codeCaption: 'In [4]:',
        code:
          '# project onto the top-2 eigenvectors\nY = Z @ vecs[:, :2]\n\nimport matplotlib.pyplot as plt\nplt.scatter(Y[:, 0], Y[:, 1], c=y)\nplt.xlabel("PC1"); plt.ylabel("PC2")\n# Y.shape → (178, 2)',
        text:
          'Three cultivars separate cleanly in 2D — although PCA never used the labels y. The unsupervised axes alone recover the structure.'
      },
      {
        kind: 'statement',
        eyebrow: 'Takeaway',
        title: 'PCA finds structure without labels',
        titleHi: 'without labels',
        text:
          'Standardize, take the covariance, eigendecompose, project. Two orthogonal axes recovered 55% of the variance and separated three cultivars — a compact, faithful view of a 13-dimensional space.'
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
  if (slide.cards?.length) {
    slide.cards.forEach(c => parts.push(`${c.title ? c.title + ': ' : ''}${c.text}`));
  }
  if (slide.compare) {
    parts.push(`Avoid — ${slide.compare.avoid.title}: ${slide.compare.avoid.text}`);
    parts.push(`Prefer — ${slide.compare.prefer.title}: ${slide.compare.prefer.text}`);
  }
  return parts.join(' ');
}
