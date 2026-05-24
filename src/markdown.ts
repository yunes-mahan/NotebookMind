// Tiny, safe Markdown renderer — builds DOM (textContent escapes), supports
// #/##/### headings, **bold**, `inline code`, and - bullet lists.

function inline(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    }
    const tok = m[0];
    if (tok.startsWith('**')) {
      const b = document.createElement('strong');
      b.textContent = tok.slice(2, -2);
      frag.appendChild(b);
    } else {
      const c = document.createElement('code');
      c.textContent = tok.slice(1, -1);
      c.style.cssText =
        'font-family:var(--nm-font-mono);font-size:12px;background:var(--nm-bg-section);padding:1px 5px;border-radius:4px';
      frag.appendChild(c);
    }
    last = re.lastIndex;
  }
  if (last < text.length) {
    frag.appendChild(document.createTextNode(text.slice(last)));
  }
  return frag;
}

export function renderMarkdown(text: string): HTMLElement {
  const root = document.createElement('div');
  root.style.cssText = 'font-size:13.5px;color:var(--nm-text);line-height:1.7';

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let list: HTMLElement | null = null;

  while (i < lines.length) {
    const t = lines[i].trim();

    if (t === '') {
      list = null;
      i++;
      continue;
    }

    const heading = t.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      list = null;
      const lvl = heading[1].length;
      const size = lvl <= 1 ? 16 : lvl === 2 ? 14.5 : 13.5;
      const el = document.createElement('div');
      el.style.cssText = `font-weight:800;font-size:${size}px;color:var(--nm-text);margin:10px 0 4px`;
      el.appendChild(inline(heading[2]));
      root.appendChild(el);
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(t)) {
      if (!list) {
        list = document.createElement('ul');
        list.style.cssText =
          'margin:4px 0 8px;padding-left:20px;display:flex;flex-direction:column;gap:3px';
        root.appendChild(list);
      }
      const li = document.createElement('li');
      li.appendChild(inline(t.replace(/^[-*]\s+/, '')));
      list.appendChild(li);
      i++;
      continue;
    }

    // Paragraph: join consecutive plain lines.
    list = null;
    const p = document.createElement('div');
    p.style.cssText = 'margin:0 0 8px';
    p.appendChild(inline(t));
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,4})\s/.test(lines[i].trim()) &&
      !/^[-*]\s/.test(lines[i].trim())
    ) {
      p.appendChild(document.createTextNode(' '));
      p.appendChild(inline(lines[i].trim()));
      i++;
    }
    root.appendChild(p);
  }

  return root;
}
