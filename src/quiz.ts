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
        ? 'background:#7C3AED;color:#FFFFFF;border-color:#7C3AED'
        : 'background:#FFFFFF;color:#6B7280;border-color:#E5E7EB'
    ].join(';');
    btn.addEventListener('click', () => {
      selectedType = t.key;
      typeBtns.forEach(b => {
        b.style.background = '#FFFFFF';
        b.style.color = '#6B7280';
        b.style.borderColor = '#E5E7EB';
      });
      btn.style.background = '#7C3AED';
      btn.style.color = '#FFFFFF';
      btn.style.borderColor = '#7C3AED';
    });
    typeBtns.push(btn);
    typeRow.appendChild(btn);
  });

  // Generate button
  const genBtn = document.createElement('button');
  genBtn.textContent = 'Generate Quiz';
  genBtn.style.cssText = [
    'width:100%;padding:12px;background:#7C3AED;color:white;border:none',
    'border-radius:10px;font-size:15px;font-weight:600;cursor:pointer',
    'margin-bottom:16px;transition:background 0.2s'
  ].join(';');
  genBtn.addEventListener('mouseenter', () => { genBtn.style.background = '#6D28D9'; });
  genBtn.addEventListener('mouseleave', () => { genBtn.style.background = '#7C3AED'; });

  const questionArea = document.createElement('div');

  if (!cellSource.trim()) {
    questionArea.innerHTML =
      '<div style="color:#6B7280;text-align:center;padding:24px;font-size:14px">Click a code cell in the notebook first.</div>';
  }

  genBtn.addEventListener('click', async () => {
    if (!cellSource.trim()) {
      questionArea.innerHTML =
        '<div style="color:#EF4444;padding:12px;font-size:14px;border-radius:8px;background:#FEE2E2">No cell selected. Click a code cell first.</div>';
      return;
    }
    genBtn.textContent = 'Generating...';
    genBtn.disabled = true;
    questionArea.innerHTML =
      '<div style="color:#6B7280;text-align:center;padding:24px;font-size:14px">🤔 Thinking...</div>';

    try {
      const q = await onGenerate(selectedType);
      renderQuestion(questionArea, q, selectedType);
    } catch {
      questionArea.innerHTML =
        '<div style="color:#EF4444;padding:12px;border-radius:8px;background:#FEE2E2;font-size:14px">Failed to generate quiz. Check your Gemini API key.</div>';
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
    'background:#FFFFFF;border-radius:12px;padding:20px;border:1px solid #E5E7EB;box-shadow:0 2px 8px rgba(0,0,0,0.05)';

  if (type === 'bugfix' || type === 'fillblank') {
    const codeBlock = document.createElement('pre');
    codeBlock.style.cssText = [
      'background:#1F2937;color:#F9FAFB;padding:16px;border-radius:8px',
      'font-family:monospace;font-size:12px;overflow-x:auto',
      'white-space:pre-wrap;margin:0 0 16px 0;line-height:1.5'
    ].join(';');
    codeBlock.textContent = q.question;
    card.appendChild(codeBlock);
  } else {
    const qText = document.createElement('div');
    qText.style.cssText =
      'font-size:15px;font-weight:600;color:#1F2937;margin-bottom:16px;line-height:1.5';
    qText.textContent = q.question;
    card.appendChild(qText);
  }

  const optionsDiv = document.createElement('div');
  optionsDiv.style.cssText = 'display:flex;flex-direction:column;gap:8px';
  let chosen = false;

  q.options.forEach(opt => {
    const optBtn = document.createElement('button');
    optBtn.style.cssText = [
      'padding:10px 16px;border:1.5px solid #E5E7EB;border-radius:8px',
      'background:#FFFFFF;text-align:left;font-size:14px;cursor:pointer',
      'transition:all 0.2s;color:#1F2937;font-family:system-ui,sans-serif'
    ].join(';');
    optBtn.textContent = opt;

    optBtn.addEventListener('mouseenter', () => {
      if (!chosen) { optBtn.style.background = '#F9FAFB'; }
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
        optBtn.style.background = '#D1FAE5';
        optBtn.style.borderColor = '#10B981';
        optBtn.style.color = '#065F46';
        const pts = type === 'bugfix' ? BUG_QUIZ_CORRECT : QUIZ_CORRECT;
        pointsEngine.addPoints(pts, `quiz-${type}-correct`);
      } else {
        optBtn.style.background = '#FEE2E2';
        optBtn.style.borderColor = '#EF4444';
        optBtn.style.color = '#991B1B';
        optionsDiv.querySelectorAll('button').forEach(b => {
          const bEl = b as HTMLButtonElement;
          if (
            (bEl.textContent ?? '').charAt(0) === q.answer.charAt(0)
          ) {
            bEl.style.background = '#D1FAE5';
            bEl.style.borderColor = '#10B981';
            bEl.style.color = '#065F46';
          }
        });
      }

      const expDiv = document.createElement('div');
      expDiv.style.cssText =
        'margin-top:14px;padding:12px;background:#EDE9FE;border-radius:8px;font-size:13px;color:#4B5563;line-height:1.6';
      expDiv.textContent = '💡 ' + q.explanation;
      card.appendChild(expDiv);
    });

    optionsDiv.appendChild(optBtn);
  });

  card.appendChild(optionsDiv);
  container.appendChild(card);
}
