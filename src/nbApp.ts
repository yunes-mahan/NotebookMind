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
  /** Per-cell challenges + expected outputs for the current Learn run. */
  challenges: (IChallenge | null)[] = [];
  expectedOutputs: string[] = [];

  /** Session stats (persist while JupyterLab stays open). */
  notebooksCompleted = 0;
  cellsAttempted = 0;
  cellsFirstTry = 0;

  /** Learner-adjusted difficulty preference (−2 easier … +2 harder). */
  difficultyBias = 0;

  /** Whether Explain mode is offered for the current notebook (past weeks only). */
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
  private _content!: HTMLElement;
  private _ptsBadge!: HTMLElement;
  private _crumb!: HTMLElement;

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

    const header = document.createElement('div');
    header.style.cssText = [
      'background:#fff;border-bottom:1px solid var(--nm-border)',
      'padding:13px 22px;display:flex;align-items:center',
      'justify-content:space-between;flex-shrink:0;color:var(--nm-text)'
    ].join(';');

    const left = document.createElement('div');
    left.style.cssText =
      'display:flex;align-items:center;gap:11px;cursor:pointer;min-width:0';
    const logo = document.createElement('div');
    logo.style.cssText =
      'font-size:16px;font-weight:800;letter-spacing:-0.01em;display:flex;align-items:center;gap:7px;white-space:nowrap;color:var(--nm-text)';
    logo.innerHTML = '<span style="font-size:20px">📓</span><span>NotebookMind</span>';
    this._crumb = document.createElement('div');
    this._crumb.style.cssText =
      'font-size:13px;color:var(--nm-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    left.appendChild(logo);
    left.appendChild(this._crumb);
    left.addEventListener('click', () => this.navigate('home'));

    const right = document.createElement('div');
    right.style.cssText = 'display:flex;align-items:center;gap:10px;flex-shrink:0';

    this._ptsBadge = document.createElement('div');
    this._ptsBadge.style.cssText = [
      'background:var(--nm-accent-light);color:var(--nm-accent-hover)',
      'padding:5px 13px;border-radius:20px;font-size:13px;font-weight:700'
    ].join(';');
    this._ptsBadge.textContent = `${pointsEngine.total} XP`;

    const boardBtn = document.createElement('button');
    boardBtn.textContent = '🏆 Leaderboard';
    boardBtn.style.cssText = [
      'background:#fff;color:var(--nm-text-secondary);border:1px solid var(--nm-border)',
      'padding:6px 13px;border-radius:var(--nm-radius);font-size:13px;font-weight:600;cursor:pointer',
      'box-shadow:var(--nm-shadow-xs);font-family:var(--nm-font)'
    ].join(';');
    boardBtn.addEventListener('mouseenter', () => {
      boardBtn.style.background = 'var(--nm-bg-subtle)';
    });
    boardBtn.addEventListener('mouseleave', () => {
      boardBtn.style.background = '#fff';
    });
    boardBtn.addEventListener('click', () => this.navigate('board'));

    right.appendChild(this._ptsBadge);
    right.appendChild(boardBtn);

    header.appendChild(left);
    header.appendChild(right);

    this._content = document.createElement('div');
    this._content.style.cssText =
      'flex:1;overflow-y:auto;padding:28px 22px;min-height:0';

    this.node.appendChild(header);
    this.node.appendChild(this._content);
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

  private _bindEvents(): void {
    document.addEventListener('notebookmind:points', () => {
      this._ptsBadge.textContent = `${pointsEngine.total} XP`;
    });
  }
}
