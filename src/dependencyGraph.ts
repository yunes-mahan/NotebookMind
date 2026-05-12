import mermaid from 'mermaid';

let _initialized = false;
let _idCounter = 0;

export async function renderDependencyGraph(
  container: HTMLElement,
  diagramText: string
): Promise<void> {
  container.innerHTML = '';

  if (!_initialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'loose'
    });
    _initialized = true;
  }

  const id = `nm-graph-${++_idCounter}`;
  try {
    const { svg } = await mermaid.render(id, diagramText);
    container.innerHTML = svg;
    const svgEl = container.querySelector('svg');
    if (svgEl) {
      svgEl.style.cssText =
        'max-width:100%;height:auto;border-radius:10px;border:1px solid #E5E7EB';
    }
  } catch {
    container.innerHTML =
      '<div style="color:#EF4444;font-size:13px;padding:12px;background:#FEE2E2;border-radius:8px">Failed to render dependency graph. The diagram syntax may be invalid.</div>';
  }
}
