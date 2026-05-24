// Helpers to show workspace PDFs (lecture slides) inline, jumping to a page.
// JupyterLab serves workspace files at {baseUrl}files/{path}; the browser's
// native PDF viewer honours #page=N.

export function filesUrl(baseUrl: string, path: string, page?: number): string {
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const clean = path.replace(/^\//, '');
  return `${base}files/${clean}${page ? `#page=${page}` : ''}`;
}

export function pdfFrame(url: string, height = 460): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'border:1px solid var(--nm-border);border-radius:var(--nm-radius-lg);overflow:hidden;background:var(--nm-bg-subtle)';
  const frame = document.createElement('iframe');
  frame.src = url;
  frame.style.cssText = `width:100%;height:${height}px;border:none;display:block`;
  wrap.appendChild(frame);
  return wrap;
}
