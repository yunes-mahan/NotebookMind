import { NotebookMindApp } from './nbApp';
import { button, backLink, avatar, maxWidth } from './uiKit';
import { MATES, invited, profile } from './friendsData';

/** Friends & profile — prototype screen (reached from the Leaderboard). */
export function renderFriends(host: HTMLElement, app: NotebookMindApp): void {
  const root = maxWidth(host, 680);
  root.style.cssText +=
    ';display:flex;flex-direction:column;gap:22px;padding-bottom:32px';

  // Header
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  head.appendChild(backLink('Back to Leaderboard', () => app.navigate('board')));
  head.innerHTML +=
    '<h1 style="margin:0;font-size:22px;font-weight:600;letter-spacing:-0.018em;color:var(--text-primary)">Friends &amp; profile</h1>' +
    '<span style="font-size:13px;color:var(--text-tertiary)">Manage who you compare with. Comparison is opt-in and mutual.</span>';
  root.appendChild(head);

  // ── Profile ───────────────────────────────────────────────────
  const profCard = document.createElement('div');
  profCard.style.cssText =
    'background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;padding:18px 20px;display:flex;flex-direction:column;gap:14px';
  profCard.innerHTML =
    '<span style="font-size:12.5px;font-weight:600;color:var(--text-secondary)">Your profile</span>';

  const profRow = document.createElement('div');
  profRow.style.cssText = 'display:flex;align-items:center;gap:16px';
  profRow.appendChild(avatar(profile.name, 64));

  const profCol = document.createElement('div');
  profCol.style.cssText =
    'display:flex;flex-direction:column;gap:6px;flex:1;min-width:0';
  profCol.innerHTML =
    '<span style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-quaternary)">Display name</span>';
  const nameRow = document.createElement('div');
  nameRow.style.cssText = 'display:flex;align-items:center;gap:12px';
  const nameInput = document.createElement('input');
  nameInput.value = profile.name;
  nameInput.placeholder = 'Your name';
  nameInput.style.cssText =
    'flex:1;min-width:0;box-sizing:border-box;height:38px;background:var(--bg-base);color:var(--text-primary);border:1px solid var(--border-strong);border-radius:7px;padding:0 12px;font-size:13px;font-family:var(--font-sans);outline:none;transition:border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)';
  nameInput.addEventListener('focus', () => {
    nameInput.style.borderColor = 'var(--accent)';
    nameInput.style.boxShadow = '0 0 0 3px var(--brand-glow)';
  });
  nameInput.addEventListener('blur', () => {
    nameInput.style.borderColor = 'var(--border-strong)';
    nameInput.style.boxShadow = 'none';
  });
  const saveBtn = button('Save', 'primary');
  saveBtn.style.height = '38px';
  nameRow.appendChild(nameInput);
  nameRow.appendChild(saveBtn);
  profCol.appendChild(nameRow);
  const notice = document.createElement('span');
  notice.style.cssText = 'font-size:12px;color:var(--green-400);min-height:15px';
  profCol.appendChild(notice);
  saveBtn.addEventListener('click', () => {
    const v = nameInput.value.trim();
    if (!v) {
      notice.style.color = 'var(--red-400)';
      notice.textContent = "Name can't be empty.";
      return;
    }
    profile.name = v;
    notice.style.color = 'var(--green-400)';
    notice.textContent = 'Profile saved.';
    // Repaint so the avatar initials update.
    host.innerHTML = '';
    renderFriends(host, app);
  });
  profRow.appendChild(profCol);
  profCard.appendChild(profRow);
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
    '<span style="font-size:13px;font-weight:600;color:var(--text-secondary)">Friends &amp; sharing</span>';
  const listBox = document.createElement('div');
  listBox.style.cssText =
    'background:var(--bg-panel);border:1px solid var(--border-default);border-radius:10px;overflow:hidden';
  listWrap.appendChild(listBox);
  root.appendChild(listWrap);

  function paintMates(): void {
    listBox.innerHTML = '';
    MATES.forEach((m, idx) => {
      let stateLabel: string;
      let stateColor: string;
      let btnLabel: string;
      let btnVariant: 'primary' | 'secondary' | 'ghost' = 'secondary';
      let highlight = false;
      if (m.me && m.them) {
        stateLabel = 'Sharing with each other';
        stateColor = 'var(--green-400)';
        btnLabel = 'Stop sharing';
        btnVariant = 'ghost';
      } else if (m.me && !m.them) {
        stateLabel = 'You shared — waiting for them';
        stateColor = 'var(--yellow-500)';
        btnLabel = 'Withdraw';
        btnVariant = 'ghost';
      } else if (!m.me && m.them) {
        stateLabel = 'They shared with you';
        stateColor = 'var(--accent-text)';
        btnLabel = 'Share back to compare';
        btnVariant = 'primary';
        highlight = true;
      } else {
        stateLabel = 'Not sharing';
        stateColor = 'var(--text-quaternary)';
        btnLabel = 'Share my stats';
      }

      const row = document.createElement('div');
      row.style.cssText = `display:flex;align-items:center;gap:12px;padding:11px 16px;${idx > 0 ? 'border-top:1px solid var(--border-subtle);' : ''}${highlight ? 'background:var(--accent-subtle-bg)' : ''}`;
      row.appendChild(avatar(m.name, 28));
      const col = document.createElement('div');
      col.style.cssText =
        'display:flex;flex-direction:column;gap:2px;flex:1;min-width:0';
      col.innerHTML =
        `<span style="font-size:13px;font-weight:500;color:var(--text-primary)">${m.name}</span>` +
        `<span style="font-size:11.5px;font-weight:500;color:${stateColor}">${stateLabel}</span>`;
      row.appendChild(col);
      const action = button(btnLabel, btnVariant);
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
        'display:flex;align-items:center;gap:12px;padding:11px 16px;border-top:1px solid var(--border-subtle);opacity:0.75';
      row.appendChild(avatar(f.name, 28));
      const col = document.createElement('div');
      col.style.cssText =
        'display:flex;flex-direction:column;gap:2px;flex:1;min-width:0';
      col.innerHTML =
        `<span style="font-size:13px;font-weight:500;color:var(--text-primary)">${f.name}</span>` +
        '<span style="font-size:11.5px;font-weight:500;color:var(--text-quaternary)">Invited · waiting for them to join</span>';
      row.appendChild(col);
      const cancel = button('Cancel invite', 'ghost');
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
