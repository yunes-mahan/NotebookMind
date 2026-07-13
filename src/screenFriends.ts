import { NotebookMindApp } from './nbApp';
import { button, avatar, maxWidth, pageHeader, tag } from './uiKit';
import { MATES, invited, profile } from './friendsData';
import { openProfileModal } from './profileModal';

/** Friends & profile — prototype screen (reached from the Leaderboard). */
export function renderFriends(host: HTMLElement, app: NotebookMindApp): void {
  const root = maxWidth(host, 680);
  root.style.cssText +=
    ';display:flex;flex-direction:column;gap:22px;padding-bottom:32px';

  const repaint = (): void => {
    host.innerHTML = '';
    renderFriends(host, app);
  };

  // Header — shared pageHeader so "Back to…" spacing matches every screen.
  root.appendChild(
    pageHeader('Friends & profile', {
      subtitle: 'Manage who you compare with. Comparison is opt-in and mutual.',
      back: () => app.navigate('board'),
      backLabel: 'Leaderboard'
    })
  );

  // ── Profile ───────────────────────────────────────────────────
  const profCard = document.createElement('div');
  profCard.style.cssText =
    'background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;padding:18px 20px;display:flex;align-items:center;gap:16px';
  profCard.appendChild(avatar(profile.name, 56, profile.avatarUrl));

  const profCol = document.createElement('div');
  profCol.style.cssText = 'display:flex;flex-direction:column;gap:3px;flex:1;min-width:0';
  profCol.innerHTML =
    `<span style="font-size:15px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${profile.name}</span>` +
    `<span style="font-size:12.5px;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${profile.email || 'Demo mode — no account connected'}</span>`;
  profCard.appendChild(profCol);

  const editBtn = button('Edit profile', 'secondary');
  editBtn.addEventListener('click', () => openProfileModal(repaint));
  profCard.appendChild(editBtn);
  root.appendChild(profCard);

  // ── Add a friend ──────────────────────────────────────────────
  const addWrap = document.createElement('div');
  addWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px';
  addWrap.innerHTML =
    '<span style="font-size:13px;font-weight:600;color:var(--text-secondary)">Add a friend</span>';
  const addRow = document.createElement('div');
  addRow.style.cssText = 'display:flex;gap:8px';
  const addInput = document.createElement('input');
  addInput.placeholder = 'Add a friend by university email…';
  addInput.style.cssText =
    'flex:1;height:38px;box-sizing:border-box;background:var(--bg-panel);color:var(--text-primary);border:1px solid var(--border-default);border-radius:7px;padding:0 12px;font-size:13px;font-family:var(--font-sans);outline:none;transition:border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)';
  addInput.addEventListener('focus', () => {
    addInput.style.borderColor = 'var(--accent)';
    addInput.style.boxShadow = '0 0 0 3px var(--brand-glow)';
  });
  addInput.addEventListener('blur', () => {
    addInput.style.borderColor = 'var(--border-default)';
    addInput.style.boxShadow = 'none';
  });
  const addBtn = button('Send invite', 'secondary');
  addBtn.style.height = '38px';
  addRow.appendChild(addInput);
  addRow.appendChild(addBtn);
  addWrap.appendChild(addRow);
  const addNotice = document.createElement('span');
  addNotice.style.cssText = 'font-size:12px;color:var(--green-400);min-height:15px';
  addWrap.appendChild(addNotice);

  const doInvite = (): void => {
    const v = addInput.value.trim();
    if (!v) return;
    if (!v.includes('@')) {
      addNotice.style.color = 'var(--red-400)';
      addNotice.textContent = 'Enter a full email address, e.g. mika@university.edu.';
      return;
    }
    const name = v
      .split('@')[0]
      .replace(/[._]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
    invited.push({ name, email: v });
    addInput.value = '';
    addNotice.style.color = 'var(--green-400)';
    addNotice.textContent = `Invite sent to ${name} — they'll appear here once they join, and you can share stats with each other.`;
    paintMates();
  };
  addBtn.addEventListener('click', doInvite);
  addInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') doInvite();
  });
  root.appendChild(addWrap);

  // ── Friends & sharing ─────────────────────────────────────────
  const listWrap = document.createElement('div');
  listWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px';
  listWrap.innerHTML =
    '<span style="font-size:13px;font-weight:600;color:var(--text-secondary)">Friends &amp; sharing</span>' +
    '<span style="font-size:12px;color:var(--text-tertiary);line-height:1.5;margin-top:-4px">You only see a friend’s stats once <b>both</b> of you share. Use the button on each row to share, accept, or take your sharing back at any time.</span>';
  const listBox = document.createElement('div');
  listBox.style.cssText =
    'background:var(--bg-panel);border:1px solid var(--border-default);border-radius:10px;overflow:hidden';
  listWrap.appendChild(listBox);
  root.appendChild(listWrap);

  interface IRowSpec {
    stateLabel: string;
    stateTone: 'success' | 'warning' | 'accent' | 'neutral';
    btnLabel: string;
    btnVariant: 'primary' | 'secondary';
    highlight: boolean;
  }

  function paintMates(): void {
    listBox.innerHTML = '';
    MATES.forEach((m, idx) => {
      let spec: IRowSpec;
      if (m.me && m.them) {
        spec = {
          stateLabel: 'Sharing both ways',
          stateTone: 'success',
          btnLabel: 'Stop sharing',
          btnVariant: 'secondary',
          highlight: false
        };
      } else if (m.me && !m.them) {
        spec = {
          stateLabel: 'You shared — waiting for them',
          stateTone: 'warning',
          btnLabel: 'Withdraw request',
          btnVariant: 'secondary',
          highlight: false
        };
      } else if (!m.me && m.them) {
        spec = {
          stateLabel: 'Wants to compare with you',
          stateTone: 'accent',
          btnLabel: 'Accept & share back',
          btnVariant: 'primary',
          highlight: true
        };
      } else {
        spec = {
          stateLabel: 'Not sharing',
          stateTone: 'neutral',
          btnLabel: 'Share my stats',
          btnVariant: 'secondary',
          highlight: false
        };
      }

      const row = document.createElement('div');
      row.style.cssText = `display:flex;align-items:center;gap:12px;padding:11px 16px;${idx > 0 ? 'border-top:1px solid var(--border-subtle);' : ''}${spec.highlight ? 'background:var(--accent-subtle-bg)' : ''}`;
      row.appendChild(avatar(m.name, 30));
      const col = document.createElement('div');
      col.style.cssText =
        'display:flex;flex-direction:column;align-items:flex-start;gap:4px;flex:1;min-width:0';
      const nameEl = document.createElement('span');
      nameEl.style.cssText =
        'max-width:100%;font-size:13px;font-weight:500;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      nameEl.textContent = m.name;
      col.appendChild(nameEl);
      col.appendChild(tag(spec.stateLabel, spec.stateTone, true));
      row.appendChild(col);

      const action = button(spec.btnLabel, spec.btnVariant);
      action.style.height = 'var(--control-sm)';
      action.style.fontSize = '12px';
      action.addEventListener('click', () => {
        m.me = !m.me;
        paintMates();
      });
      row.appendChild(action);
      listBox.appendChild(row);
    });

    invited.forEach((f, i) => {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;align-items:center;gap:12px;padding:11px 16px;border-top:1px solid var(--border-subtle)';
      row.appendChild(avatar(f.name, 30));
      const col = document.createElement('div');
      col.style.cssText =
        'display:flex;flex-direction:column;align-items:flex-start;gap:4px;flex:1;min-width:0';
      const nameEl = document.createElement('span');
      nameEl.style.cssText =
        'max-width:100%;font-size:13px;font-weight:500;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      nameEl.textContent = f.name;
      col.appendChild(nameEl);
      col.appendChild(tag('Invited · waiting to join', 'neutral', true));
      row.appendChild(col);
      const cancel = button('Cancel invite', 'secondary');
      cancel.style.height = 'var(--control-sm)';
      cancel.style.fontSize = '12px';
      cancel.addEventListener('click', () => {
        invited.splice(i, 1);
        paintMates();
      });
      row.appendChild(cancel);
      listBox.appendChild(row);
    });
  }
  paintMates();
}
