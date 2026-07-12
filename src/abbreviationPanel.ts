import { IAbbreviation } from './gemini';

export function renderAbbreviations(
  container: HTMLElement,
  abbreviations: IAbbreviation[]
): void {
  container.innerHTML = '';

  if (abbreviations.length === 0) {
    const msg = document.createElement('div');
    msg.style.cssText =
      'color:var(--nm-fg-muted);font-size:13px;text-align:center;padding:14px;font-style:italic';
    msg.textContent = 'No import aliases detected in this cell.';
    container.appendChild(msg);
    return;
  }

  abbreviations.forEach(abbr => {
    const row = document.createElement('div');
    row.style.cssText = [
      'display:flex;align-items:flex-start;gap:12px;padding:10px 12px',
      'background:#FFFFFF;border-radius:9px;border:1px solid var(--nm-border);margin-bottom:6px',
      'transition:border-color 0.2s'
    ].join(';');
    row.addEventListener('mouseenter', () => { row.style.borderColor = 'var(--nm-accent-border)'; });
    row.addEventListener('mouseleave', () => { row.style.borderColor = 'var(--nm-border)'; });

    const aliasTag = document.createElement('div');
    aliasTag.style.cssText = [
      'font-family:monospace;font-size:13px;font-weight:700',
      'background:var(--nm-accent-soft);color:var(--nm-primary);padding:3px 10px',
      'border-radius:6px;white-space:nowrap;flex-shrink:0;margin-top:1px'
    ].join(';');
    aliasTag.textContent = abbr.alias;

    const info = document.createElement('div');

    const fullName = document.createElement('div');
    fullName.style.cssText = 'font-size:13px;font-weight:600;color:var(--nm-fg);margin-bottom:2px';
    fullName.textContent = abbr.fullName;

    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:12px;color:var(--nm-fg-muted);line-height:1.45';
    desc.textContent = abbr.description;

    info.appendChild(fullName);
    info.appendChild(desc);
    row.appendChild(aliasTag);
    row.appendChild(info);
    container.appendChild(row);
  });
}
