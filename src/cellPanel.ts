import { explainCell } from './gemini';
import { pointsEngine, EXPLAIN_CELL } from './points';
import { ttsEngine } from './tts';
import { progressTracker } from './progressTracker';

type Level = 'beginner' | 'intermediate' | 'expert';

export function renderLearnTab(
  container: HTMLElement,
  cellSource: string,
  cellId: string
): void {
  container.innerHTML = '';

  if (!cellSource.trim()) {
    container.innerHTML = [
      '<div style="color:var(--nm-fg-muted);text-align:center;padding:40px 16px">',
      '<div style="font-size:42px;margin-bottom:14px">📓</div>',
      '<div style="font-size:14px;line-height:1.6">Click a code cell in the notebook<br>to start learning it here.</div>',
      '</div>'
    ].join('');
    return;
  }

  let currentLevel: Level = 'beginner';

  // --- Code block ---
  const codeLabel = document.createElement('div');
  codeLabel.style.cssText =
    'font-size:10px;font-weight:700;color:var(--nm-fg-subtle);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px';
  codeLabel.textContent = 'Current Cell';

  const codeBlock = document.createElement('pre');
  codeBlock.style.cssText = [
    'background:#1E293B;color:#E2E8F0;padding:14px 16px;border-radius:10px',
    'font-family:"Fira Code",monospace,monospace;font-size:12px',
    'overflow-x:auto;white-space:pre-wrap;margin:0 0 16px 0',
    'max-height:155px;overflow-y:auto;line-height:1.55'
  ].join(';');
  codeBlock.textContent = cellSource;

  // --- Level selector ---
  const levelRow = document.createElement('div');
  levelRow.style.cssText = 'display:flex;gap:7px;margin-bottom:14px';

  const levels: Level[] = ['beginner', 'intermediate', 'expert'];
  const levelBtns: HTMLButtonElement[] = [];

  levels.forEach(lvl => {
    const btn = document.createElement('button');
    btn.textContent = lvl.charAt(0).toUpperCase() + lvl.slice(1);
    const active = lvl === 'beginner';
    btn.style.cssText = [
      'flex:1;padding:7px 4px;border-radius:20px;font-size:12px',
      'cursor:pointer;font-weight:600;transition:all 0.2s;border:1.5px solid',
      active
        ? 'background:var(--nm-primary);color:#FFFFFF;border-color:var(--nm-primary)'
        : 'background:#FFFFFF;color:var(--nm-fg-muted);border-color:var(--nm-border)'
    ].join(';');
    btn.addEventListener('click', () => {
      currentLevel = lvl;
      levelBtns.forEach(b => {
        b.style.background = '#FFFFFF';
        b.style.color = 'var(--nm-fg-muted)';
        b.style.borderColor = 'var(--nm-border)';
      });
      btn.style.background = 'var(--nm-primary)';
      btn.style.color = '#FFFFFF';
      btn.style.borderColor = 'var(--nm-primary)';
    });
    levelBtns.push(btn);
    levelRow.appendChild(btn);
  });

  // --- Explain button ---
  const explainBtn = document.createElement('button');
  explainBtn.textContent = '✨ Explain this cell';
  explainBtn.style.cssText = [
    'width:100%;padding:13px;background:var(--nm-primary);color:white;border:none',
    'border-radius:10px;font-size:15px;font-weight:600;cursor:pointer',
    'margin-bottom:16px;transition:background 0.2s;letter-spacing:0.2px'
  ].join(';');
  explainBtn.addEventListener('mouseenter', () => { explainBtn.style.background = 'var(--nm-primary-hover)'; });
  explainBtn.addEventListener('mouseleave', () => { explainBtn.style.background = 'var(--nm-primary)'; });

  const explanationArea = document.createElement('div');

  explainBtn.addEventListener('click', async () => {
    explainBtn.textContent = '⏳ Thinking...';
    explainBtn.disabled = true;
    explanationArea.innerHTML =
      '<div style="color:var(--nm-fg-muted);padding:16px;font-size:14px;text-align:center">Generating explanation...</div>';

    try {
      const text = await explainCell(cellSource, currentLevel);
      explanationArea.innerHTML = '';

      const card = document.createElement('div');
      card.style.cssText = [
        'background:#FFFFFF;border-left:4px solid var(--nm-primary)',
        'border-radius:0 10px 10px 0;padding:16px',
        'box-shadow:0 2px 10px rgba(124,58,237,0.08);margin-bottom:10px'
      ].join(';');

      const expText = document.createElement('div');
      expText.style.cssText =
        'font-size:14px;color:var(--nm-fg);line-height:1.75;white-space:pre-wrap';
      expText.textContent = text;
      card.appendChild(expText);

      // Action row
      const actionRow = document.createElement('div');
      actionRow.style.cssText = 'display:flex;gap:8px;margin-top:14px';

      const listenBtn = document.createElement('button');
      listenBtn.textContent = '🔊 Listen';
      listenBtn.style.cssText = [
        'padding:6px 14px;border:1.5px solid var(--nm-border);border-radius:8px',
        'background:var(--nm-bg-elev-2);color:var(--nm-fg-muted);font-size:12px;cursor:pointer',
        'transition:background 0.15s'
      ].join(';');
      listenBtn.addEventListener('click', () => ttsEngine.speak(text));

      const state = progressTracker.getState(cellId);
      const masteredBtn = document.createElement('button');
      masteredBtn.textContent = state === 'mastered' ? '✅ Mastered' : '☑ Mark Mastered';
      masteredBtn.style.cssText = [
        'padding:6px 14px;border:1.5px solid var(--nm-success);border-radius:8px',
        `background:${state === 'mastered' ? 'var(--nm-success-soft)' : '#FFFFFF'}`,
        'color:var(--nm-success-text);font-size:12px;cursor:pointer;transition:background 0.15s'
      ].join(';');
      masteredBtn.addEventListener('click', () => {
        progressTracker.setState(cellId, 'mastered');
        masteredBtn.textContent = '✅ Mastered';
        masteredBtn.style.background = 'var(--nm-success-soft)';
      });

      actionRow.appendChild(listenBtn);
      actionRow.appendChild(masteredBtn);
      card.appendChild(actionRow);
      explanationArea.appendChild(card);

      pointsEngine.addPoints(EXPLAIN_CELL, 'explain-cell');
    } catch {
      explanationArea.innerHTML =
        '<div style="color:var(--nm-danger);padding:12px;border-radius:8px;background:var(--nm-danger-soft);font-size:14px">Failed to get explanation. Check your Gemini API key.</div>';
    } finally {
      explainBtn.textContent = '✨ Explain this cell';
      explainBtn.disabled = false;
    }
  });

  container.appendChild(codeLabel);
  container.appendChild(codeBlock);
  container.appendChild(levelRow);
  container.appendChild(explainBtn);
  container.appendChild(explanationArea);
}
