import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  IChallenge,
  ChallengeType,
  coerceChallenge,
  fallbackChallenge
} from './challenge';

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
let _anthropicKey: string | null = null;

export function initGemini(apiKey: string): void {
  if (apiKey.startsWith('sk-ant-')) {
    _anthropicKey = apiKey;
  } else {
    _genAI = new GoogleGenerativeAI(apiKey);
  }
}

export function isAiReady(): boolean {
  return _genAI !== null || _anthropicKey !== null;
}

async function generateText(prompt: string): Promise<string> {
  if (_anthropicKey) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': _anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(
        `[NotebookMind][AI] Anthropic request failed (HTTP ${response.status}):`,
        body.slice(0, 600)
      );
      return '';
    }
    const data = await response.json();
    const text = data.content?.[0]?.text ?? '';
    if (!text) {
      console.error('[NotebookMind][AI] Anthropic returned no text:', data);
    }
    return text;
  }

  if (!_genAI) {
    throw new Error('No API key initialized.');
  }
  const model = _genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

export async function explainCell(
  cellSource: string,
  level: 'beginner' | 'intermediate' | 'expert',
  notebookContext?: string
): Promise<string> {
  const contextBlock = notebookContext
    ? `\n\nFor context, here is the whole notebook this cell belongs to. Use it to ground your explanation — what this cell relies on from earlier cells, and what it sets up for later — but keep the explanation focused on the cell above, not the whole notebook:
\`\`\`python
${notebookContext}
\`\`\``
    : '';
  const prompt = `You are a Python tutor. Explain the following code cell at ${level} level. Focus primarily on THIS cell, but take the surrounding notebook into account so your explanation reflects where the cell fits. Be concise, max 3 paragraphs. Use simple language for beginner, technical depth for expert.

Cell to explain:
\`\`\`python
${cellSource}
\`\`\`${contextBlock}`;
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
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as IQuizQuestion;
  } catch {
    console.error('[AI] Failed to parse quiz JSON');
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
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as IFlashcard[];
  } catch {
    console.error('[AI] Failed to parse flashcards JSON');
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
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as IAbbreviation[];
  } catch {
    console.error('[AI] Failed to parse abbreviations JSON');
  }
  return [];
}

export async function estimateDifficulty(cellSource: string): Promise<number> {
  const prompt = `Rate the complexity of this Python code on a scale of 1-10. Return ONLY a single integer 1-10, nothing else.

Code:
\`\`\`python
${cellSource}
\`\`\``;

  const text = await generateText(prompt);
  const match = text.trim().match(/^([1-9]|10)$/m);
  if (match) return parseInt(match[1], 10);
  const fallback = text.match(/\b([1-9]|10)\b/);
  return fallback ? parseInt(fallback[1], 10) : 5;
}

export async function generateChallenge(
  cellSource: string,
  preferredType?: ChallengeType,
  difficultyBias = 0
): Promise<IChallenge> {
  if (!isAiReady()) {
    return fallbackChallenge(cellSource);
  }

  const typeDirective = preferredType
    ? `You MUST set "type" to exactly "${preferredType}" for this cell. Do not choose a different type.`
    : 'Pick the most pedagogically interesting type, and vary it across cells.';

  const biasDirective =
    difficultyBias < 0
      ? ' The learner finds things hard — keep this gentle and pick an easier difficulty.'
      : difficultyBias > 0
      ? ' The learner wants a challenge — make it harder and pick a higher difficulty.'
      : '';

  const prompt = `You design ONE gamified Python learning exercise for a single notebook code cell. Be a thorough, encouraging tutor: write rich, specific guidance.

Challenge types (use ONLY these three — never free text):
- "bugfix": take the code and introduce exactly ONE small, realistic bug (a wrong operator, off-by-one, wrong arg, wrong variable, etc.). Show the FULL code with the bug in "presentedCode" — the learner reads it, spots the single error, fixes it and runs it. The corrected code must reproduce the original output exactly.
- "fillblank": the learner writes the WHOLE cell from scratch. "presentedCode" MUST be an empty string "" — never pre-fill it. Put the guidance in "instructions" and "hints" instead.
- "predict-mc": a COMPREHENSION question. The code has ALREADY been run for the learner (its output is shown to them). Ask "What does this code do?" / what its result/effect is — NOT a trick about exact formatting. Give 4 genuinely plausible options; exactly one is right.

${typeDirective}${biasDirective}

Assign "difficulty": "easy" | "medium" | "hard" | "impossible".

ALWAYS write detailed, SPECIFIC briefing fields that reference the actual variables/functions in this cell (not generic boilerplate):
- "summary": 2-3 sentences explaining what this cell does in the context of a data-analysis notebook — name the real objects it touches (e.g. "builds the 'students' DataFrame", "groups by 'group' and averages 'exam_score'").
- "instructions": precisely what the learner must do in THIS box. For bugfix: state that there is exactly one bug to find and fix and what the cell should produce when correct. For fillblank: spell out, step by step, exactly what code to write here. For predict-mc/predict-free: say the code already ran and they must reason about what it does.

Return ONLY valid JSON (no markdown, no backticks):
{"type":"...","difficulty":"...","summary":"...","instructions":"...","presentedCode":"buggy full code for bugfix; code with ____ (or empty) for fillblank; the ORIGINAL code for predict-mc/predict-free","options":["A: ...","B: ...","C: ...","D: ..."],"answer":"for predict-mc the exact correct option text","hints":["a gentle nudge","a more direct tip"],"explanation":"2-3 sentence explanation of the concept, shown after solving"}

Cell code:
\`\`\`python
${cellSource}
\`\`\``;

  try {
    const text = await generateText(prompt);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return coerceChallenge(JSON.parse(jsonMatch[0]), cellSource);
    }
    console.warn(
      '[NotebookMind][AI] No JSON in challenge response — using generic fallback. Raw response:',
      text
    );
  } catch (err) {
    console.error(
      '[NotebookMind][AI] Challenge generation threw — using generic fallback:',
      err
    );
  }
  return fallbackChallenge(cellSource);
}

export async function gradeFreeText(
  cellSource: string,
  userAnswer: string,
  actualOutput: string
): Promise<{ correct: boolean; feedback: string }> {
  if (!isAiReady()) {
    return {
      correct: false,
      feedback: 'AI grading unavailable. Compare your answer to the real output.'
    };
  }

  const prompt = `A learner predicted the output of this Python cell. Grade leniently — accept answers that capture the essential result even if wording or formatting differs.

Code:
\`\`\`python
${cellSource}
\`\`\`

Actual output:
"""
${actualOutput}
"""

Learner's prediction:
"""
${userAnswer}
"""

Return ONLY valid JSON (no markdown):
{"correct": true or false, "feedback": "one or two encouraging sentences; if wrong, gently point toward the right idea without simply restating the full answer"}`;

  try {
    const text = await generateText(prompt);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        correct: parsed.correct === true,
        feedback:
          typeof parsed.feedback === 'string'
            ? parsed.feedback
            : 'Keep going!'
      };
    }
  } catch {
    console.error('[AI] Failed to grade free text');
  }
  return { correct: false, feedback: 'Could not grade your answer — try again.' };
}

export async function summarizeNotebook(cells: string[]): Promise<string> {
  if (!isAiReady()) {
    return 'This notebook works through a small data-analysis task. Read each cell, run it, and make sure you understand what every step produces.';
  }
  const joined = cells
    .map((c, i) => `# Cell ${i + 1}\n${c}`)
    .join('\n\n');
  const prompt = `You are a teacher writing a short assignment brief for students who will study this Python notebook. In 3-4 sentences, written directly to the student, explain what the notebook is about and what their task is — what they should understand or be able to do by the end. No markdown headers, no bullet points.

Notebook:
${joined}`;
  try {
    return (await generateText(prompt)).trim();
  } catch {
    return 'This notebook works through a small data-analysis task. Read each cell and make sure you understand what every step produces.';
  }
}

export async function explainConnection(
  from: string,
  to: string,
  subject: string
): Promise<string> {
  if (!isAiReady()) {
    return `"${to}" builds on "${from}": the ideas you practise in the first topic are the foundation the second one relies on. Master the earlier notebook and the later one becomes much easier.`;
  }
  const prompt = `In a "${subject}" course, briefly explain (2-3 sentences, directly to the student) how the topic "${to}" builds on or connects to the earlier topic "${from}". Be concrete about which skills carry over. No markdown headers.`;
  try {
    return (await generateText(prompt)).trim();
  } catch {
    return `"${to}" builds directly on "${from}" — the earlier skills are reused here.`;
  }
}

export async function teacherInsights(context: string): Promise<string> {
  const fallback =
    '## Where students struggle\n\n- **Compare study groups** has the lowest first-try rate (38%). The named-aggregation syntax and *mean vs sum* trip students up — add a worked example to the slides.\n- **Compute the exam score** (55%) — the sign of the sleep term causes errors. Consider a short note on reading a formula before running.\n- **Correlation analysis** (47%) — `idxmax` vs `idxmin` is a recurring confusion. A one-line reminder in the teacher note would help.\n\n**Suggested action:** unlock a short review notebook on group-by and correlation before moving to Week 4.';
  if (!isAiReady()) {
    return fallback;
  }
  const prompt = `You are an assistant to a teacher of a "Data Analysis with Python" course. Based on the per-cell performance and student comments below, write a concise report (markdown, use ## headings, bold and - bullets) of WHERE students struggle and 3-4 concrete, actionable recommendations (e.g. clarify a teacher note, add a slide, unlock a review notebook). Be specific to the cells named. Keep it under ~180 words.

${context}`;
  try {
    return (await generateText(prompt)).trim() || fallback;
  } catch {
    return fallback;
  }
}

export async function teacherAsk(
  question: string,
  context: string,
  history: { role: 'user' | 'assistant'; text: string }[] = []
): Promise<string> {
  if (!isAiReady()) {
    return 'AI is unavailable right now. Based on the data, the biggest wins are usually: clarify the group-by note, add a worked correlation example, and unlock a short review notebook before the next week.';
  }
  const convo = history
    .map(t => `${t.role === 'user' ? 'Teacher' : 'Assistant'}: ${t.text}`)
    .join('\n');
  const prompt = `You advise a teacher of a "Data Analysis with Python" course. Use the class data below to answer their question with concrete, actionable suggestions (max ~5 sentences).

Class data:
${context}
${convo ? `\nConversation so far:\n${convo}\n` : ''}
Teacher's question: ${question}

Answer:`;
  try {
    return (await generateText(prompt)).trim();
  } catch {
    return 'Sorry — could not answer right now. Try again.';
  }
}

export interface IChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export async function askAboutCell(
  cellSource: string,
  question: string,
  history: IChatTurn[] = [],
  cellOutput = ''
): Promise<string> {
  if (!isAiReady()) {
    return 'AI is unavailable. Set an API key to ask questions about this cell.';
  }

  const convo = history
    .map(t => `${t.role === 'user' ? 'Student' : 'Tutor'}: ${t.text}`)
    .join('\n');

  const prompt = `You are a friendly, precise Python tutor helping a student understand ONE specific notebook cell. Answer ONLY about this cell and its context. Be concise (max ~4 sentences unless code is needed). If asked something unrelated, gently steer back to the cell.

Cell code:
\`\`\`python
${cellSource}
\`\`\`
${cellOutput ? `\nThis cell's output:\n"""\n${cellOutput}\n"""\n` : ''}
${convo ? `Conversation so far:\n${convo}\n` : ''}
Student's question: ${question}

Answer:`;

  try {
    return (await generateText(prompt)).trim();
  } catch {
    return 'Sorry — I could not answer that right now. Please try again.';
  }
}

export async function generateDependencyGraph(cells: string[]): Promise<string> {
  const cellsText = cells.map((c, i) => `Cell ${i + 1}:\n${c}`).join('\n\n---\n\n');
  const prompt = `Analyze these Python notebook cells and identify variable dependencies between them:

${cellsText}

Return ONLY a valid Mermaid graph TD diagram (no backticks, no markdown, no explanations):
graph TD
  Cell1 -->|varName| Cell2`;

  const text = await generateText(prompt);
  const mermaidMatch = text.match(/graph\s+TD[\s\S]*/);
  return mermaidMatch ? mermaidMatch[0].trim() : 'graph TD\n  Cell1 --> Cell2';
}
