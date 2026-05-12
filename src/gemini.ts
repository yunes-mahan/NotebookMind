import { GoogleGenerativeAI } from '@google/generative-ai';

export interface IQuizQuestion {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
}

export interface IFlashcard {
  front: string;
  back: string;
}

export interface IAbbreviation {
  alias: string;
  fullName: string;
  description: string;
}

let _genAI: GoogleGenerativeAI | null = null;

export function initGemini(apiKey: string): void {
  _genAI = new GoogleGenerativeAI(apiKey);
}

function getModel() {
  if (!_genAI) {
    throw new Error('Gemini not initialized. Call initGemini() with a valid API key first.');
  }
  return _genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
}

async function generateText(prompt: string): Promise<string> {
  const model = getModel();
  const result = await model.generateContent(prompt);
  return result.response.text();
}

export async function explainCell(
  cellSource: string,
  level: 'beginner' | 'intermediate' | 'expert'
): Promise<string> {
  const prompt = `You are a Python tutor. Explain the following code cell at ${level} level. Be concise, max 3 paragraphs. Use simple language for beginner, technical depth for expert.

Code:
\`\`\`python
${cellSource}
\`\`\``;
  return generateText(prompt);
}

export async function generateQuiz(
  cellSource: string,
  type: 'predict' | 'bugfix' | 'fillblank'
): Promise<IQuizQuestion> {
  let prompt = '';
  if (type === 'predict') {
    prompt = `Given this Python code:
\`\`\`python
${cellSource}
\`\`\`

Create a multiple choice question asking what the output will be. Return ONLY valid JSON (no markdown):
{"question":"What is the output?","options":["A: ...","B: ...","C: ...","D: ..."],"answer":"A: ...","explanation":"..."}`;
  } else if (type === 'bugfix') {
    prompt = `Given this Python code:
\`\`\`python
${cellSource}
\`\`\`

Plant one subtle bug and ask students to identify the fix. Return ONLY valid JSON (no markdown):
{"question":"Find and fix the bug:\\n<buggy code here>","options":["A: ...","B: ...","C: ...","D: ..."],"answer":"A: ...","explanation":"..."}`;
  } else {
    prompt = `Given this Python code:
\`\`\`python
${cellSource}
\`\`\`

Blank out one keyword and ask the student to fill it in. Return ONLY valid JSON (no markdown):
{"question":"Fill the blank: <code with ___ >","options":["A: ...","B: ...","C: ...","D: ..."],"answer":"A: ...","explanation":"..."}`;
  }

  const text = await generateText(prompt);
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as IQuizQuestion;
    }
  } catch {
    console.error('[Gemini] Failed to parse quiz JSON');
  }
  return {
    question: 'What does this code primarily do?',
    options: ['A: Processes data', 'B: Displays output', 'C: Reads a file', 'D: Sorts a list'],
    answer: 'A: Processes data',
    explanation: 'This code processes data as shown in the cell above.'
  };
}

export async function generateFlashcards(cellSource: string): Promise<IFlashcard[]> {
  const prompt = `Given this Python code:
\`\`\`python
${cellSource}
\`\`\`

Generate exactly 3 flashcards. Return ONLY a valid JSON array (no markdown):
[{"front":"Question about a concept","back":"Clear explanation or example"},...]`;

  const text = await generateText(prompt);
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as IFlashcard[];
    }
  } catch {
    console.error('[Gemini] Failed to parse flashcards JSON');
  }
  return [
    { front: 'What does this code do?', back: 'It performs the operations shown in the cell.' },
    { front: 'What library is used here?', back: 'See the import statements in the code.' },
    { front: 'What is the output type?', back: 'Depends on the operations performed.' }
  ];
}

export async function detectAbbreviations(cellSource: string): Promise<IAbbreviation[]> {
  const prompt = `Analyze this Python code for import aliases:
\`\`\`python
${cellSource}
\`\`\`

Return ONLY a valid JSON array (no markdown, return [] if no aliases found):
[{"alias":"np","fullName":"NumPy","description":"Scientific computing library for Python"},...]`;

  const text = await generateText(prompt);
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as IAbbreviation[];
    }
  } catch {
    console.error('[Gemini] Failed to parse abbreviations JSON');
  }
  return [];
}

export async function estimateDifficulty(cellSource: string): Promise<number> {
  const prompt = `Rate the complexity of this Python code on a scale of 1-10. Consider: number of functions, nesting depth, external libraries, logic complexity. Return ONLY a single integer 1-10, nothing else.

Code:
\`\`\`python
${cellSource}
\`\`\``;

  const text = await generateText(prompt);
  const match = text.trim().match(/^([1-9]|10)$/m);
  if (match) { return parseInt(match[1], 10); }
  const fallback = text.match(/\b([1-9]|10)\b/);
  return fallback ? parseInt(fallback[1], 10) : 5;
}

export async function generateDependencyGraph(cells: string[]): Promise<string> {
  const cellsText = cells
    .map((c, i) => `Cell ${i + 1}:\n${c}`)
    .join('\n\n---\n\n');
  const prompt = `Analyze these Python notebook cells and identify variable dependencies between them:

${cellsText}

Return ONLY a valid Mermaid graph TD diagram (no backticks, no markdown, no explanations):
graph TD
  Cell1 -->|varName| Cell2

Keep it concise and accurate.`;

  const text = await generateText(prompt);
  const mermaidMatch = text.match(/graph\s+TD[\s\S]*/);
  return mermaidMatch ? mermaidMatch[0].trim() : 'graph TD\n  Cell1 --> Cell2';
}
