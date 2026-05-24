import { Contents } from '@jupyterlab/services';

export interface INbDoc {
  name: string;
  /** Stable key for content lookups — the file basename (e.g. learn_demo.ipynb). */
  key: string;
  path?: string;
  cells: string[];
}

function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

export interface INbListItem {
  name: string;
  path: string;
}

function joinSource(source: unknown): string {
  if (Array.isArray(source)) {
    return source.join('');
  }
  return typeof source === 'string' ? source : '';
}

function extractCodeCells(nbContent: any): string[] {
  const rawCells = Array.isArray(nbContent?.cells) ? nbContent.cells : [];
  return rawCells
    .filter((c: any) => c?.cell_type === 'code')
    .map((c: any) => joinSource(c.source).trim())
    .filter((s: string) => s.length > 0);
}

export async function listNotebooks(
  contents: Contents.IManager
): Promise<INbListItem[]> {
  const found: INbListItem[] = [];

  async function walk(dirPath: string, depth: number): Promise<void> {
    let model: Contents.IModel;
    try {
      model = await contents.get(dirPath, { content: true });
    } catch {
      return;
    }
    const items = Array.isArray(model.content)
      ? (model.content as Contents.IModel[])
      : [];
    for (const item of items) {
      if (item.type === 'notebook') {
        found.push({ name: item.name, path: item.path });
      } else if (item.type === 'directory' && depth > 0) {
        if (!item.name.startsWith('.') && item.name !== 'node_modules') {
          await walk(item.path, depth - 1);
        }
      }
    }
  }

  await walk('', 2);
  found.sort((a, b) => a.path.localeCompare(b.path));
  return found;
}

export async function loadNotebook(
  contents: Contents.IManager,
  path: string,
  name: string
): Promise<INbDoc> {
  const model = await contents.get(path, { content: true });
  return { name, key: basename(path), path, cells: extractCodeCells(model.content) };
}

export async function parseUploadedNotebook(file: File): Promise<INbDoc> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  return { name: file.name, key: file.name, cells: extractCodeCells(parsed) };
}
