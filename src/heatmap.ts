export function renderHeatmap(
  container: HTMLElement,
  difficulties: number[],
  onCellClick: (index: number) => void
): void {
  if (difficulties.length === 0) {
    const msg = document.createElement('div');
    msg.style.cssText = 'color:var(--nm-fg-muted);font-size:13px;font-style:italic';
    msg.textContent = 'No cells analyzed yet. Open a notebook and click cells.';
    container.appendChild(msg);
    return;
  }

  const label = document.createElement('div');
  label.style.cssText =
    'font-size:12px;color:var(--nm-fg-muted);margin-bottom:8px;font-weight:500';
  label.textContent = 'Click a square to jump to that cell';

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px';

  difficulties.forEach((d, i) => {
    const color = d <= 3 ? 'var(--nm-success)' : d <= 6 ? 'var(--nm-warning)' : 'var(--nm-danger)';
    const sq = document.createElement('div');
    sq.style.cssText = [
      `width:24px;height:24px;border-radius:5px;background:${color}`,
      'cursor:pointer;transition:transform 0.15s,box-shadow 0.15s'
    ].join(';');
    sq.title = `Cell ${i + 1} — complexity ${d}/10`;
    sq.addEventListener('mouseenter', () => {
      sq.style.transform = 'scale(1.35)';
      sq.style.boxShadow = `0 3px 8px ${color}80`;
    });
    sq.addEventListener('mouseleave', () => {
      sq.style.transform = 'scale(1)';
      sq.style.boxShadow = 'none';
    });
    sq.addEventListener('click', () => onCellClick(i));
    row.appendChild(sq);
  });

  const legend = document.createElement('div');
  legend.style.cssText = 'display:flex;gap:14px;font-size:11px;color:var(--nm-fg-muted)';
  [
    { color: 'var(--nm-success)', text: 'Easy (1-3)' },
    { color: 'var(--nm-warning)', text: 'Medium (4-6)' },
    { color: 'var(--nm-danger)', text: 'Hard (7-10)' }
  ].forEach(item => {
    const span = document.createElement('span');
    span.style.cssText = 'display:flex;align-items:center;gap:5px';
    const dot = document.createElement('span');
    dot.style.cssText = `display:inline-block;width:11px;height:11px;border-radius:3px;background:${item.color}`;
    const txt = document.createTextNode(item.text);
    span.appendChild(dot);
    span.appendChild(txt);
    legend.appendChild(span);
  });

  container.appendChild(label);
  container.appendChild(row);
  container.appendChild(legend);
}
