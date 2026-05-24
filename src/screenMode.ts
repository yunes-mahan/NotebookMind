import { NotebookMindApp } from './nbApp';
import { heading, button, infoBox, maxWidth } from './uiKit';

export function renderModeSelect(
  host: HTMLElement,
  app: NotebookMindApp
): void {
  const root = maxWidth(host);
  const doc = app.doc;
  if (!doc) {
    app.navigate('home');
    return;
  }

  root.appendChild(
    heading(doc.name, `${doc.cells.length} code cells · how do you want to study it?`)
  );

  const cards = document.createElement('div');
  cards.style.cssText = `display:grid;grid-template-columns:${
    app.explainAllowed ? '1fr 1fr' : '1fr'
  };gap:18px;margin-top:8px`;

  const learnCard = modeCard(
    '🎮',
    'Learn',
    'Turn each cell into a challenge — fix bugs, predict outputs, fill the blanks — and earn XP.',
    '#FE7030',
    () => {
      app.xp.reset();
      app.challenges = new Array(doc.cells.length).fill(null);
      app.expectedOutputs = [];
      app.navigate('learn');
    }
  );

  if (app.explainAllowed) {
    cards.appendChild(
      modeCard(
        '📖',
        'Explain',
        'Walk through each cell and get a plain-language explanation, teacher notes and slides.',
        '#515839',
        () => app.navigate('explain')
      )
    );
    cards.appendChild(learnCard);
  } else {
    cards.appendChild(learnCard);
  }

  root.appendChild(cards);

  if (!app.explainAllowed) {
    const note = infoBox(
      'This is the <strong>current week</strong> — practise it in Learn mode. Explain mode (explanations, teacher notes &amp; slides) unlocks once the week becomes a review week.',
      'info'
    );
    note.style.marginTop = '16px';
    root.appendChild(note);
  }

  const back = button('← Back to notebooks', 'ghost');
  back.style.marginTop = '24px';
  back.addEventListener('click', () => app.navigate('home'));
  root.appendChild(back);
}

function modeCard(
  emoji: string,
  title: string,
  desc: string,
  accent: string,
  onClick: () => void
): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText = [
    'background:#fff;border:1px solid var(--nm-border);border-radius:var(--nm-radius-xl);padding:26px 22px',
    'cursor:pointer;transition:all 0.18s;display:flex;flex-direction:column;gap:10px',
    'box-shadow:var(--nm-shadow-xs)'
  ].join(';');
  card.addEventListener('mouseenter', () => {
    card.style.borderColor = accent;
    card.style.transform = 'translateY(-4px)';
    card.style.boxShadow = `0 12px 28px ${accent}26`;
  });
  card.addEventListener('mouseleave', () => {
    card.style.borderColor = 'var(--nm-border)';
    card.style.transform = 'translateY(0)';
    card.style.boxShadow = 'var(--nm-shadow-xs)';
  });
  card.addEventListener('click', onClick);

  const e = document.createElement('div');
  e.style.cssText = 'font-size:40px';
  e.textContent = emoji;
  const t = document.createElement('div');
  t.style.cssText = `font-size:20px;font-weight:800;color:${accent}`;
  t.textContent = title;
  const d = document.createElement('div');
  d.style.cssText = 'font-size:13px;color:var(--nm-text-secondary);line-height:1.6';
  d.textContent = desc;

  card.appendChild(e);
  card.appendChild(t);
  card.appendChild(d);
  return card;
}
