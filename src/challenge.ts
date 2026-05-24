export type Difficulty = 'easy' | 'medium' | 'hard' | 'impossible';

export type ChallengeType =
  | 'bugfix'
  | 'predict-mc'
  | 'predict-free'
  | 'fillblank';

export interface IChallenge {
  type: ChallengeType;
  difficulty: Difficulty;
  originalCode: string;
  presentedCode: string;
  options?: string[];
  answer?: string;
  hints: string[];
  explanation?: string;

  /** Detailed briefing shown above the challenge. */
  summary?: string; // what the cell/script is supposed to do
  instructions?: string; // exactly what the learner must produce in this box
}

// Free-text ("predict-free") is intentionally excluded so it is never produced.
const TYPES: ChallengeType[] = ['bugfix', 'predict-mc', 'fillblank'];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'impossible'];

function guessDifficulty(code: string): Difficulty {
  const lines = code.split('\n').filter(l => l.trim().length > 0).length;
  if (lines <= 2) {
    return 'easy';
  }
  if (lines <= 5) {
    return 'medium';
  }
  if (lines <= 9) {
    return 'hard';
  }
  return 'impossible';
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/** Build a safe, AI-free challenge: retype the whole cell. */
export function fallbackChallenge(cellSource: string): IChallenge {
  return {
    type: 'fillblank',
    difficulty: guessDifficulty(cellSource),
    originalCode: cellSource,
    presentedCode: '',
    hints: [
      'Think about which variables this cell needs from earlier cells.',
      'Check variable names and indentation carefully.'
    ],
    summary:
      'This cell is part of the notebook’s analysis pipeline. Recreate it so it runs correctly.',
    instructions:
      'Write the Python code for this cell from scratch so that, when run, it produces the same result as the original.',
    explanation: 'Reproduce the cell so it runs and produces the expected output.'
  };
}

/** Coerce arbitrary AI JSON into a valid IChallenge, falling back where needed. */
export function coerceChallenge(raw: any, cellSource: string): IChallenge {
  if (!raw || typeof raw !== 'object') {
    return fallbackChallenge(cellSource);
  }

  const type: ChallengeType = TYPES.includes(raw.type) ? raw.type : 'predict-mc';
  const difficulty: Difficulty = DIFFICULTIES.includes(raw.difficulty)
    ? raw.difficulty
    : guessDifficulty(cellSource);

  const hints: string[] = Array.isArray(raw.hints)
    ? raw.hints.filter((h: unknown) => typeof h === 'string').slice(0, 4)
    : [];

  let presentedCode: string =
    typeof raw.presentedCode === 'string' ? raw.presentedCode : '';

  if (type === 'predict-mc' || type === 'predict-free') {
    // The learner reads the real (already-executed) code.
    presentedCode = cellSource;
  } else if (type === 'bugfix' && !presentedCode.trim()) {
    // A bugfix needs code that contains the bug; without it, fall back.
    return fallbackChallenge(cellSource);
  } else if (type === 'fillblank') {
    // Fill-in cells start empty — the learner writes the whole cell.
    presentedCode = '';
  }

  const options: string[] | undefined =
    type === 'predict-mc' && Array.isArray(raw.options)
      ? raw.options.filter((o: unknown) => typeof o === 'string')
      : undefined;

  if (type === 'predict-mc' && (!options || options.length < 2)) {
    return fallbackChallenge(cellSource);
  }

  return {
    type,
    difficulty,
    originalCode: cellSource,
    presentedCode,
    options,
    answer: str(raw.answer),
    hints,
    explanation: str(raw.explanation),
    summary: str(raw.summary),
    instructions: str(raw.instructions)
  };
}
