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

// ── Curated study content (quiz + flashcards) per deck ────────────────
// Hand-written so the demo shows sensible questions instead of prose-derived
// guesses. Keyed by deck title. Falls back to AI / local generation for
// unknown documents (e.g. user-uploaded PDFs).

export interface IStudyQuestion {
  type: 'multiple_choice' | 'true_false' | 'fill_blank';
  question: string;
  options: string[]; // ignored for true_false / fill_blank
  answer: string; // must match an option exactly for multiple_choice
  explanation: string;
}

export interface IDeckStudy {
  quiz: IStudyQuestion[];
  flashcards: { front: string; back: string }[];
}

const STUDY: Record<string, IDeckStudy> = {
  'PCA — Motivation & mathematics': {
    quiz: [
      {
        type: 'multiple_choice',
        question: 'When choosing a direction w, what does PCA maximize?',
        options: [
          'The variance of the projected data',
          'The mean of the data',
          'The number of features',
          'The distance between two samples'
        ],
        answer: 'The variance of the projected data',
        explanation: 'PCA seeks the unit direction along which the projection has the largest variance.'
      },
      {
        type: 'true_false',
        question:
          'Enforcing ‖w‖ = 1 with a Lagrange multiplier turns the PCA objective into the eigenproblem Σw = λw.',
        options: [],
        answer: 'True',
        explanation: 'Differentiating the constrained objective yields exactly Σw = λw.'
      },
      {
        type: 'multiple_choice',
        question: 'In Σw = λw, what does the eigenvalue λ represent?',
        options: [
          'The variance captured by that axis',
          'The number of samples',
          'The mean of the data',
          'The correlation between two samples'
        ],
        answer: 'The variance captured by that axis',
        explanation: 'Each eigenvalue is the amount of variance explained by its eigenvector.'
      },
      {
        type: 'fill_blank',
        question:
          'PCA is equivalent to minimizing the squared ______ error — the best low-rank approximation.',
        options: [],
        answer: 'reconstruction',
        explanation: 'The variance-maximizing and reconstruction-error views give the same eigenvectors.'
      },
      {
        type: 'multiple_choice',
        question: 'Why is high dimensionality a problem (the “curse”)?',
        options: [
          'Data becomes sparse and pairwise distances concentrate',
          'Variance becomes negative',
          'Models can never overfit',
          'Eigenvalues always vanish'
        ],
        answer: 'Data becomes sparse and pairwise distances concentrate',
        explanation: 'As dimension grows, points spread out and distances lose contrast, so we need a projection.'
      }
    ],
    flashcards: [
      { front: 'Principal component', back: 'An eigenvector of the covariance matrix — an orthogonal axis of maximal variance.' },
      { front: 'PCA objective', back: 'Find the unit direction w that maximizes wᵀΣw (the projected variance), subject to ‖w‖ = 1.' },
      { front: 'Eigenvalue λ in PCA', back: 'The variance captured by its eigenvector axis.' },
      { front: 'Curse of dimensionality', back: 'As dimension grows, data becomes sparse, distances concentrate, and direct visualization is impossible.' },
      { front: 'PCA as reconstruction', back: 'PCA minimizes squared reconstruction error; the top eigenvectors give the best low-rank approximation.' }
    ]
  },

  'PCA — The algorithm, step by step': {
    quiz: [
      {
        type: 'multiple_choice',
        question: 'What is the first step of PCA?',
        options: [
          'Standardize features to zero mean and unit variance',
          'Project onto the eigenvectors',
          'Plot the raw data',
          'Sort the samples'
        ],
        answer: 'Standardize features to zero mean and unit variance',
        explanation: 'Standardizing (Z = (X − μ)/σ) prevents large-scale features from dominating the variance.'
      },
      {
        type: 'fill_blank',
        question: 'The covariance matrix is Σ = ZᵀZ / (n − ___).',
        options: [],
        answer: '1',
        explanation: 'The n − 1 divisor gives the unbiased estimate of the covariance.'
      },
      {
        type: 'multiple_choice',
        question: 'The Wine dataset in the notebook has:',
        options: [
          '178 samples and 13 features',
          '13 samples and 178 features',
          '1000 samples and 3 features',
          '100 samples and 50 features'
        ],
        answer: '178 samples and 13 features',
        explanation: '178 wines described by 13 chemical measurements, across 3 cultivars.'
      },
      {
        type: 'true_false',
        question:
          'Standardizing puts every feature on the same scale so scale differences don’t distort the variance PCA measures.',
        options: [],
        answer: 'True',
        explanation: 'Without it, a large-range feature like proline would dominate purely because of its units.'
      },
      {
        type: 'multiple_choice',
        question: 'On standardized data, the covariance matrix Σ equals the:',
        options: [
          'Correlation matrix',
          'Identity matrix',
          'Projection matrix',
          'Distance matrix'
        ],
        answer: 'Correlation matrix',
        explanation: 'With unit-variance features, the diagonal is all 1s and Σ is the correlation matrix.'
      }
    ],
    flashcards: [
      { front: 'Step 1 — Standardize', back: 'Z = (X − μ) / σ: zero-mean, unit-variance features so scale doesn’t distort variance.' },
      { front: 'Step 2 — Covariance', back: 'Σ = ZᵀZ / (n − 1): the d×d matrix of how features co-vary.' },
      { front: 'Why standardize first?', back: 'Features span very different scales (proline in the hundreds vs hue near 1); standardizing stops big-scale features dominating.' },
      { front: 'Wine dataset', back: '178 samples, 13 chemical features, 3 cultivars.' },
      { front: 'Σ on standardized data', back: 'Equals the correlation matrix — diagonal entries are all 1.' }
    ]
  },

  'PCA — Results & projection': {
    quiz: [
      {
        type: 'multiple_choice',
        question: 'Why use np.linalg.eigh (not eig) for the covariance matrix?',
        options: [
          'Σ is symmetric, so eigh returns real, orthonormal results',
          'eig does not exist in NumPy',
          'eigh is the only one that runs on floats',
          'eigh randomly shuffles the axes'
        ],
        answer: 'Σ is symmetric, so eigh returns real, orthonormal results',
        explanation: 'For symmetric matrices eigh is exact, real-valued and gives orthonormal eigenvectors.'
      },
      {
        type: 'multiple_choice',
        question: 'How much total variance do the first two components capture?',
        options: ['About 55%', 'About 10%', 'Exactly 100%', 'About 90%'],
        answer: 'About 55%',
        explanation: 'PC1 (36%) + PC2 (19%) ≈ 55% of the total variance.'
      },
      {
        type: 'fill_blank',
        question: 'To get a 2-D embedding, project the standardized data onto the top-2 ______.',
        options: [],
        answer: 'eigenvectors',
        explanation: 'Y = Z @ vecs[:, :2] projects onto the two leading eigenvectors.'
      },
      {
        type: 'true_false',
        question: 'PCA used the class labels y to separate the three cultivars in the 2-D plot.',
        options: [],
        answer: 'False',
        explanation: 'PCA is unsupervised — it never uses y. The structure emerges from variance alone.'
      },
      {
        type: 'multiple_choice',
        question: 'After projecting onto the top-2 components, Y.shape is:',
        options: ['(178, 2)', '(178, 13)', '(2, 178)', '(13, 2)'],
        answer: '(178, 2)',
        explanation: '178 samples, now described by 2 principal-component coordinates.'
      }
    ],
    flashcards: [
      { front: 'Explained variance ratio', back: 'evr = vals / vals.sum(): the fraction of total variance each component captures.' },
      { front: 'eigh vs eig', back: 'Σ is symmetric → eigh gives real eigenvalues and orthonormal eigenvectors.' },
      { front: 'Projection step', back: 'Y = Z @ vecs[:, :2]: multiply standardized data by the top-2 eigenvectors.' },
      { front: 'PC1 + PC2 variance', back: '≈ 55% of total variance (36% + 19%) for the Wine dataset.' },
      { front: 'PCA is unsupervised', back: 'It recovers structure from variance alone — the labels y are never used.' }
    ]
  }
};

export function deckStudy(title: string): IDeckStudy | undefined {
  return STUDY[title];
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
