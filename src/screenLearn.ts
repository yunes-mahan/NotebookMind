import { NotebookMindApp } from './nbApp';
import { IChallenge, ChallengeType, Difficulty } from './challenge';
import { generateChallenge, summarizeNotebook } from './gemini';
import { normalizeOutput } from './kernelRunner';
import { burstFrom } from './confetti';
import { DIFFICULTY_META, XP_BY_DIFFICULTY } from './xp';
import { pointsEngine } from './points';
import { makeCodeField } from './codeField';
import { demoChallenge, demoAssignment } from './demoData';
import { button, infoBox, spinner, maxWidth } from './uiKit';

// Rotate types so a notebook genuinely uses all the styles.
const ROTATION: ChallengeType[] = ['predict-mc', 'bugfix', 'fillblank'];

const TYPE_LABEL: Record<ChallengeType, string> = {
  bugfix: '🐛 Find the bug',
  fillblank: '✏️ Fill in the cell',
  'predict-mc': '🔍 What does this code do?',
  'predict-free': '✍️ Predict the output'
};

interface IStep {
  wrapper: HTMLElement;
  status: HTMLElement;
  title: HTMLElement;
  chip: HTMLElement;
  body: HTMLElement;
}

const CARD_BASE =
  'background:#fff;border-radius:var(--nm-radius-lg);padding:16px 18px;' +
  'margin-bottom:12px;transition:all 0.2s;border:1px solid var(--nm-border)';

export function renderLearn(host: HTMLElement, app: NotebookMindApp): void {
  const root = maxWidth(host);
  const doc = app.doc;
  if (!doc) {
    app.navigate('home');
    return;
  }

  const cells = doc.cells;
  const docName = doc.name;
  const docKey = doc.key;
  let activeIndex = 0;
  let canonicalIndex = 0;
  let completedCount = 0;
  let kernelAvailable = false;

  // Header: title + a short description of the notebook (not "Learn mode …").
  const headerWrap = document.createElement('div');
  headerWrap.style.cssText = 'margin-bottom:22px';
  const headerTitle = document.createElement('div');
  headerTitle.style.cssText =
    'font-size:26px;font-weight:800;letter-spacing:-0.02em;color:var(--nm-text);line-height:1.15';
  headerTitle.textContent = docName;
  const headerSub = document.createElement('div');
  headerSub.style.cssText =
    'font-size:14px;color:var(--nm-text-secondary);margin-top:7px;line-height:1.6';
  const seededDesc = demoAssignment(docKey);
  headerSub.textContent =
    seededDesc ?? 'Work through each step to unlock the next and earn XP.';
  headerWrap.appendChild(headerTitle);
  headerWrap.appendChild(headerSub);
  root.appendChild(headerWrap);

  // For non-seeded notebooks, fetch a short description in the background.
  if (!seededDesc) {
    void summarizeNotebook(cells)
      .then(text => {
        headerSub.textContent = text;
      })
      .catch(() => undefined);
  }

  const progressLabel = document.createElement('div');
  progressLabel.style.cssText =
    'font-size:13px;font-weight:600;color:var(--nm-text-secondary);margin-bottom:8px;display:flex;justify-content:space-between';

  const track = document.createElement('div');
  track.style.cssText =
    'background:var(--nm-border);border-radius:6px;height:7px;overflow:hidden;margin-bottom:22px';
  const fill = document.createElement('div');
  fill.style.cssText =
    'height:100%;background:linear-gradient(90deg,var(--nm-accent),var(--nm-success));border-radius:6px;transition:width 0.4s';
  track.appendChild(fill);

  const list = document.createElement('div');

  root.appendChild(progressLabel);
  root.appendChild(track);
  root.appendChild(list);

  const steps: IStep[] = [];

  function updateProgress(): void {
    progressLabel.innerHTML =
      `<span>${completedCount} / ${cells.length} steps complete</span>` +
      `<span>⭐ ${app.xp.total} XP this run</span>`;
    fill.style.width = `${(completedCount / cells.length) * 100}%`;
  }

  function statusBadge(): HTMLElement {
    const b = document.createElement('div');
    b.style.cssText = [
      'width:26px;height:26px;border-radius:50%;flex-shrink:0',
      'display:flex;align-items:center;justify-content:center',
      'font-size:13px;font-weight:700'
    ].join(';');
    return b;
  }

  function setDifficulty(step: IStep, d: Difficulty): void {
    const meta = DIFFICULTY_META[d];
    step.chip.style.display = 'inline-block';
    step.chip.style.cssText = [
      'display:inline-block',
      `background:${meta.color}1A;color:${meta.color}`,
      'padding:3px 11px;border-radius:20px;font-size:12px;font-weight:700;flex-shrink:0'
    ].join(';');
    step.chip.textContent = `${meta.label} · ${XP_BY_DIFFICULTY[d]} XP`;
  }

  function buildStep(i: number): IStep {
    const wrapper = document.createElement('div');
    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;align-items:center;gap:11px';
    const status = statusBadge();
    const title = document.createElement('div');
    title.style.cssText =
      'flex:1;min-width:0;font-size:15px;font-weight:700;color:var(--nm-text)';
    const chip = document.createElement('span');
    chip.style.display = 'none';
    const body = document.createElement('div');
    body.style.cssText = 'margin-top:16px';

    header.appendChild(status);
    header.appendChild(title);
    header.appendChild(chip);
    wrapper.appendChild(header);
    wrapper.appendChild(body);
    list.appendChild(wrapper);

    const step: IStep = { wrapper, status, title, chip, body };
    lockStep(step, i);
    return step;
  }

  function lockStep(step: IStep, i: number): void {
    step.wrapper.style.cssText = CARD_BASE + ';opacity:0.6;background:var(--nm-bg-subtle)';
    step.status.style.background = 'var(--nm-border)';
    step.status.style.color = 'var(--nm-text-muted)';
    step.status.textContent = '🔒';
    step.title.textContent = `Step ${i + 1} · Locked`;
    step.title.style.color = 'var(--nm-text-muted)';
    step.chip.style.display = 'none';
    step.body.style.display = 'none';
    step.body.innerHTML = '';
  }

  function markActiveChrome(i: number): void {
    const step = steps[i];
    step.wrapper.style.cssText =
      CARD_BASE + ';border-color:var(--nm-accent);box-shadow:var(--nm-shadow-md)';
    step.status.style.background = 'var(--nm-accent)';
    step.status.style.color = '#fff';
    step.status.textContent = String(i + 1);
    step.title.style.color = 'var(--nm-text)';
    step.body.style.display = 'block';
  }

  function completeStep(i: number, ch: IChallenge, awarded: boolean): void {
    const step = steps[i];
    step.wrapper.style.cssText =
      CARD_BASE + ';border-color:var(--nm-success)';
    step.status.style.background = 'var(--nm-success)';
    step.status.style.color = '#fff';
    step.status.textContent = '✓';
    step.title.textContent = `Step ${i + 1} · ${TYPE_LABEL[ch.type]}`;
    step.title.style.color = 'var(--nm-text)';
    const note = document.createElement('span');
    note.style.cssText =
      'margin-left:8px;font-size:12px;font-weight:600;color:var(--nm-success-text)';
    note.textContent = awarded ? `+${XP_BY_DIFFICULTY[ch.difficulty]} XP` : 'revealed';
    step.title.appendChild(note);
    setDifficulty(step, ch.difficulty);
    // Show the solved cell the way a real notebook would: code + its output.
    step.body.style.display = 'block';
    step.body.innerHTML = '';
    step.body.appendChild(
      notebookCellView(ch.originalCode, app.expectedOutputs[i] ?? '', i + 1)
    );
  }

  function notebookCellView(
    code: string,
    output: string,
    execCount: number
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px';

    // Labels sit ABOVE the blocks so code/output use the full width.
    const promptStyle =
      'font-family:var(--nm-font-mono);font-size:11px;font-weight:700;margin:2px 0 2px';

    const inLabel = document.createElement('div');
    inLabel.style.cssText = `${promptStyle};color:var(--nm-accent)`;
    inLabel.textContent = `In [${execCount}]`;
    const cv = makeCodeField(code, { readOnly: true });
    cv.dom.style.width = '100%';
    wrap.appendChild(inLabel);
    wrap.appendChild(cv.dom);

    const text = output.trim();
    const outLabel = document.createElement('div');
    outLabel.style.cssText = `${promptStyle};color:var(--nm-text-faint);margin-top:8px`;
    outLabel.textContent = `Out [${execCount}]`;
    const outBox = document.createElement('pre');
    outBox.style.cssText = [
      'width:100%;box-sizing:border-box;margin:0;font-family:var(--nm-font-mono);font-size:12px;line-height:1.5',
      'white-space:pre-wrap;color:var(--nm-text);padding:2px 0;overflow-x:auto'
    ].join(';');
    outBox.textContent = text || '↳ produced a chart / no text output';
    if (!text) {
      outBox.style.color = 'var(--nm-text-faint)';
      outBox.style.fontStyle = 'italic';
    }
    wrap.appendChild(outLabel);
    wrap.appendChild(outBox);

    return wrap;
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
    }

    step.title.textContent = `Step ${i + 1} · ${TYPE_LABEL[ch.type]}`;
    setDifficulty(step, ch.difficulty);
    step.body.innerHTML = '';

    if (ch.type === 'predict-mc') {
      renderPredictMc(step.body, ch);
    } else {
      renderEditorChallenge(step.body, ch);
    }
  }

  // ── Briefing panel ────────────────────────────────────────────
  function briefing(ch: IChallenge): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'background:var(--nm-bg-subtle);border:1px solid var(--nm-border);border-radius:var(--nm-radius);padding:14px 16px;margin-bottom:16px;display:flex;flex-direction:column;gap:12px';

    if (ch.summary) {
      wrap.appendChild(briefRow('📋', 'What this cell does', ch.summary));
    }
    const taskText = ch.instructions ?? defaultInstructions(ch.type);
    wrap.appendChild(briefRow('🎯', 'Your task', taskText));
    return wrap;
  }

  function briefRow(emoji: string, label: string, text: string): HTMLElement {
    const row = document.createElement('div');
    const lbl = document.createElement('div');
    lbl.style.cssText =
      'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--nm-text-muted);margin-bottom:3px';
    lbl.textContent = `${emoji} ${label}`;
    const body = document.createElement('div');
    body.style.cssText =
      'font-size:13.5px;color:var(--nm-text);line-height:1.6';
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

  // ── Solve / advance ───────────────────────────────────────────
  function setRevealedChip(step: IStep): void {
    step.chip.style.cssText = [
      'display:inline-block;background:var(--nm-bg-section);color:var(--nm-text-muted)',
      'padding:3px 11px;border-radius:20px;font-size:12px;font-weight:700;flex-shrink:0'
    ].join(';');
    step.chip.textContent = '👀 Revealed';
  }

  function showSolved(
    host: HTMLElement,
    ch: IChallenge,
    awarded: boolean,
    origin?: HTMLElement,
    firstTry = false
  ): void {
    app.recordCell(awarded && firstTry);
    app.xp.recordAttempt(awarded && firstTry);

    if (awarded) {
      const xp = app.xp.award(ch.difficulty);
      pointsEngine.addPoints(xp, `learn-${ch.type}`);
      if (origin) {
        burstFrom(origin);
      }
      // Advance immediately — no delay. The burst plays over the next step.
      void advance(ch, true);
    } else {
      // Reveal: mark it in the chip and move on automatically (no button).
      setRevealedChip(steps[activeIndex]);
      window.setTimeout(() => void advance(ch, false), 2200);
    }
  }

  async function advance(ch: IChallenge, awarded: boolean): Promise<void> {
    completedCount += 1;
    updateProgress();
    const solvedIndex = activeIndex;
    // Make sure the kernel holds correct state for the cell we just solved.
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
  function renderEditorChallenge(host: HTMLElement, ch: IChallenge): void {
    const isBug = ch.type === 'bugfix';
    host.appendChild(briefing(ch));

    const field = makeCodeField(ch.presentedCode, { minLines: 5 });
    host.appendChild(field.dom);

    const outArea = document.createElement('div');
    outArea.style.marginTop = '14px';
    const helpArea = document.createElement('div');
    helpArea.style.marginTop = '12px';

    let revealedHints = 0;
    let firstTry = true;

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:10px;margin-top:14px;flex-wrap:wrap';

    const runBtn = button(isBug ? '▶ Run & check fix' : '▶ Run cell', 'accent');
    runBtn.style.flex = '1';

    const helpBtn = button('💡 Show hint', 'secondary');

    // Subtle grey fill so it sits quietly behind the main actions.
    const revealBtn = document.createElement('button');
    revealBtn.textContent = 'Show solution';
    revealBtn.style.cssText = [
      'padding:9px 15px;border-radius:var(--nm-radius-md);cursor:pointer;display:none',
      'font:500 14px var(--nm-font-sans);color:var(--nm-fg-strong)',
      'background:var(--nm-bg-section);border:1px solid var(--nm-border);transition:all 160ms var(--nm-ease)'
    ].join(';');
    revealBtn.addEventListener('mouseenter', () => {
      revealBtn.style.background = 'var(--nm-border)';
    });
    revealBtn.addEventListener('mouseleave', () => {
      revealBtn.style.background = 'var(--nm-bg-section)';
    });

    controls.appendChild(runBtn);
    controls.appendChild(helpBtn);
    controls.appendChild(revealBtn);

    host.appendChild(controls);
    host.appendChild(helpArea);
    host.appendChild(outArea);

    function lockAfterSolve(): void {
      field.setEditable(false);
      runBtn.style.display = 'none';
      helpBtn.style.display = 'none';
      revealBtn.style.display = 'none';
    }

    helpBtn.addEventListener('click', () => {
      firstTry = false; // taking a hint means it's no longer a clean first try
      const idx = revealedHints;
      const hint =
        ch.hints[idx] ?? 'No more hints — inspect each line carefully.';
      revealedHints = idx + 1;
      helpArea.innerHTML = '';
      helpArea.appendChild(hintBox(`💡 Hint ${idx + 1}: ${hint}`));
      // After a hint, offer the full solution.
      revealBtn.style.display = 'block';
    });

    revealBtn.addEventListener('click', () => {
      field.setValue(ch.originalCode);
      lockAfterSolve();
      showSolved(host, ch, false);
    });

    runBtn.addEventListener('click', async () => {
      runBtn.textContent = '⏳ Running…';
      runBtn.disabled = true;
      outArea.innerHTML = '';
      try {
        const res = await verifyCode(field.getValue(), ch);
        if (res.correct) {
          // Keep runBtn visible so the success burst can originate from it
          // (advance() re-renders the step immediately afterwards).
          outArea.appendChild(renderOutput(res.output, true));
          showSolved(host, ch, true, runBtn, firstTry);
          return;
        }
        firstTry = false;
        outArea.appendChild(renderOutput(res.output, false));
        // Show the "not correct" feedback in the same place + style as a hint, but red.
        helpArea.innerHTML = '';
        helpArea.appendChild(
          errorBox(
            res.errored
              ? '❌ The cell raised an error — read the message above and try again.'
              : '❌ Not quite — the output does not match yet. Try again or take a hint.'
          )
        );
      } catch {
        outArea.appendChild(infoBox('Failed to run the cell.', 'error'));
      } finally {
        runBtn.textContent = isBug ? '▶ Run & check fix' : '▶ Run cell';
        runBtn.disabled = false;
      }
    });
  }

  function renderOutput(text: string, ok: boolean): HTMLElement {
    const wrap = document.createElement('div');
    const lbl = document.createElement('div');
    lbl.style.cssText =
      'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:5px;color:' +
      (ok ? 'var(--nm-success-text)' : 'var(--nm-text-muted)');
    lbl.textContent = ok ? 'Output ✓' : 'Output';
    const pre = document.createElement('pre');
    pre.style.cssText = [
      'background:var(--nm-code-bg);color:var(--nm-code-text);padding:13px 15px;border-radius:var(--nm-radius)',
      'font-family:var(--nm-font-mono);font-size:12px;line-height:1.5',
      'overflow-x:auto;white-space:pre-wrap;margin:0;max-height:220px;overflow-y:auto',
      `border-left:4px solid ${ok ? 'var(--nm-success)' : 'var(--nm-border-strong)'}`
    ].join(';');
    pre.textContent = text.trim() || '(no output)';
    wrap.appendChild(lbl);
    wrap.appendChild(pre);
    return wrap;
  }

  function executedOutput(): HTMLElement {
    const text = app.expectedOutputs[activeIndex] ?? '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin:14px 0';
    const lbl = document.createElement('div');
    lbl.style.cssText =
      'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:5px;color:var(--nm-text-muted)';
    lbl.textContent = 'Output — already executed';
    const pre = document.createElement('pre');
    pre.style.cssText = [
      'background:var(--nm-code-bg);color:var(--nm-code-text);padding:13px 15px;border-radius:var(--nm-radius)',
      'font-family:var(--nm-font-mono);font-size:12px;line-height:1.5',
      'overflow-x:auto;white-space:pre-wrap;margin:0;max-height:220px;overflow-y:auto',
      'border-left:4px solid var(--nm-accent)'
    ].join(';');
    pre.textContent =
      text.trim() ||
      '(this cell renders a chart or produces no printed output)';
    wrap.appendChild(lbl);
    wrap.appendChild(pre);
    return wrap;
  }

  // ── Comprehension MC ("what does this code do?") ──────────────
  function renderPredictMc(host: HTMLElement, ch: IChallenge): void {
    host.appendChild(briefing(ch));
    const code = makeCodeField(ch.originalCode, { readOnly: true });
    host.appendChild(code.dom);
    host.appendChild(executedOutput());

    const q = document.createElement('div');
    q.style.cssText =
      'font-size:15px;font-weight:700;color:var(--nm-text);margin:16px 0 12px';
    q.textContent = 'What does this code do?';
    host.appendChild(q);

    const opts = document.createElement('div');
    opts.style.cssText = 'display:flex;flex-direction:column;gap:10px';
    let done = false;
    let firstTry = true;

    (ch.options ?? []).forEach(opt => {
      const b = document.createElement('button');
      b.textContent = opt;
      b.style.cssText = [
        'padding:13px 16px;border:1px solid var(--nm-border);border-radius:var(--nm-radius)',
        'background:#fff;text-align:left;font-size:14px;cursor:pointer',
        'transition:all 0.16s;color:var(--nm-text);font-family:var(--nm-font)'
      ].join(';');
      b.addEventListener('mouseenter', () => {
        if (!done) {
          b.style.background = 'var(--nm-bg-subtle)';
        }
      });
      b.addEventListener('mouseleave', () => {
        if (!done) {
          b.style.background = '#fff';
        }
      });
      b.addEventListener('click', () => {
        if (done) {
          return;
        }
        if (mcCorrect(opt, ch.answer ?? '')) {
          done = true;
          b.style.background = 'var(--nm-success-bg)';
          b.style.borderColor = 'var(--nm-success)';
          b.style.color = 'var(--nm-success-text)';
          opts.querySelectorAll('button').forEach(x => {
            (x as HTMLButtonElement).disabled = true;
          });
          showSolved(host, ch, true, b, firstTry);
        } else {
          firstTry = false;
          b.style.background = 'var(--nm-error-bg)';
          b.style.borderColor = 'var(--nm-error)';
          b.style.color = 'var(--nm-error-text)';
          b.disabled = true;
        }
      });
      opts.appendChild(b);
    });
    host.appendChild(opts);
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
        '⚠️ No Python kernel available. Code challenges will check your code against the reference instead of running it.',
        'warn'
      );
      warn.style.marginBottom = '16px';
      root.insertBefore(warn, progressLabel);
    }

    await activate(0);
  }

  // ── Floating difficulty panel (bottom-right popup) ────────────
  function buildDifficultyPanel(): void {
    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:fixed;bottom:20px;right:20px;z-index:9000;width:210px',
      'background:#fff;border:1px solid var(--nm-border);border-radius:var(--nm-radius-lg)',
      'box-shadow:var(--nm-shadow-lg);padding:13px 14px;font-family:var(--nm-font)'
    ].join(';');

    const title = document.createElement('div');
    title.style.cssText =
      'font-size:12px;font-weight:700;color:var(--nm-text);margin-bottom:2px';
    title.textContent = '⚖️ Difficulty';
    const help = document.createElement('div');
    help.style.cssText =
      'font-size:11.5px;color:var(--nm-text-muted);margin-bottom:10px;line-height:1.45';
    help.textContent = 'Too easy or too hard? Tune upcoming steps to your level.';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px';
    const easier = button('😌 Easier', 'ghost');
    const harder = button('🔥 Harder', 'secondary');
    easier.style.flex = '1';
    harder.style.flex = '1';
    easier.style.padding = '7px 8px';
    harder.style.padding = '7px 8px';

    const status = document.createElement('div');
    status.style.cssText =
      'font-size:11px;color:var(--nm-text-secondary);margin-top:9px;text-align:center;font-weight:600';

    const refresh = (): void => {
      const b = app.difficultyBias;
      status.textContent =
        b < 0 ? '🟢 Easier mode on' : b > 0 ? '🔴 Harder mode on' : 'Balanced';
    };
    refresh();

    easier.addEventListener('click', () => {
      app.difficultyBias = Math.max(-2, app.difficultyBias - 1);
      refresh();
    });
    harder.addEventListener('click', () => {
      app.difficultyBias = Math.min(2, app.difficultyBias + 1);
      refresh();
    });

    row.appendChild(easier);
    row.appendChild(harder);
    panel.appendChild(title);
    panel.appendChild(help);
    panel.appendChild(row);
    panel.appendChild(status);
    root.appendChild(panel);
  }

  // Build the full roadmap (all locked), then prepare + activate step 1.
  for (let i = 0; i < cells.length; i++) {
    steps.push(buildStep(i));
  }
  updateProgress();
  buildDifficultyPanel();
  void prepare();
}

// Hint and "not correct" feedback share one style; only the colour differs.
function calloutBox(text: string, rgb: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = [
    `background:rgba(${rgb},0.12);border:1px solid rgba(${rgb},0.45)`,
    'border-radius:var(--nm-radius);padding:11px 14px;font-size:13px;line-height:1.6;font-weight:500',
    `color:rgb(${rgb})`
  ].join(';');
  el.textContent = text;
  return el;
}

function hintBox(text: string): HTMLElement {
  // Yellow.
  const box = calloutBox(text, '161,98,7');
  box.style.background = 'rgba(234,179,8,0.14)';
  box.style.borderColor = 'rgba(202,138,4,0.5)';
  return box;
}

function errorBox(text: string): HTMLElement {
  // Red, same shape as the hint.
  const box = calloutBox(text, '180,35,24');
  box.style.background = 'rgba(217,45,32,0.10)';
  box.style.borderColor = 'rgba(217,45,32,0.4)';
  return box;
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
