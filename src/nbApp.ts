import { Widget } from '@lumino/widgets';
import { ServiceManager } from '@jupyterlab/services';

import { INbDoc } from './nbSource';
import { KernelRunner } from './kernelRunner';
import { XpSession } from './xp';
import { IChallenge } from './challenge';
import { pointsEngine } from './points';
import { button, avatar } from './uiKit';
import { profile, clearUser, invited, MATES } from './friendsData';
import { activeCourse } from './courseStore';
import { LoginWidget } from './auth';

import { renderHome } from './screenHome';
import { renderLibrary } from './screenLibrary';
import { renderSession } from './screenSession';
import { renderExplain } from './screenExplain';
import { renderLearn } from './screenLearn';
import { renderComplete } from './screenComplete';
import { renderBoard } from './screenBoard';
import { renderFriends } from './screenFriends';
import { renderCourseMap } from './screenCourseMap';
import { renderTeacher } from './screenTeacher';
import { renderReader, loadReaderWithPages } from './screenReader';
import { IPageData } from './pdfExtract';

export type Screen =
  | 'home'
  | 'library'
  | 'reader'
  | 'session'
  | 'explain'
  | 'learn'
  | 'complete'
  | 'board'
  | 'friends'
  | 'coursemap'
  | 'teacher';

interface INavDef {
  key: string;
  icon: string;
  label: string;
  screen: Screen;
  group: 'main' | 'teach';
}

/* Prototype nav icons (Lucide-style line SVGs). */
const ICONS: Record<string, string> = {
  course:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>',
  slides:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="13" rx="2"></rect><path d="M8 21h8"></path><path d="M12 16v5"></path></svg>',
  board:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
  teacher:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>'
};

const NAV: INavDef[] = [
  { key: 'course', icon: ICONS.course, label: 'Course', screen: 'home', group: 'main' },
  { key: 'slides', icon: ICONS.slides, label: 'Slides & Papers', screen: 'library', group: 'main' },
  { key: 'board', icon: ICONS.board, label: 'Leaderboard', screen: 'board', group: 'main' },
  { key: 'teacher', icon: ICONS.teacher, label: 'Teacher', screen: 'teacher', group: 'teach' }
];

/** Which nav key should appear active for a given screen. */
const SCREEN_NAV: Record<Screen, string> = {
  home: 'course',
  session: 'course',
  learn: 'course',
  explain: 'course',
  complete: 'course',
  coursemap: 'course',
  library: 'slides',
  reader: 'slides',
  board: 'board',
  friends: 'board',
  teacher: 'teacher'
};

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
  private _content!: HTMLElement;
  private _crumb!: HTMLElement;
  private _actions!: HTMLElement;
  private _ptsBadge!: HTMLElement;
  private _readerTitle = 'Reader';
  private _foot!: HTMLElement;
  private readonly _navBtns: Record<string, HTMLElement> = {};

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
    this._content.scrollTop = 0;
    // Full reset — the reader overwrites this element's cssText (overflow:hidden),
    // so restoring only the padding would leave normal screens unscrollable.
    this._content.style.cssText =
      'flex:1;overflow-y:auto;min-height:0;padding:32px 28px';
    this._actions.innerHTML = '';
    this._setActiveNav(SCREEN_NAV[screen]);
    this._updateCrumb();

    switch (screen) {
      case 'home':
        renderHome(this._content, this);
        break;
      case 'library':
        renderLibrary(this._content, this);
        break;
      case 'session':
        renderSession(this._content, this);
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
      case 'friends':
        renderFriends(this._content, this);
        break;
      case 'coursemap':
        renderCourseMap(this._content, this);
        break;
      case 'teacher':
        renderTeacher(this._content, this);
        break;
    }
  }

  /** Open the slide reader (full-bleed) with pre-loaded pages (from course or PDF). */
  openSlideReader(
    pages: IPageData[],
    title: string,
    docId?: string,
    notes?: Record<number, string>
  ): void {
    this._screen = 'reader';
    this._readerTitle = title;
    this._content.innerHTML = '';
    this._content.scrollTop = 0;
    this._content.style.cssText =
      'flex:1;overflow:hidden;min-height:0;padding:0'; // reader manages its own layout
    this._actions.innerHTML = '';
    this._setActiveNav('slides');
    this._updateCrumb();
    loadReaderWithPages(pages, title, docId, notes);
    renderReader(this._content, () => this.navigate('library'));
  }

  dispose(): void {
    this.runner.dispose();
    super.dispose();
  }

  private _build(): void {
    Object.assign(this.node.style, {
      display: 'flex',
      flexDirection: 'row',
      height: '100%',
      overflow: 'hidden',
      background: 'var(--nm-bg)',
      fontFamily: 'var(--nm-font-sans)',
      color: 'var(--nm-fg)'
    });

    this.node.appendChild(this._buildSidebar());

    // ── Main column: topbar + content ─────────────────────────────
    const main = document.createElement('div');
    main.style.cssText =
      'flex:1;display:flex;flex-direction:column;min-width:0;min-height:0';

    const topbar = document.createElement('div');
    topbar.style.cssText = [
      'height:46px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between',
      'gap:8px;padding:0 20px;border-bottom:1px solid var(--border-subtle);background:var(--bg-app)'
    ].join(';');
    this._crumb = document.createElement('div');
    this._crumb.style.cssText =
      'display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;font-size:12.5px;white-space:nowrap';
    this._actions = document.createElement('div');
    this._actions.style.cssText =
      'display:flex;align-items:center;gap:8px;flex-shrink:0';
    topbar.appendChild(this._crumb);
    topbar.appendChild(this._actions);
    main.appendChild(topbar);

    this._content = document.createElement('div');
    this._content.style.cssText =
      'flex:1;overflow-y:auto;min-height:0;padding:32px 28px';
    main.appendChild(this._content);

    this.node.appendChild(main);
  }

  private _buildSidebar(): HTMLElement {
    const bar = document.createElement('nav');
    bar.style.cssText = [
      'width:232px;flex-shrink:0;display:flex;flex-direction:column;min-height:0',
      'background:var(--bg-base);border-right:1px solid var(--border-subtle)'
    ].join(';');

    // Brand: accent logo tile + wordmark
    const brand = document.createElement('div');
    brand.style.cssText =
      'display:flex;align-items:center;gap:8px;padding:16px 16px 14px';
    brand.innerHTML =
      '<div style="width:22px;height:22px;border-radius:6px;background:var(--accent);display:flex;align-items:center;justify-content:center;box-shadow:0 1px 6px var(--brand-glow)">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>' +
      '</div>' +
      '<span style="font-weight:600;font-size:14px;letter-spacing:-0.018em;color:var(--text-primary)">NotebookMind</span>';
    bar.appendChild(brand);

    // Nav groups
    const nav = document.createElement('div');
    nav.style.cssText =
      'display:flex;flex-direction:column;gap:1px;padding:4px 8px';
    NAV.filter(n => n.group === 'main').forEach(n =>
      nav.appendChild(this._navItem(n))
    );
    bar.appendChild(nav);

    const sep = document.createElement('div');
    sep.style.cssText =
      'height:1px;background:var(--border-subtle);margin:10px 16px';
    bar.appendChild(sep);

    const teachNav = document.createElement('div');
    teachNav.style.cssText =
      'display:flex;flex-direction:column;gap:1px;padding:0 8px';
    NAV.filter(n => n.group === 'teach').forEach(n =>
      teachNav.appendChild(this._navItem(n))
    );
    bar.appendChild(teachNav);

    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    bar.appendChild(spacer);

    // Footer: account row + full prototype popover (profile · XP · actions)
    this._foot = document.createElement('div');
    this._foot.style.cssText =
      'padding:10px;border-top:1px solid var(--border-subtle);position:relative';
    this._paintAccount();
    bar.appendChild(this._foot);

    return bar;
  }

  /** (Re)paint the sidebar account row + popover from the current profile. */
  private _paintAccount(): void {
    const foot = this._foot;
    foot.innerHTML = '';
    let deleteArmed = false;

    const pop = document.createElement('div');
    pop.style.cssText = [
      'position:absolute;bottom:56px;left:10px;width:212px;background:var(--bg-elevated)',
      'border:1px solid var(--border-default);border-radius:10px',
      'box-shadow:0 8px 28px rgba(0,0,0,0.13);padding:6px;display:none',
      'flex-direction:column;gap:1px;z-index:250;animation:nm-rise 0.15s ease-out both'
    ].join(';');

    // Header: avatar + name + email
    const popHead = document.createElement('div');
    popHead.style.cssText =
      'display:flex;align-items:center;gap:10px;padding:8px 10px 10px;border-bottom:1px solid var(--border-subtle);margin-bottom:4px';
    popHead.appendChild(avatar(profile.name, 28));
    const popWho = document.createElement('div');
    popWho.style.cssText =
      'display:flex;flex-direction:column;gap:2px;min-width:0';
    popWho.innerHTML =
      `<span style="font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-primary)">${profile.name}</span>` +
      `<span style="font-size:11px;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${profile.email || 'demo mode'}</span>`;
    popHead.appendChild(popWho);
    pop.appendChild(popHead);

    // Total XP row
    const popXp = document.createElement('div');
    popXp.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;padding:6px 10px';
    popXp.innerHTML =
      '<span style="font-size:12px;color:var(--text-tertiary)">Total XP</span>' +
      `<span class="nm-pop-xp" style="font-size:12px;font-weight:600;color:var(--accent-text);font-family:var(--font-mono)">${pointsEngine.total}</span>`;
    pop.appendChild(popXp);

    const popItem = (
      svg: string,
      label: string,
      onClick: () => void,
      danger = false
    ): HTMLElement => {
      const item = document.createElement('div');
      item.style.cssText =
        `display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:6px;cursor:pointer;font-size:12.5px;font-weight:500;white-space:nowrap;transition:background-color var(--dur-fast) var(--ease-out);color:${danger ? 'var(--red-400)' : 'var(--text-secondary)'}`;
      item.innerHTML = `${svg}<span class="nm-pop-lbl">${label}</span>`;
      item.addEventListener('mouseenter', () => {
        item.style.background = danger ? 'var(--red-bg)' : 'rgba(0,0,0,0.05)';
        if (!danger) item.style.color = 'var(--text-primary)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
        if (!danger) item.style.color = 'var(--text-secondary)';
      });
      item.addEventListener('click', onClick);
      return item;
    };

    // Add friends
    pop.appendChild(
      popItem(
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>',
        'Add friends',
        () => {
          pop.style.display = 'none';
          this.navigate('friends');
        }
      )
    );

    // Sign out
    pop.appendChild(
      popItem(
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>',
        'Sign out',
        () => {
          pop.style.display = 'none';
          this._signOut(false);
        }
      )
    );

    // Divider + Delete account (arm → confirm, prototype behavior)
    const sep = document.createElement('div');
    sep.style.cssText = 'height:1px;background:var(--border-subtle);margin:4px 6px';
    pop.appendChild(sep);
    const del = popItem(
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
      'Delete account',
      () => {
        if (!deleteArmed) {
          deleteArmed = true;
          del.style.background = 'var(--red-bg)';
          const lbl = del.querySelector('.nm-pop-lbl');
          if (lbl) lbl.textContent = 'Confirm — delete everything';
          return;
        }
        pop.style.display = 'none';
        this._signOut(true);
      },
      true
    );
    pop.appendChild(del);
    foot.appendChild(pop);

    // Account row
    const acct = document.createElement('div');
    acct.style.cssText =
      'display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:8px;cursor:pointer;transition:background-color var(--dur-fast) var(--ease-out)';
    acct.appendChild(avatar(profile.name, 28));
    const who = document.createElement('div');
    who.style.cssText =
      'display:flex;flex-direction:column;gap:2px;min-width:0;flex:1';
    this._ptsBadge = document.createElement('span');
    this._ptsBadge.style.cssText =
      'font-size:11px;color:var(--accent-text);font-weight:500;font-family:var(--font-mono)';
    this._ptsBadge.textContent = `${pointsEngine.total} XP`;
    const nameEl = document.createElement('span');
    nameEl.style.cssText =
      'font-size:13px;font-weight:500;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    nameEl.textContent = profile.name;
    who.appendChild(nameEl);
    who.appendChild(this._ptsBadge);
    const chev = document.createElement('span');
    chev.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 15 12 20 17 15"></polyline><polyline points="7 9 12 4 17 9"></polyline></svg>';
    chev.style.flexShrink = '0';
    acct.appendChild(who);
    acct.appendChild(chev);
    acct.addEventListener('mouseenter', () => {
      acct.style.background = 'rgba(0,0,0,0.04)';
    });
    acct.addEventListener('mouseleave', () => {
      acct.style.background = 'transparent';
    });
    acct.addEventListener('click', () => {
      const open = pop.style.display !== 'none';
      pop.style.display = open ? 'none' : 'flex';
      deleteArmed = false;
      const lbl = del.querySelector('.nm-pop-lbl');
      if (lbl) lbl.textContent = 'Delete account';
      del.style.background = 'transparent';
      const xpEl = pop.querySelector('.nm-pop-xp');
      if (xpEl) xpEl.textContent = String(pointsEngine.total);
    });
    foot.appendChild(acct);
  }

  /** Sign out (optionally wiping all local progress) and show the login overlay. */
  private _signOut(wipe: boolean): void {
    if (wipe) {
      pointsEngine.reset();
      this.notebooksCompleted = 0;
      this.cellsAttempted = 0;
      this.cellsFirstTry = 0;
      this.xp.reset();
      invited.length = 0;
      MATES.forEach(m => {
        m.me = false;
      });
    }
    clearUser();
    this.doc = null;
    this.navigate('home');
    const login = new LoginWidget(() => {
      login.node.remove();
      this._paintAccount();
      this.navigate('home');
    });
    const shellNode =
      document.querySelector('#main') ??
      document.querySelector('.jp-LabShell') ??
      document.body;
    shellNode.appendChild(login.node);
  }

  private _navItem(def: INavDef): HTMLElement {
    const item = document.createElement('div');
    item.style.cssText = [
      'display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:6px;cursor:pointer',
      'font-family:var(--font-sans);font-size:13px;font-weight:500;letter-spacing:-0.011em',
      'color:var(--text-secondary);transition:background-color var(--dur-fast) var(--ease-out)'
    ].join(';');
    item.innerHTML =
      `<span style="display:inline-flex;width:16px;flex:0 0 auto;color:currentColor">${def.icon}</span>` +
      `<span style="white-space:nowrap">${def.label}</span>`;
    item.addEventListener('mouseenter', () => {
      if (item.dataset.active !== 'true') {
        item.style.background = 'rgba(0,0,0,0.045)';
        item.style.color = 'var(--text-primary)';
      }
    });
    item.addEventListener('mouseleave', () => {
      if (item.dataset.active !== 'true') {
        item.style.background = 'transparent';
        item.style.color = 'var(--text-secondary)';
      }
    });
    item.addEventListener('click', () => {
      if (def.screen === 'teacher') {
        // Your own course → you ARE the teacher; no password gate.
        if (activeCourse().isOwn) {
          this.navigate('teacher');
        } else {
          openTeacherLogin(this);
        }
      } else {
        this.navigate(def.screen);
      }
    });
    this._navBtns[def.key] = item;
    return item;
  }

  private _setActiveNav(key: string): void {
    Object.entries(this._navBtns).forEach(([k, el]) => {
      const on = k === key;
      el.dataset.active = on ? 'true' : 'false';
      el.style.background = on ? 'rgba(0,0,0,0.06)' : 'transparent';
      el.style.color = on ? 'var(--text-primary)' : 'var(--text-secondary)';
    });
  }

  private _updateCrumb(): void {
    const docName = this.doc?.name ?? 'Notebook';
    interface ISeg {
      label: string;
      go?: Screen;
    }
    const trail: Record<Screen, ISeg[]> = {
      home: [{ label: 'Course' }],
      library: [{ label: 'Slides & Papers' }],
      reader: [
        { label: 'Slides & Papers', go: 'library' },
        { label: this._readerTitle }
      ],
      board: [{ label: 'Leaderboard' }],
      friends: [
        { label: 'Leaderboard', go: 'board' },
        { label: 'Friends & profile' }
      ],
      coursemap: [{ label: 'Course', go: 'home' }, { label: 'Map' }],
      teacher: [{ label: 'Teacher' }],
      session: [{ label: 'Course', go: 'home' }, { label: docName }],
      learn: [
        { label: 'Course', go: 'home' },
        { label: docName, go: 'session' },
        { label: 'Learn' }
      ],
      explain: [
        { label: 'Course', go: 'home' },
        { label: docName, go: 'session' },
        { label: 'Explain' }
      ],
      complete: [
        { label: 'Course', go: 'home' },
        { label: docName, go: 'session' },
        { label: 'Complete' }
      ]
    };

    this._crumb.innerHTML = '';
    const segs = trail[this._screen];
    segs.forEach((seg, i) => {
      const last = i === segs.length - 1;
      if (i > 0) {
        const sep = document.createElement('span');
        sep.textContent = '›';
        sep.style.cssText = 'color:var(--text-quaternary);font-size:12px';
        this._crumb.appendChild(sep);
      }
      const el = document.createElement('span');
      el.textContent = seg.label;
      el.style.cssText =
        'font-size:12.5px;white-space:nowrap;' +
        (last
          ? 'color:var(--text-primary);font-weight:500'
          : 'color:var(--text-tertiary)');
      if (!last && seg.go) {
        el.style.cursor = 'pointer';
        el.addEventListener('mouseenter', () => {
          el.style.color = 'var(--text-primary)';
        });
        el.addEventListener('mouseleave', () => {
          el.style.color = 'var(--text-tertiary)';
        });
        el.addEventListener('click', () => this.navigate(seg.go as Screen));
      }
      this._crumb.appendChild(el);
    });

    // Contextual topbar extras (prototype: course → map button, session → run XP)
    if (this._screen === 'home') {
      const mapBtn = button('Open course map', 'secondary');
      mapBtn.style.height = 'var(--control-sm)';
      mapBtn.style.fontSize = '12px';
      mapBtn.addEventListener('click', () => this.navigate('coursemap'));
      this._actions.appendChild(mapBtn);
    } else if (this._screen === 'session') {
      const run = document.createElement('span');
      run.className = 'nm-run-xp';
      run.style.cssText = 'font-size:12px;color:var(--text-tertiary)';
      run.innerHTML = `This run: <span style="color:var(--accent-text);font-weight:500;font-family:var(--font-mono)">+${this.xp.total} XP</span>`;
      this._actions.appendChild(run);
    }
  }

  /** Screens can drop contextual controls into the topbar's right slot. */
  setTopbarActions(...els: HTMLElement[]): void {
    this._actions.innerHTML = '';
    els.forEach(e => this._actions.appendChild(e));
  }

  /** Anonymous student signals (slide requests / unclear explanations). */
  readonly materialRequests: Array<{
    docKey: string;
    cellIndex: number;
    type: string;
    at: number;
  }> = [];

  private _bindEvents(): void {
    document.addEventListener('notebookmind:user', () => {
      this._paintAccount();
    });
    document.addEventListener('notebookmind:points', () => {
      this._ptsBadge.textContent = `${pointsEngine.total} XP`;
      const run = this.node.querySelector('.nm-run-xp');
      if (run) {
        run.innerHTML = `This run: <span style="color:var(--accent-text);font-weight:500;font-family:var(--font-mono)">+${this.xp.total} XP</span>`;
      }
    });
    document.addEventListener('notebookmind:material-request', (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d) {
        this.materialRequests.push({ ...d, at: Date.now() });
      }
    });
  }
}

/** Teacher password gate — prototype "Teacher access" dialog. */
function openTeacherLogin(app: NotebookMindApp): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:1100;background:var(--surface-overlay)',
    'display:flex;align-items:center;justify-content:center;font-family:var(--font-sans)'
  ].join(';');

  const cardEl = document.createElement('div');
  cardEl.style.cssText = [
    'width:330px;background:var(--bg-elevated);border:1px solid var(--border-strong);border-radius:12px',
    'padding:24px;display:flex;flex-direction:column;gap:14px;box-sizing:border-box',
    'box-shadow:0 16px 48px rgba(0,0,0,0.14);animation:nm-rise 0.2s ease-out both'
  ].join(';');

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;flex-direction:column;gap:4px';
  head.innerHTML =
    '<span style="font-size:15px;font-weight:600;color:var(--text-primary)">Teacher access</span>' +
    '<span style="font-size:12.5px;color:var(--text-tertiary)">The dashboard is password-protected.</span>';

  const field = document.createElement('div');
  field.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  const lbl = document.createElement('span');
  lbl.style.cssText =
    'font-size:12px;font-weight:500;color:var(--text-secondary)';
  lbl.textContent = 'Password';
  const inputWrap = document.createElement('div');
  inputWrap.style.cssText = [
    'display:flex;align-items:center;height:var(--control-md);padding:0 10px',
    'background:var(--surface-input);border:1px solid var(--border-default);border-radius:var(--radius-control)',
    'transition:border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)'
  ].join(';');
  const input = document.createElement('input');
  input.type = 'password';
  input.placeholder = '••••••';
  input.style.cssText =
    'flex:1;min-width:0;height:100%;background:transparent;border:none;outline:none;color:var(--text-primary);font-family:var(--font-sans);font-size:14px;letter-spacing:-0.01em';
  inputWrap.appendChild(input);
  input.addEventListener('focus', () => {
    inputWrap.style.borderColor = 'var(--accent)';
    inputWrap.style.boxShadow = 'var(--ring)';
  });
  input.addEventListener('blur', () => {
    inputWrap.style.borderColor = 'var(--border-default)';
    inputWrap.style.boxShadow = 'none';
  });
  const err = document.createElement('span');
  err.style.cssText =
    'font-size:12px;color:var(--red-500);min-height:15px;line-height:1.4';
  field.appendChild(lbl);
  field.appendChild(inputWrap);
  field.appendChild(err);

  const dispose = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const submit = (): void => {
    if (input.value.trim() === '123') {
      dispose();
      app.navigate('teacher');
    } else {
      err.textContent = 'Wrong password.';
      inputWrap.style.borderColor = 'var(--red-500)';
      input.value = '';
      input.focus();
    }
  };
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      dispose();
    }
  }
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      submit();
    }
  });

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
  const cancel = button('Cancel', 'ghost');
  cancel.addEventListener('click', dispose);
  const enter = button('Unlock', 'primary');
  enter.addEventListener('click', submit);
  row.appendChild(cancel);
  row.appendChild(enter);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      dispose();
    }
  });
  document.addEventListener('keydown', onKey);

  cardEl.appendChild(head);
  cardEl.appendChild(field);
  cardEl.appendChild(row);
  overlay.appendChild(cardEl);
  document.body.appendChild(overlay);
  setTimeout(() => input.focus(), 50);
}
