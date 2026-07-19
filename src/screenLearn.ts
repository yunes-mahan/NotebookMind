import { NotebookMindApp } from './nbApp';
import { IChallenge, ChallengeType } from './challenge';
import { generateChallenge } from './gemini';
import { normalizeOutput } from './kernelRunner';
import { burstFrom } from './confetti';
import { XP_BY_DIFFICULTY } from './xp';
import { pointsEngine } from './points';
import { makeCodeField } from './codeField';
import { demoChallenge } from './demoData';
import {
  recordCellAttempt,
  saveNotebookSubmission,
  getNotebookChallenges,
  saveNotebookChallenge
} from './supabaseDB';
import { isConnected } from './supabase';
import { activeBackendCourseId, markNotebookDone, addLocalStats } from './courseStore';
import { button, infoBox, spinner, maxWidth, celebrate } from './uiKit';

// Rotate types so a notebook genuinely uses all the styles.
const ROTATION: ChallengeType[] = ['predict-mc', 'bugfix', 'fillblank'];

const TYPE_LABEL: Record<ChallengeType, string> = {
  bugfix: 'Fix the bug',
  fillblank: 'Write the cell',
  'predict-mc': 'What does this code do?',
  'predict-free': 'Predict the output'
};

interface IStep {
  wrapper: HTMLElement;
  num: HTMLElement;
  title: HTMLElement;
  state: HTMLElement;
  body: HTMLElement;
}

const CARD_BASE =
  'background:var(--surface-card);border-radius:10px;overflow:hidden;' +
  'margin-bottom:12px;transition:opacity 0.2s ease-out;border:1px solid var(--border-default)';

const CAPS_LABEL =
  'font-size:10.5px;font-weight:600;letter-spacing:0.07em;text-transform:uppercase';

export function renderLearn(host: HTMLElement, app: NotebookMindApp): void {
  const root = maxWidth(host, 780);
  const doc = app.doc;
  if (!doc) {
    app.navigate('home');
    return;
  }

  const cells = doc.cells;
  const docKey = doc.key;
  const docName = doc.name;
  let activeIndex = 0;
  let canonicalIndex = 0;
  let completedCount = 0;
  let kernelAvailable = false;
  // Per-notebook telemetry (written to Supabase for the teacher dashboard).
  let nbXpEarned = 0;
  let nbFirstTry = 0;

  // ── Progress row + bar (prototype) ────────────────────────────
  const progressRow = document.createElement('div');
  progressRow.style.cssText =
    'display:flex;align-items:baseline;gap:10px;margin-bottom:7px';
  const progressLabel = document.createElement('span');
  progressLabel.style.cssText =
    'font-size:12.5px;color:var(--text-secondary);font-weight:500';
  const runXp = document.createElement('span');
  runXp.style.cssText =
    'font-size:12px;color:var(--accent-text);font-weight:500;font-family:var(--font-mono);margin-left:auto';
  progressRow.appendChild(progressLabel);
  progressRow.appendChild(runXp);

  const track = document.createElement('div');
  track.style.cssText =
    'height:5px;border-radius:3px;background:var(--gray-800);overflow:hidden;margin-bottom:16px';
  const fill = document.createElement('div');
  fill.style.cssText =
    'height:100%;border-radius:3px;background:linear-gradient(90deg,var(--brand-600),var(--brand-400));transition:width 0.4s var(--ease-out);width:0%';
  track.appendChild(fill);

  const list = document.createElement('div');

  root.appendChild(progressRow);
  root.appendChild(track);
  root.appendChild(list);

  const steps: IStep[] = [];

  function updateProgress(): void {
    progressLabel.textContent = `${completedCount} / ${cells.length} steps complete`;
    runXp.textContent = `+${app.xp.total} XP this run`;
    fill.style.width = `${(completedCount / cells.length) * 100}%`;
  }

  function buildStep(i: number): IStep {
    const wrapper = document.createElement('div');
    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--border-subtle)';
    const num = document.createElement('span');
    num.textContent = String(i + 1).padStart(2, '0');
    const title = document.createElement('span');
    const state = document.createElement('span');
    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    const body = document.createElement('div');

    header.appendChild(num);
    header.appendChild(title);
    header.appendChild(spacer);
    header.appendChild(state);
    wrapper.appendChild(header);
    wrapper.appendChild(body);
    list.appendChild(wrapper);

    const step: IStep = { wrapper, num, title, state, body };
    lockStep(step, i);
    return step;
  }

  function paintHeader(
    step: IStep,
    kind: 'locked' | 'active' | 'done'
  ): void {
    step.num.style.cssText =
      'font-size:11px;font-weight:600;font-family:var(--font-mono);color:' +
      (kind === 'active' ? 'var(--accent-text)' : 'var(--text-quaternary)');
    step.title.style.cssText =
      'font-size:13.5px;font-weight:600;letter-spacing:-0.012em;color:' +
      (kind === 'locked' ? 'var(--text-tertiary)' : 'var(--text-primary)');
    step.state.style.cssText =
      'font-size:11px;font-weight:500;color:' +
      (kind === 'done'
        ? 'var(--green-400)'
        : kind === 'active'
        ? 'var(--accent-text)'
        : 'var(--text-quaternary)');
    step.state.textContent =
      kind === 'done' ? 'Completed' : kind === 'active' ? 'Active' : 'Locked';
  }

  function lockStep(step: IStep, i: number): void {
    step.wrapper.style.cssText = CARD_BASE + ';opacity:0.45';
    paintHeader(step, 'locked');
    step.title.textContent = `Step ${i + 1}`;
    step.body.innerHTML = '';
    step.body.style.cssText =
      'padding:11px 16px;font-size:12px;color:var(--text-quaternary)';
    step.body.textContent = 'Complete the previous step to unlock.';
  }

  function markActiveChrome(i: number): void {
    const step = steps[i];
    step.wrapper.style.cssText =
      CARD_BASE +
      ';border-color:rgba(94,106,210,0.5);box-shadow:0 0 0 3px var(--brand-glow)';
    paintHeader(step, 'active');
    step.body.innerHTML = '';
    step.body.style.cssText =
      'display:flex;flex-direction:column;gap:14px;padding:16px';
  }

  function completeStep(i: number, ch: IChallenge, awarded: boolean): void {
    const step = steps[i];
    step.wrapper.style.cssText = CARD_BASE;
    paintHeader(step, 'done');
    step.title.textContent = `Step ${i + 1} · ${TYPE_LABEL[ch.type]}`;
    if (!awarded) {
      step.state.textContent = 'Revealed';
    }
    // Show the solved cell like the prototype: flush code + output.
    step.body.style.cssText = 'display:flex;flex-direction:column;padding:0';
    step.body.innerHTML = '';
    const pre = document.createElement('pre');
    pre.style.cssText =
      'margin:0;padding:12px 16px;font-family:var(--font-mono);font-size:12px;line-height:1.6;color:var(--text-secondary);background:var(--bg-base);overflow-x:auto;white-space:pre';
    pre.textContent = ch.originalCode;
    step.body.appendChild(pre);
    const outWrap = document.createElement('div');
    outWrap.style.cssText =
      'padding:10px 16px;border-top:1px solid var(--border-subtle)';
    const out = document.createElement('pre');
    out.style.cssText =
      'margin:0;font-family:var(--font-mono);font-size:11.5px;line-height:1.55;color:var(--text-tertiary);white-space:pre-wrap';
    const text = (app.expectedOutputs[i] ?? '').trim();
    out.textContent = text || '↳ produced a chart / no text output';
    outWrap.appendChild(out);
    step.body.appendChild(outWrap);
  }

  async function activate(i: number): Promise<void> {
    activeIndex = i;
    markActiveChrome(i);
    const step = steps[i];
    step.title.textContent = `Step ${i + 1}`;
    step.body.innerHTML = '';
    step.body.appendChild(spinner('Generating challenge…'));
    step.wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });

    let ch = app.challenges[i];
    if (!ch) {
      ch =
        demoChallenge(docKey, i, cells[i]) ??
        (await generateChallenge(
          cells[i],
          ROTATION[i % ROTATION.length],
          app.difficultyBias
        ));
      app.challenges[i] = ch;
      // Cache it so a reload reuses this task instead of regenerating with AI.
      if (isConnected()) {
        void saveNotebookChallenge(docKey, i, ch).catch(() => null);
      }
    }

    step.title.textContent = `Step ${i + 1} · ${TYPE_LABEL[ch.type]}`;
    step.body.innerHTML = '';

    if (ch.type === 'predict-mc') {
      renderPredictMc(step.body, ch);
    } else {
      renderEditorChallenge(step.body, ch);
    }

    // Scroll the freshly activated step into view so the flow continues fluently
    // (done after the challenge renders so the final layout is centered).
    requestAnimationFrame(() =>
      step.wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' })
    );
  }

  // ── Briefing rows ("This cell" / "Your task") ─────────────────
  function briefing(ch: IChallenge): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    if (ch.summary) {
      wrap.appendChild(
        briefRow('This cell', ch.summary, 'var(--text-quaternary)', false)
      );
    }
    const taskText = ch.instructions ?? defaultInstructions(ch.type);
    wrap.appendChild(briefRow('Your task', taskText, 'var(--accent-text)', true));
    return wrap;
  }

  function briefRow(
    label: string,
    text: string,
    labelColor: string,
    strong: boolean
  ): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:baseline';
    const lbl = document.createElement('span');
    lbl.style.cssText = `${CAPS_LABEL};color:${labelColor};flex:0 0 92px`;
    lbl.textContent = label;
    const body = document.createElement('span');
    body.style.cssText = strong
      ? 'font-size:13px;color:var(--text-primary);font-weight:500;line-height:1.55'
      : 'font-size:13px;color:var(--text-secondary);line-height:1.55';
    body.textContent = text;
    row.appendChild(lbl);
    row.appendChild(body);
    return row;
  }

  function defaultInstructions(type: ChallengeType): string {
    switch (type) {
      case 'bugfix':
        return 'There is exactly one small bug in the code below. Find it, fix it, and run the cell so it produces the correct output.';
      case 'fillblank':
        return 'Write the code for this cell so that it runs and produces the expected result.';
      case 'predict-mc':
        return 'This cell has already been run for you — its output is shown below. Read the code and pick what it does.';
      default:
        return 'This cell has already been run. Predict what it outputs in your own words.';
    }
  }

  // ── Challenge panel (accent-subtle box) ───────────────────────
  function challengePanel(ch: IChallenge, kindLabel: string): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText =
      'display:flex;flex-direction:column;gap:10px;padding:14px;background:var(--accent-subtle-bg);border:1px solid rgba(94,106,210,0.35);border-radius:8px';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:8px';
    head.innerHTML =
      `<span style="${CAPS_LABEL};color:var(--accent-text)">${kindLabel}</span>` +
      '<span style="flex:1"></span>' +
      `<span style="font-size:11px;color:var(--text-quaternary);font-family:var(--font-mono)">+${XP_BY_DIFFICULTY[ch.difficulty]} XP</span>`;
    panel.appendChild(head);
    return panel;
  }

  function correctBox(msg: string): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText =
      'display:flex;align-items:center;gap:8px;padding:9px 11px;border-radius:6px;background:var(--green-bg);border:1px solid rgba(23,138,84,0.35);animation:nm-rise 0.2s ease-out both';
    el.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green-400)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' +
      `<span style="font-size:12.5px;color:var(--green-400);font-weight:500">${msg}</span>`;
    return el;
  }

  // ── Solve / advance ───────────────────────────────────────────
  function showSolved(
    host2: HTMLElement,
    ch: IChallenge,
    awarded: boolean,
    origin?: HTMLElement,
    firstTry = false
  ): void {
    app.recordCell(awarded && firstTry);
    app.xp.recordAttempt(awarded && firstTry);

    // Anonymous per-cell telemetry → powers the teacher "struggle" analytics.
    // "succeeded" means solved on the first try (no hints/reveal), so the class
    // success-rate per cell is exactly its first-try rate.
    const courseId = activeBackendCourseId();
    if (courseId) {
      void recordCellAttempt(
        docKey,
        activeIndex,
        awarded && firstTry,
        firstTry ? 1 : 2,
        courseId
      ).catch(() => null);
    }
    if (awarded && firstTry) {
      nbFirstTry += 1;
    }

    if (awarded) {
      const xp = app.xp.award(ch.difficulty);
      nbXpEarned += xp;
      pointsEngine.addPoints(xp, `learn-${ch.type}`);
      celebrate(`+${xp} XP${firstTry ? ' · first try!' : ' · solved'}`);
      if (origin) {
        burstFrom(origin);
      }
      void advance(ch, true);
    } else {
      // Revealed answer — advance promptly (brief pause to register the reveal).
      window.setTimeout(() => void advance(ch, false), 600);
    }
  }

  async function advance(ch: IChallenge, awarded: boolean): Promise<void> {
    completedCount += 1;
    updateProgress();
    const solvedIndex = activeIndex;
    if (kernelAvailable && canonicalIndex === solvedIndex) {
      try {
        await app.runner.run(cells[solvedIndex]);
      } catch {
        // best effort
      }
    }
    if (canonicalIndex === solvedIndex) {
      canonicalIndex = solvedIndex + 1;
    }

    completeStep(solvedIndex, ch, awarded);

    if (solvedIndex + 1 < cells.length) {
      await activate(solvedIndex + 1);
    } else {
      app.recordNotebookComplete();
      // Mark this notebook done for the signed-in user so the home progress card
      // reflects real completion (not the seed) as soon as they finish.
      markNotebookDone(docKey);
      // Fold this run into the persisted learning totals so the home "Solved" /
      // "First try" tiles stay correct without waiting for a reload.
      addLocalStats(cells.length, nbFirstTry);
      // Record the completed run for the teacher dashboard (demo course only).
      const courseId = activeBackendCourseId();
      if (courseId) {
        void saveNotebookSubmission({
          notebookKey: docKey,
          notebookTitle: docName ?? docKey,
          xpEarned: nbXpEarned,
          cellsAttempted: cells.length,
          cellsFirstTry: nbFirstTry,
          courseId
        }).catch(() => null);
      }
      app.navigate('complete');
    }
  }

  // ── Verification for bugfix / fillblank ───────────────────────
  async function verifyCode(
    userCode: string,
    ch: IChallenge
  ): Promise<{ correct: boolean; output: string; errored: boolean }> {
    if (!userCode.trim()) {
      return { correct: false, output: '(empty cell)', errored: false };
    }
    if (kernelAvailable) {
      const res = await app.runner.run(userCode);
      const got = normalizeOutput(res.output);
      const want = app.expectedOutputs[activeIndex] ?? '';
      const correct = !res.errored && got === want;
      if (correct) {
        canonicalIndex = activeIndex + 1;
      }
      return { correct, output: res.output, errored: res.errored };
    }
    const correct =
      normalizeOutput(userCode) === normalizeOutput(ch.originalCode);
    return {
      correct,
      output: correct ? '(matches expected code)' : '(does not match yet)',
      errored: false
    };
  }

  // ── Editor challenge (bugfix / fillblank) ─────────────────────
  function renderEditorChallenge(host2: HTMLElement, ch: IChallenge): void {
    const isBug = ch.type === 'bugfix';
    host2.appendChild(briefing(ch));

    const panel = challengePanel(ch, TYPE_LABEL[ch.type]);

    const field = makeCodeField(ch.presentedCode, { minLines: 5 });
    panel.appendChild(field.dom);

    const helpArea = document.createElement('div');
    const outArea = document.createElement('div');

    let revealedHints = 0;
    let firstTry = true;

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';

    const runBtn = button(isBug ? 'Run & check' : 'Run cell', 'primary');
    const helpBtn = button('Show hint', 'secondary');
    const revealBtn = button('Reveal the answer', 'ghost');
    revealBtn.style.display = 'none';

    controls.appendChild(runBtn);
    controls.appendChild(helpBtn);
    controls.appendChild(revealBtn);

    panel.appendChild(helpArea);
    panel.appendChild(outArea);
    panel.appendChild(controls);
    host2.appendChild(panel);

    function lockAfterSolve(): void {
      field.setEditable(false);
      runBtn.style.display = 'none';
      helpBtn.style.display = 'none';
      revealBtn.style.display = 'none';
    }

    helpBtn.addEventListener('click', () => {
      firstTry = false;
      const idx = revealedHints;
      const hint =
        ch.hints[idx] ?? 'No more hints — inspect each line carefully.';
      revealedHints = idx + 1;
      helpArea.innerHTML = '';
      helpArea.appendChild(hintBox(hint));
      revealBtn.style.display = '';
    });

    revealBtn.addEventListener('click', () => {
      field.setValue(ch.originalCode);
      lockAfterSolve();
      showSolved(host2, ch, false);
    });

    runBtn.addEventListener('click', async () => {
      runBtn.textContent = 'Running…';
      runBtn.disabled = true;
      outArea.innerHTML = '';
      try {
        const res = await verifyCode(field.getValue(), ch);
        if (res.correct) {
          outArea.appendChild(outputPanel(res.output, 'Output'));
          helpArea.innerHTML = '';
          helpArea.appendChild(
            correctBox(firstTry ? 'First try — excellent!' : 'Correct!')
          );
          showSolved(host2, ch, true, runBtn, firstTry);
          return;
        }
        firstTry = false;
        outArea.appendChild(outputPanel(res.output, 'Output'));
        helpArea.innerHTML = '';
        helpArea.appendChild(
          errorBox(
            res.errored
              ? 'The cell raised an error — read the message and try again.'
              : "Run & check failed — the code doesn't do what the task asks yet."
          )
        );
        if (revealedHints === 0 && app.difficultyBias <= 0) {
          revealBtn.style.display = '';
        }
      } catch {
        outArea.appendChild(infoBox('Failed to run the cell.', 'error'));
      } finally {
        runBtn.textContent = isBug ? 'Run & check' : 'Run cell';
        runBtn.disabled = false;
      }
    });
  }

  function outputPanel(text: string, label: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'padding:10px 14px;background:var(--bg-panel);border:1px solid var(--border-subtle);border-radius:7px';
    const lbl = document.createElement('span');
    lbl.style.cssText = `${CAPS_LABEL};font-size:10px;color:var(--text-quaternary);display:block;margin-bottom:6px`;
    lbl.textContent = label;
    const pre = document.createElement('pre');
    pre.style.cssText =
      'margin:0;font-family:var(--font-mono);font-size:11.5px;line-height:1.55;color:var(--text-tertiary);white-space:pre-wrap;max-height:220px;overflow-y:auto';
    pre.textContent =
      text.trim() || '(this cell renders a chart or produces no printed output)';
    wrap.appendChild(lbl);
    wrap.appendChild(pre);
    return wrap;
  }

  // ── Comprehension MC ("what does this code do?") ──────────────
  function renderPredictMc(host2: HTMLElement, ch: IChallenge): void {
    host2.appendChild(briefing(ch));

    const code = document.createElement('pre');
    code.style.cssText =
      'margin:0;padding:12px 14px;font-family:var(--font-mono);font-size:12px;line-height:1.6;color:var(--text-secondary);background:var(--bg-base);border:1px solid var(--border-subtle);border-radius:7px;overflow-x:auto;white-space:pre';
    code.textContent = ch.originalCode;
    host2.appendChild(code);

    host2.appendChild(
      outputPanel(app.expectedOutputs[activeIndex] ?? '', 'Output — already executed')
    );

    const panel = challengePanel(ch, 'Multiple choice');

    const q = document.createElement('span');
    q.style.cssText =
      'font-size:13.5px;font-weight:500;line-height:1.5;color:var(--text-primary)';
    q.textContent = 'What does this code do?';
    panel.appendChild(q);

    const opts = document.createElement('div');
    opts.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    const feedback = document.createElement('div');
    let done = false;
    let firstTry = true;

    (ch.options ?? []).forEach(opt => {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:7px;cursor:pointer;background:var(--bg-base);border:1px solid var(--border-subtle);transition:border-color var(--dur-fast) var(--ease-out)';
      const dot = document.createElement('span');
      dot.style.cssText =
        'flex:0 0 auto;width:13px;height:13px;border-radius:50%;border:1.5px solid var(--border-strong)';
      const lbl = document.createElement('span');
      lbl.style.cssText = 'font-size:13px;color:var(--text-primary);line-height:1.45';
      lbl.textContent = opt;
      row.appendChild(dot);
      row.appendChild(lbl);

      row.addEventListener('mouseenter', () => {
        if (!done) row.style.borderColor = 'var(--border-strong)';
      });
      row.addEventListener('mouseleave', () => {
        if (!done && !row.dataset.picked) {
          row.style.borderColor = 'var(--border-subtle)';
        }
      });
      row.addEventListener('click', () => {
        if (done || row.dataset.picked) {
          return;
        }
        if (mcCorrect(opt, ch.answer ?? '')) {
          done = true;
          row.dataset.picked = '1';
          row.style.borderColor = 'var(--green-400)';
          dot.style.cssText =
            'flex:0 0 auto;width:13px;height:13px;border-radius:50%;border:1.5px solid var(--green-400);background:var(--green-400);box-shadow:inset 0 0 0 2.5px var(--bg-base)';
          feedback.innerHTML = '';
          feedback.appendChild(
            correctBox(firstTry ? 'First try — excellent!' : 'Correct!')
          );
          showSolved(host2, ch, true, row, firstTry);
        } else {
          firstTry = false;
          row.dataset.picked = '1';
          row.style.borderColor = 'var(--red-500)';
          row.style.cursor = 'default';
          feedback.innerHTML = '';
          feedback.appendChild(
            errorBox('Not quite — re-read the cell and its output, then try again.')
          );
        }
      });
      opts.appendChild(row);
    });
    panel.appendChild(opts);
    panel.appendChild(feedback);
    host2.appendChild(panel);
  }

  // ── Preparation ───────────────────────────────────────────────
  async function prepare(): Promise<void> {
    const step0 = steps[0];
    markActiveChrome(0);
    step0.title.textContent = 'Step 1';
    step0.body.innerHTML = '';
    const prep = spinner('Starting Python kernel…');
    step0.body.appendChild(prep);

    try {
      await app.runner.ready();
      kernelAvailable = true;
    } catch {
      kernelAvailable = false;
    }

    if (kernelAvailable && app.expectedOutputs.length !== cells.length) {
      const outs: string[] = [];
      for (let i = 0; i < cells.length; i++) {
        prep.textContent = `Preparing challenges… (${i + 1}/${cells.length})`;
        try {
          const r = await app.runner.run(cells[i]);
          outs.push(normalizeOutput(r.output));
        } catch {
          outs.push('');
        }
      }
      app.expectedOutputs = outs;
      try {
        await app.runner.restart();
      } catch {
        // best effort
      }
      canonicalIndex = 0;
    }

    if (!kernelAvailable) {
      const warn = infoBox(
        'No Python kernel available. Code challenges will check your code against the reference instead of running it.',
        'warn'
      );
      warn.style.marginBottom = '16px';
      root.insertBefore(warn, progressRow);
    }

    // Reuse previously generated challenges for this notebook (no AI re-run).
    if (isConnected()) {
      const saved = await getNotebookChallenges(docKey).catch(() => ({}));
      Object.entries(saved).forEach(([k, payload]) => {
        const i = Number(k);
        if (i >= 0 && i < cells.length && !app.challenges[i]) {
          app.challenges[i] = payload as IChallenge;
        }
      });
    }

    await activate(0);
  }

  // ── Floating difficulty pill (bottom-right, prototype) ────────
  function buildDifficultyPill(): void {
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;bottom:20px;right:24px;z-index:200';

    const currentLabel = (): string =>
      app.difficultyBias < 0 ? 'Easier' : app.difficultyBias > 0 ? 'Harder' : 'Normal';

    const paint = (open: boolean): void => {
      holder.innerHTML = '';
      if (!open) {
        const chipEl = document.createElement('span');
        chipEl.style.cssText =
          'display:inline-flex;align-items:center;gap:7px;padding:8px 13px;background:var(--bg-elevated);border:1px solid var(--border-strong);border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,0.10);cursor:pointer;font-size:12px;font-weight:500;color:var(--text-secondary)';
        chipEl.innerHTML =
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>' +
          '<span>Difficulty</span><span style="color:var(--text-quaternary)">·</span>' +
          `<span style="font-weight:600;color:var(--accent-text)">${currentLabel()}</span>`;
        chipEl.addEventListener('mouseenter', () => {
          chipEl.style.borderColor = 'var(--accent)';
          chipEl.style.color = 'var(--text-primary)';
        });
        chipEl.addEventListener('mouseleave', () => {
          chipEl.style.borderColor = 'var(--border-strong)';
          chipEl.style.color = 'var(--text-secondary)';
        });
        chipEl.addEventListener('click', () => paint(true));
        holder.appendChild(chipEl);
        return;
      }
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;align-items:center;gap:8px;padding:7px 8px 7px 12px;background:var(--bg-elevated);border:1px solid var(--border-strong);border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,0.10);animation:nm-rise 0.14s ease-out both';
      const closeLbl = document.createElement('span');
      closeLbl.style.cssText =
        `display:inline-flex;align-items:center;gap:5px;${CAPS_LABEL};font-size:11px;color:var(--text-quaternary);cursor:pointer`;
      closeLbl.innerHTML =
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>Difficulty';
      closeLbl.addEventListener('click', () => paint(false));
      row.appendChild(closeLbl);
      const optWrap = document.createElement('div');
      optWrap.style.cssText = 'display:flex;gap:2px';
      (
        [
          ['Easier', -1],
          ['Normal', 0],
          ['Harder', 1]
        ] as Array<[string, number]>
      ).forEach(([lbl, bias]) => {
        const on =
          (bias < 0 && app.difficultyBias < 0) ||
          (bias === 0 && app.difficultyBias === 0) ||
          (bias > 0 && app.difficultyBias > 0);
        const opt = document.createElement('span');
        opt.textContent = lbl;
        opt.style.cssText =
          'padding:4px 11px;border-radius:999px;font-size:12px;font-weight:500;cursor:pointer;transition:background-color var(--dur-fast) var(--ease-out);' +
          (on ? 'background:var(--accent);color:#fff' : 'color:var(--text-tertiary)');
        opt.addEventListener('click', () => {
          app.difficultyBias = bias;
          paint(true);
        });
        optWrap.appendChild(opt);
      });
      row.appendChild(optWrap);
      holder.appendChild(row);
    };

    paint(false);
    root.appendChild(holder);
  }

  // Build the full roadmap (all locked), then prepare + activate step 1.
  for (let i = 0; i < cells.length; i++) {
    steps.push(buildStep(i));
  }
  updateProgress();
  buildDifficultyPill();
  void prepare();
}

// ── Feedback boxes (prototype recipes) ──────────────────────────
function hintBox(text: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    'display:flex;align-items:flex-start;gap:8px;padding:8px 11px;border-radius:6px;background:var(--yellow-bg);border:1px solid rgba(178,125,32,0.28)';
  el.innerHTML =
    '<span style="font-size:11px;font-weight:600;color:var(--yellow-500);text-transform:uppercase;letter-spacing:0.05em;padding-top:1px">Hint</span>' +
    `<span style="font-size:12.5px;color:var(--text-secondary);line-height:1.5">${text}</span>`;
  return el;
}

function errorBox(text: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    'display:flex;align-items:center;gap:8px;padding:8px 11px;border-radius:6px;background:var(--red-bg);border:1px solid rgba(192,52,52,0.32)';
  el.innerHTML = `<span style="font-size:12.5px;color:var(--red-400)">${text}</span>`;
  return el;
}

function mcCorrect(selected: string, answer: string): boolean {
  const s = selected.trim();
  const a = answer.trim();
  if (!a) {
    return false;
  }
  if (s === a) {
    return true;
  }
  const labeled = /^[A-D][:.)]/;
  if (labeled.test(s) && labeled.test(a)) {
    return s[0] === a[0];
  }
  if (/^[A-D]$/i.test(a)) {
    return s[0].toUpperCase() === a.toUpperCase();
  }
  return s.toLowerCase() === a.toLowerCase();
}
