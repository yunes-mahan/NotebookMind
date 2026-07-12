import { IFlashcard } from './gemini';
import { pointsEngine, FLASHCARD_EASY } from './points';

export function renderFlashcardTab(
  container: HTMLElement,
  cellSource: string,
  onGenerate: () => Promise<IFlashcard[]>
): void {
  container.innerHTML = '';

  if (!cellSource.trim()) {
    container.innerHTML =
      '<div style="color:var(--nm-fg-muted);text-align:center;padding:32px;font-size:14px">Click a code cell to generate flashcards.</div>';
    return;
  }

  let cards: IFlashcard[] = [];
  let index = 0;
  let flipped = false;

  const genBtn = document.createElement('button');
  genBtn.textContent = 'Generate Flashcards';
  genBtn.style.cssText = [
    'width:100%;padding:12px;background:var(--nm-primary);color:white;border:none',
    'border-radius:10px;font-size:15px;font-weight:600;cursor:pointer',
    'margin-bottom:20px;transition:background 0.2s'
  ].join(';');
  genBtn.addEventListener('mouseenter', () => { genBtn.style.background = 'var(--nm-primary-hover)'; });
  genBtn.addEventListener('mouseleave', () => { genBtn.style.background = 'var(--nm-primary)'; });

  const flashArea = document.createElement('div');

  genBtn.addEventListener('click', async () => {
    genBtn.textContent = 'Generating...';
    genBtn.disabled = true;
    flashArea.innerHTML =
      '<div style="color:var(--nm-fg-muted);text-align:center;padding:24px">🃏 Creating flashcards...</div>';

    try {
      cards = await onGenerate();
      index = 0;
      flipped = false;
      renderCard();
    } catch {
      flashArea.innerHTML =
        '<div style="color:var(--nm-danger);padding:12px;border-radius:8px;background:var(--nm-danger-soft)">Failed to generate flashcards.</div>';
    } finally {
      genBtn.textContent = 'Regenerate';
      genBtn.disabled = false;
    }
  });

  container.appendChild(genBtn);
  container.appendChild(flashArea);

  function renderCard(): void {
    flashArea.innerHTML = '';
    if (cards.length === 0) { return; }

    const progress = document.createElement('div');
    progress.style.cssText =
      'text-align:center;font-size:13px;color:var(--nm-fg-muted);margin-bottom:12px;font-weight:500';
    progress.textContent = `Card ${index + 1} of ${cards.length}`;

    // Flip card wrapper
    if (!document.querySelector('#nm-card-style')) {
      const s = document.createElement('style');
      s.id = 'nm-card-style';
      s.textContent =
        '.nm-card{transform-style:preserve-3d;transition:transform 0.5s}' +
        '.nm-card.flipped{transform:rotateY(180deg)}' +
        '.nm-card-face{backface-visibility:hidden;-webkit-backface-visibility:hidden}';
      document.head.appendChild(s);
    }

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'perspective:1000px;margin-bottom:16px;cursor:pointer';

    const card = document.createElement('div');
    card.className = 'nm-card';
    card.style.cssText = 'position:relative;width:100%;min-height:170px';

    const front = document.createElement('div');
    front.className = 'nm-card-face';
    front.style.cssText = [
      'position:absolute;width:100%;min-height:170px',
      'background:linear-gradient(135deg,var(--nm-primary) 0%,var(--nm-primary-hover) 100%)',
      'border-radius:14px;display:flex;align-items:center;justify-content:center',
      'padding:24px;box-sizing:border-box'
    ].join(';');
    const frontText = document.createElement('div');
    frontText.style.cssText =
      'color:white;font-size:17px;font-weight:600;text-align:center;line-height:1.5';
    frontText.textContent = cards[index].front;
    front.appendChild(frontText);

    const back = document.createElement('div');
    back.className = 'nm-card-face';
    back.style.cssText = [
      'position:absolute;width:100%;min-height:170px;transform:rotateY(180deg)',
      'background:#FFFFFF;border-radius:14px;border:2px solid var(--nm-primary)',
      'display:flex;align-items:center;justify-content:center',
      'padding:24px;box-sizing:border-box'
    ].join(';');
    const backText = document.createElement('div');
    backText.style.cssText =
      'color:var(--nm-fg);font-size:14px;text-align:center;line-height:1.6';
    backText.textContent = cards[index].back;
    back.appendChild(backText);

    card.appendChild(front);
    card.appendChild(back);
    wrapper.appendChild(card);

    const hint = document.createElement('div');
    hint.style.cssText =
      'text-align:center;font-size:11px;color:var(--nm-fg-subtle);margin-top:4px;margin-bottom:12px';
    hint.textContent = 'Click card to flip';

    wrapper.addEventListener('click', () => {
      flipped = !flipped;
      if (flipped) {
        card.classList.add('flipped');
      } else {
        card.classList.remove('flipped');
      }
    });

    // Rating buttons
    const ratingRow = document.createElement('div');
    ratingRow.style.cssText = 'display:flex;gap:8px;margin-bottom:12px';

    const ratings = [
      { label: '😕 Hard', pts: 0, color: 'var(--nm-danger)' },
      { label: '😐 Okay', pts: 1, color: 'var(--nm-warning)' },
      { label: '😊 Easy', pts: FLASHCARD_EASY, color: 'var(--nm-success)' }
    ];

    ratings.forEach(r => {
      const rb = document.createElement('button');
      rb.textContent = r.label;
      rb.style.cssText = [
        `flex:1;padding:9px 4px;border-radius:8px;border:1.5px solid ${r.color}`,
        `background:#FFFFFF;color:${r.color};font-size:13px;cursor:pointer;font-weight:500`,
        'transition:background 0.15s'
      ].join(';');
      rb.addEventListener('mouseenter', () => { rb.style.background = 'var(--nm-bg-elev-2)'; });
      rb.addEventListener('mouseleave', () => { rb.style.background = '#FFFFFF'; });
      rb.addEventListener('click', () => {
        if (r.pts > 0) { pointsEngine.addPoints(r.pts, 'flashcard-rating'); }
        if (index < cards.length - 1) {
          index++;
          flipped = false;
          renderCard();
        } else {
          flashArea.innerHTML = [
            '<div style="text-align:center;padding:36px">',
            '<div style="font-size:48px;margin-bottom:14px">🎉</div>',
            '<div style="font-size:18px;font-weight:700;color:var(--nm-primary)">Deck complete!</div>',
            '<div style="font-size:14px;color:var(--nm-fg-muted);margin-top:8px">Click Regenerate for a fresh set</div>',
            '</div>'
          ].join('');
        }
      });
      ratingRow.appendChild(rb);
    });

    // Nav
    const navRow = document.createElement('div');
    navRow.style.cssText = 'display:flex;gap:8px';
    const navStyle = [
      'flex:1;padding:9px;border:1.5px solid var(--nm-border);border-radius:8px',
      'background:#FFFFFF;color:var(--nm-fg-muted);font-size:13px;cursor:pointer;transition:background 0.15s'
    ].join(';');

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '← Prev';
    prevBtn.style.cssText = navStyle;
    if (index === 0) { prevBtn.style.opacity = '0.35'; prevBtn.disabled = true; }
    prevBtn.addEventListener('click', () => {
      if (index > 0) { index--; flipped = false; renderCard(); }
    });

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next →';
    nextBtn.style.cssText = navStyle;
    if (index === cards.length - 1) { nextBtn.style.opacity = '0.35'; nextBtn.disabled = true; }
    nextBtn.addEventListener('click', () => {
      if (index < cards.length - 1) { index++; flipped = false; renderCard(); }
    });

    navRow.appendChild(prevBtn);
    navRow.appendChild(nextBtn);

    flashArea.appendChild(progress);
    flashArea.appendChild(wrapper);
    flashArea.appendChild(hint);
    flashArea.appendChild(ratingRow);
    flashArea.appendChild(navRow);
  }
}
