import { Widget } from '@lumino/widgets';
import { ServiceManager } from '@jupyterlab/services';

import { INbDoc } from './nbSource';
import { KernelRunner } from './kernelRunner';
import { XpSession } from './xp';
import { IChallenge } from './challenge';
import { pointsEngine } from './points';

import { renderHome } from './screenHome';
import { renderModeSelect } from './screenMode';
import { renderExplain } from './screenExplain';
import { renderLearn } from './screenLearn';
import { renderComplete } from './screenComplete';
import { renderBoard } from './screenBoard';
import { renderCourseMap } from './screenCourseMap';
import { renderTeacher } from './screenTeacher';
import { renderReader, loadReaderWithPages } from './screenReader';
import { IPageData } from './pdfExtract';

export type Screen =
  | 'home'
  | 'mode'
  | 'explain'
  | 'learn'
  | 'complete'
  | 'board'
  | 'coursemap'
  | 'teacher';

export class NotebookMindApp extends Widget {
  readonly services: ServiceManager.IManager;
  readonly runner: KernelRunner;
  readonly xp = new XpSession();

  doc: INbDoc | null = null;
  challenges: (IChallenge | null)[] = [];
  expectedOutputs: string[] = [];

  notebooksCompleted = 0;
  cellsAttempted = 0;
  cellsFirstTry = 0;
  difficultyBias = 0;
  explainAllowed = true;

  recordCell(firstTry: boolean): void {
    this.cellsAttempted += 1;
    if (firstTry) {
      this.cellsFirstTry += 1;
    }
  }

  recordNotebookComplete(): void {
    this.notebooksCompleted += 1;
  }

  firstTryPct(): number {
    return this.cellsAttempted
      ? Math.round((this.cellsFirstTry / this.cellsAttempted) * 100)
      : 0;
  }

  private _screen: Screen = 'home';
  private _content!: HTMLElement;    // right panel (notebook)
  private _readerPane!: HTMLElement; // left panel (reader)
  private _splitContainer!: HTMLElement;
  private _ptsBadge!: HTMLElement;
  private _crumb!: HTMLElement;
  private _readerFullscreen = false;
  private _notebookFullscreen = false;
  private _divider!: HTMLElement;

  constructor(services: ServiceManager.IManager) {
    super();
    this.services = services;
    this.runner = new KernelRunner(services);
    this.id = 'notebookmind-app';
    this.title.label = 'NotebookMind';
    this.title.caption = 'NotebookMind — gamified learning';
    this.title.closable = true;
    this.addClass('nm-app');
    this._build();
    this._bindEvents();
    this.navigate('home');
  }

  get screen(): Screen {
    return this._screen;
  }

  navigate(screen: Screen): void {
    this._screen = screen;
    this._content.innerHTML = '';
    this._updateHeader();

    switch (screen) {
      case 'home':
        renderHome(this._content, this);
        break;
      case 'mode':
        renderModeSelect(this._content, this);
        break;
      case 'explain':
        renderExplain(this._content, this);
        break;
      case 'learn':
        renderLearn(this._content, this);
        break;
      case 'complete':
        renderComplete(this._content, this);
        break;
      case 'board':
        renderBoard(this._content, this);
        break;
      case 'coursemap':
        renderCourseMap(this._content, this);
        break;
      case 'teacher':
        renderTeacher(this._content, this);
        break;
    }
  }

  /** Open the slide reader in fullscreen mode with pre-loaded pages (from course or PDF). */
  openSlideReader(
    pages: IPageData[],
    title: string,
    docId?: string,
    notes?: Record<number, string>
  ): void {
    loadReaderWithPages(pages, title, docId, notes);
    this._readerFullscreen = true;
    this._notebookFullscreen = false;
    this._applyPanelSizes();
    renderReader(this._readerPane, isFull => {
      this._readerFullscreen = isFull;
      this._applyPanelSizes();
    });
  }

  dispose(): void {
    this.runner.dispose();
    super.dispose();
  }

  private _build(): void {
    Object.assign(this.node.style, {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      background: 'var(--nm-bg)',
      fontFamily: 'var(--nm-font-sans)'
    });

    // ── Header ────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = [
      'background:#fff;border-bottom:1px solid var(--nm-border)',
      'padding:10px 18px;display:flex;align-items:center',
      'justify-content:space-between;flex-shrink:0;color:var(--nm-text)'
    ].join(';');

    const left = document.createElement('div');
    left.style.cssText =
      'display:flex;align-items:center;gap:10px;cursor:pointer;min-width:0';
    const logo = document.createElement('div');
    logo.style.cssText =
      'font-size:15px;font-weight:800;letter-spacing:-0.01em;display:flex;align-items:center;gap:6px;white-space:nowrap;color:var(--nm-text)';
    logo.innerHTML =
      '<span style="font-size:18px">📓</span><span>NotebookMind</span>';
    this._crumb = document.createElement('div');
    this._crumb.style.cssText =
      'font-size:12px;color:var(--nm-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    left.appendChild(logo);
    left.appendChild(this._crumb);
    left.addEventListener('click', () => this.navigate('home'));

    const right = document.createElement('div');
    right.style.cssText =
      'display:flex;align-items:center;gap:8px;flex-shrink:0';

    this._ptsBadge = document.createElement('div');
    this._ptsBadge.style.cssText = [
      'background:var(--nm-secondary);color:var(--nm-secondary-fg)',
      'padding:4px 12px;border-radius:20px;font-size:12.5px;font-weight:700'
    ].join(';');
    this._ptsBadge.textContent = `${pointsEngine.total} XP`;

    const boardBtn = this._headerBtn('🏆 Leaderboard');
    boardBtn.addEventListener('click', () => this.navigate('board'));

    const layoutBtn = this._headerBtn('⊡ Split view');
    layoutBtn.title = 'Toggle reader / notebook fullscreen';
    layoutBtn.addEventListener('click', () => this._toggleLayout(layoutBtn));

    right.appendChild(this._ptsBadge);
    right.appendChild(boardBtn);
    right.appendChild(layoutBtn);

    header.appendChild(left);
    header.appendChild(right);
    this.node.appendChild(header);

    // ── Split container ──────────────────────────────────────
    this._splitContainer = document.createElement('div');
    this._splitContainer.style.cssText =
      'flex:1;display:flex;overflow:hidden;min-height:0';

    // Left: reader pane
    this._readerPane = document.createElement('div');
    this._readerPane.style.cssText =
      'width:45%;flex-shrink:0;display:flex;flex-direction:column;overflow:hidden;border-right:1px solid var(--nm-border);min-height:0';
    renderReader(this._readerPane, isFull => {
      this._readerFullscreen = isFull;
      this._applyPanelSizes();
    });

    // Drag divider
    this._divider = document.createElement('div');
    this._divider.style.cssText = [
      'width:5px;flex-shrink:0;background:var(--nm-border)',
      'cursor:col-resize;transition:background 120ms ease;position:relative;z-index:1'
    ].join(';');
    this._divider.addEventListener('mouseenter', () => {
      this._divider.style.background = 'var(--nm-primary)';
    });
    this._divider.addEventListener('mouseleave', () => {
      this._divider.style.background = 'var(--nm-border)';
    });
    this._setupDragDivider();

    // Right: notebook content
    this._content = document.createElement('div');
    this._content.style.cssText =
      'flex:1;overflow-y:auto;padding:24px 20px;min-height:0';

    this._splitContainer.appendChild(this._readerPane);
    this._splitContainer.appendChild(this._divider);
    this._splitContainer.appendChild(this._content);
    this.node.appendChild(this._splitContainer);
  }

  private _headerBtn(label: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = [
      'background:#fff;color:var(--nm-fg-muted);border:1px solid var(--nm-border)',
      'padding:5px 11px;border-radius:var(--nm-radius,8px);font-size:12.5px;font-weight:600;cursor:pointer',
      'font-family:var(--nm-font-sans);transition:background 120ms ease'
    ].join(';');
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'var(--nm-bg-elev-2,#f4f3ef)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = '#fff';
    });
    return btn;
  }

  private _toggleLayout(btn: HTMLButtonElement): void {
    // Cycle: split → reader only → notebook only → split
    if (!this._readerFullscreen && !this._notebookFullscreen) {
      // Currently split — go reader fullscreen
      this._readerFullscreen = true;
      this._notebookFullscreen = false;
      btn.textContent = '📓 Notebook view';
    } else if (this._readerFullscreen) {
      // Reader full → notebook full
      this._readerFullscreen = false;
      this._notebookFullscreen = true;
      btn.textContent = '⊡ Split view';
    } else {
      // Notebook full → back to split
      this._readerFullscreen = false;
      this._notebookFullscreen = false;
      btn.textContent = '⊡ Split view';
    }
    this._applyPanelSizes();
  }

  private _applyPanelSizes(): void {
    if (this._readerFullscreen) {
      this._readerPane.style.width = '100%';
      this._content.style.display = 'none';
      this._divider.style.display = 'none';
    } else if (this._notebookFullscreen) {
      this._readerPane.style.width = '0';
      this._readerPane.style.display = 'none';
      this._divider.style.display = 'none';
      this._content.style.display = '';
    } else {
      this._readerPane.style.display = '';
      this._content.style.display = '';
      this._divider.style.display = '';
      // Restore last width or default 45%
      if (!this._readerPane.dataset.savedWidth) {
        this._readerPane.style.width = '45%';
      } else {
        this._readerPane.style.width = this._readerPane.dataset.savedWidth;
      }
    }
  }

  private _setupDragDivider(): void {
    let dragging = false;
    let startX = 0;
    let startWidth = 0;

    const onMouseDown = (e: MouseEvent) => {
      dragging = true;
      startX = e.clientX;
      startWidth = this._readerPane.getBoundingClientRect().width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) {
        return;
      }
      const containerWidth = this._splitContainer.getBoundingClientRect().width;
      const newWidth = Math.max(
        200,
        Math.min(containerWidth - 300, startWidth + (e.clientX - startX))
      );
      const pct = (newWidth / containerWidth) * 100;
      this._readerPane.style.width = `${pct.toFixed(1)}%`;
      this._readerPane.dataset.savedWidth = `${pct.toFixed(1)}%`;
    };

    const onMouseUp = () => {
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    this._divider.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  private _updateHeader(): void {
    const labels: Record<Screen, string> = {
      home: '',
      mode: this.doc ? `· ${this.doc.name}` : '',
      explain: this.doc ? `· ${this.doc.name} · Explain` : '',
      learn: this.doc ? `· ${this.doc.name} · Learn` : '',
      complete: this.doc ? `· ${this.doc.name} · Complete` : '',
      board: '· Leaderboard',
      coursemap: '· Course map',
      teacher: '· Teacher'
    };
    this._crumb.textContent = labels[this._screen];
  }

  /** Anonymous student signals (slide requests / unclear explanations). */
  readonly materialRequests: Array<{
    docKey: string;
    cellIndex: number;
    type: string;
    at: number;
  }> = [];

  private _bindEvents(): void {
    document.addEventListener('notebookmind:points', () => {
      this._ptsBadge.textContent = `${pointsEngine.total} XP`;
    });
    document.addEventListener('notebookmind:material-request', (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d) {
        this.materialRequests.push({ ...d, at: Date.now() });
      }
    });
  }
}
