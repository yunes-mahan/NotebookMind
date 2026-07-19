import { button } from './uiKit';
import { isConnected } from './supabase';

export type StoragePref = 'local' | 'web';

/**
 * Ask where a *personal* upload (a notebook or PDF the user brought in outside
 * any course) should be kept: on this device (IndexedDB) or synced to their
 * account (Supabase). Resolves null if dismissed. "Web" is disabled when there
 * is no backend connection.
 */
export function askStoragePreference(material: string): Promise<StoragePref | null> {
  return new Promise(resolve => {
    const connected = isConnected();

    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:1200;background:var(--surface-overlay);display:flex;align-items:center;justify-content:center;font-family:var(--font-sans)';

    const card = document.createElement('div');
    card.style.cssText = [
      'width:400px;max-width:calc(100vw - 32px);background:var(--bg-elevated);border:1px solid var(--border-strong);border-radius:12px',
      'padding:24px;display:flex;flex-direction:column;gap:14px;box-sizing:border-box',
      'box-shadow:0 16px 48px rgba(0,0,0,0.14);animation:nm-rise 0.2s ease-out both'
    ].join(';');

    let done = false;
    const finish = (pref: StoragePref | null): void => {
      if (done) {
        return;
      }
      done = true;
      overlay.remove();
      resolve(pref);
    };

    card.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:5px">' +
      `<span style="font-size:15px;font-weight:600;color:var(--text-primary)">Where should this ${material} live?</span>` +
      '<span style="font-size:12.5px;color:var(--text-tertiary);line-height:1.5">This is a personal upload — it isn’t part of a course. Choose where to keep it so it’s still here after a reload.</span>' +
      '</div>';

    const optionRow = (
      title: string,
      desc: string,
      onClick: () => void,
      disabled = false
    ): HTMLElement => {
      const el = document.createElement('div');
      el.style.cssText = [
        'display:flex;flex-direction:column;gap:3px;padding:12px 14px;border-radius:9px;cursor:pointer',
        'border:1px solid var(--border-default);background:var(--bg-panel)',
        'transition:border-color var(--dur-fast) var(--ease-out),background-color var(--dur-fast) var(--ease-out)',
        disabled ? 'opacity:0.5;cursor:not-allowed' : ''
      ].join(';');
      el.innerHTML =
        `<span style="font-size:13.5px;font-weight:600;color:var(--text-primary)">${title}</span>` +
        `<span style="font-size:12px;color:var(--text-tertiary);line-height:1.45">${desc}</span>`;
      if (!disabled) {
        el.addEventListener('mouseenter', () => {
          el.style.borderColor = 'var(--accent)';
          el.style.background = 'var(--accent-subtle-bg)';
        });
        el.addEventListener('mouseleave', () => {
          el.style.borderColor = 'var(--border-default)';
          el.style.background = 'var(--bg-panel)';
        });
        el.addEventListener('click', onClick);
      }
      return el;
    };

    card.appendChild(
      optionRow(
        'On this device',
        'Stored privately in this browser (IndexedDB). Stays on this machine.',
        () => finish('local')
      )
    );
    card.appendChild(
      optionRow(
        connected ? 'In my account (web)' : 'In my account (web) — sign in required',
        connected
          ? 'Synced to your NotebookMind account so it follows you to any device.'
          : 'Connect / sign in to a backend account to enable cloud sync.',
        () => finish('web'),
        !connected
      )
    );

    const cancelRow = document.createElement('div');
    cancelRow.style.cssText = 'display:flex;justify-content:flex-end;margin-top:2px';
    const cancel = button('Cancel', 'ghost');
    cancel.addEventListener('click', () => finish(null));
    cancelRow.appendChild(cancel);
    card.appendChild(cancelRow);

    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        finish(null);
      }
    });

    overlay.appendChild(card);
    document.body.appendChild(overlay);
  });
}
