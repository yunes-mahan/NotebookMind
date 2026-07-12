import { IQuizQuestion } from './gemini';
import { pointsEngine, QUIZ_CORRECT, BUG_QUIZ_CORRECT } from './points';

type QuizType = 'predict' | 'bugfix' | 'fillblank';

export function renderQuizTab(
  container: HTMLElement,
  cellSource: string,
  onGenerate: (type: QuizType) => Promise<IQuizQuestion>
): void {
  container.innerHTML = '';

  let selectedType: QuizType = 'predict';

  // Type selector row
  const typeRow = document.createElement('div');
  typeRow.style.cssText = 'display:flex;gap:8px;margin-bottom:14px';

  const types: Array<{ key: QuizType; label: string }> = [
    { key: 'predict', label: 'Predict Output' },
    { key: 'bugfix', label: 'Fix the Bug' },
    { key: 'fillblank', label: 'Fill the Blank' }
  ];

  const typeBtns: HTMLButtonElement[] = [];
  types.forEach(t => {
    const btn = document.createElement('button');
    btn.textContent = t.label;
    const isActive = t.key === 'predict';
    btn.style.cssText = [
      'flex:1;padding:8px 4px;border-radius:8px;font-size:11px;cursor:pointer',
      'font-weight:500;transition:all 0.2s;border:1.5px solid',
      isActive
        ? 'background:var(--nm-primary);color:#FFFFFF;border-color:var(--nm-primary)'
        : 'background:#FFFFFF;color:var(--nm-fg-muted);border-color:var(--nm-border)'
    ].join(';');
    btn.addEventListener('click', () => {
      selectedType = t.key;
      typeBtns.forEach(b => {
        b.style.background = '#FFFFFF';
        b.style.color = 'var(--nm-fg-muted)';
        b.style.borderColor = 'var(--nm-border)';
      });
      btn.style.background = 'var(--nm-primary)';
      btn.style.color = '#FFFFFF';
      btn.style.borderColor = 'var(--nm-primary)';
    });
    typeBtns.push(btn);
    typeRow.appendChild(btn);
  });

  // Generate button
  const genBtn = document.createElement('button');
  genBtn.textContent = 'Generate Quiz';
  genBtn.style.cssText = [
    'width:100%;padding:12px;background:var(--nm-primary);color:white;border:none',
    'border-radius:10px;font-size:15px;font-weight:600;cursor:pointer',
    'margin-bottom:16px;transition:background 0.2s'
  ].join(';');
  genBtn.addEventListener('mouseenter', () => { genBtn.style.background = 'var(--nm-primary-hover)'; });
  genBtn.addEventListener('mouseleave', () => { genBtn.style.background = 'var(--nm-primary)'; });

  const questionArea = document.createElement('div');

  if (!cellSource.trim()) {
    questionArea.innerHTML =
      '<div style="color:var(--nm-fg-muted);text-align:center;padding:24px;font-size:14px">Click a code cell in the notebook first.</div>';
  }

  genBtn.addEventListener('click', async () => {
    if (!cellSource.trim()) {
      questionArea.innerHTML =
        '<div style="color:var(--nm-danger);padding:12px;font-size:14px;border-radius:8px;background:var(--nm-danger-soft)">No cell selected. Click a code cell first.</div>';
      return;
    }
    genBtn.textContent = 'Generating...';
    genBtn.disabled = true;
    questionArea.innerHTML =
      '<div style="color:var(--nm-fg-muted);text-align:center;padding:24px;font-size:14px">🤔 Thinking...</div>';

    try {
      const q = await onGenerate(selectedType);
      renderQuestion(questionArea, q, selectedType);
    } catch {
      questionArea.innerHTML =
        '<div style="color:var(--nm-danger);padding:12px;border-radius:8px;background:var(--nm-danger-soft);font-size:14px">Failed to generate quiz. Check your Gemini API key.</div>';
    } finally {
      genBtn.textContent = 'Generate Quiz';
      genBtn.disabled = false;
    }
  });

  container.appendChild(typeRow);
  container.appendChild(genBtn);
  container.appendChild(questionArea);
}

function renderQuestion(
  container: HTMLElement,
  q: IQuizQuestion,
  type: QuizType
): void {
  container.innerHTML = '';

  const card = document.createElement('div');
  card.style.cssText =
    'background:#FFFFFF;border-radius:12px;padding:20px;border:1px solid var(--nm-border);box-shadow:0 2px 8px rgba(0,0,0,0.05)';

  if (type === 'bugfix' || type === 'fillblank') {
    const codeBlock = document.createElement('pre');
    codeBlock.style.cssText = [
      'background:var(--nm-fg);color:var(--nm-bg-elev-2);padding:16px;border-radius:8px',
      'font-family:monospace;font-size:12px;overflow-x:auto',
      'white-space:pre-wrap;margin:0 0 16px 0;line-height:1.5'
    ].join(';');
    codeBlock.textContent = q.question;
    card.appendChild(codeBlock);
  } else {
    const qText = document.createElement('div');
    qText.style.cssText =
      'font-size:15px;font-weight:600;color:var(--nm-fg);margin-bottom:16px;line-height:1.5';
    qText.textContent = q.question;
    card.appendChild(qText);
  }

  const optionsDiv = document.createElement('div');
  optionsDiv.style.cssText = 'display:flex;flex-direction:column;gap:8px';
  let chosen = false;

  q.options.forEach(opt => {
    const optBtn = document.createElement('button');
    optBtn.style.cssText = [
      'padding:10px 16px;border:1.5px solid var(--nm-border);border-radius:8px',
      'background:#FFFFFF;text-align:left;font-size:14px;cursor:pointer',
      'transition:all 0.2s;color:var(--nm-fg);font-family:system-ui,sans-serif'
    ].join(';');
    optBtn.textContent = opt;

    optBtn.addEventListener('mouseenter', () => {
      if (!chosen) { optBtn.style.background = 'var(--nm-bg-elev-2)'; }
    });
    optBtn.addEventListener('mouseleave', () => {
      if (!chosen) { optBtn.style.background = '#FFFFFF'; }
    });

    optBtn.addEventListener('click', () => {
      if (chosen) { return; }
      chosen = true;

      const isCorrect =
        opt === q.answer || opt.charAt(0) === q.answer.charAt(0);

      if (isCorrect) {
        optBtn.style.background = 'var(--nm-success-soft)';
        optBtn.style.borderColor = 'var(--nm-success)';
        optBtn.style.color = 'var(--nm-success-text)';
        const pts = type === 'bugfix' ? BUG_QUIZ_CORRECT : QUIZ_CORRECT;
        pointsEngine.addPoints(pts, `quiz-${type}-correct`);
      } else {
        optBtn.style.background = 'var(--nm-danger-soft)';
        optBtn.style.borderColor = 'var(--nm-danger)';
        optBtn.style.color = 'var(--nm-error-text)';
        optionsDiv.querySelectorAll('button').forEach(b => {
          const bEl = b as HTMLButtonElement;
          if (
            (bEl.textContent ?? '').charAt(0) === q.answer.charAt(0)
          ) {
            bEl.style.background = 'var(--nm-success-soft)';
            bEl.style.borderColor = 'var(--nm-success)';
            bEl.style.color = 'var(--nm-success-text)';
          }
        });
      }

      const expDiv = document.createElement('div');
      expDiv.style.cssText =
        'margin-top:14px;padding:12px;background:var(--nm-accent-soft);border-radius:8px;font-size:13px;color:var(--nm-fg-muted);line-height:1.6';
      expDiv.textContent = '💡 ' + q.explanation;
      card.appendChild(expDiv);
    });

    optionsDiv.appendChild(optBtn);
  });

  card.appendChild(optionsDiv);
  container.appendChild(card);
}
