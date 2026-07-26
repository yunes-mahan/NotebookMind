import { Widget } from '@lumino/widgets';
import { ServiceManager } from '@jupyterlab/services';

import { INbDoc } from './nbSource';
import { KernelRunner } from './kernelRunner';
import { XpSession } from './xp';
import { IChallenge } from './challenge';
import { pointsEngine } from './points';
import { button, avatar, logoImg } from './uiKit';
import { profile, clearUser, invited, MATES } from './friendsData';
import {
  activeCourse,
  allCourses,
  setActiveCourse,
  leaveCourse,
  deleteCourse,
  loadCoursesFromDB,
  loadProgressFromDB,
  resetToDemoOnly,
  resetProgress
} from './courseStore';
import { LoginWidget } from './auth';
import { signOut } from './supabase';
import { openProfileModal } from './profileModal';
import { openOnboarding } from './onboarding';

import { renderHome, openCourseModal } from './screenHome';
import { renderLibrary } from './screenLibrary';
import { renderSession } from './screenSession';
import { renderExplain } from './screenExplain';
import { renderLearn } from './screenLearn';
import { renderComplete } from './screenComplete';
import { renderBoard } from './screenBoard';
import { renderFriends } from './screenFriends';
import { renderCourseMap } from './screenCourseMap';
import { renderTeacher } from './screenTeacher';
import { renderReader, loadReaderWithPages, showReaderShortcuts } from './screenReader';
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
  private _courseSlot!: HTMLElement;
  private _teachSection!: HTMLElement;
  private readonly _navBtns: Record<string, HTMLElement> = {};

  constructor(services: ServiceManager.IManager) {
    super();
    this.services = services;
    this.runner = new KernelRunner(services);
    this.id = 'notebookmind-app';
    this.title.label = 'Runcell';
    this.title.caption = 'Runcell — gamified learning';
    this.title.closable = true;
    this.addClass('nm-app');
    this._build();
    this._bindEvents();
    this.navigate('home');
    this.maybeOnboard();
  }

  /** First-run: prompt students to join / teachers to create a course. */
  maybeOnboard(): void {
    if (profile.signedIn && !profile.onboarded) {
      openOnboarding(this);
    }
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
    if (this._courseSlot) {
      this._paintCourseSwitcher();
    }
    this._paintTeachSection();
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
    // Shortcuts lives in the topbar row (same layer as the breadcrumb).
    const kb = button('Shortcuts', 'ghost');
    kb.style.height = 'var(--control-sm)';
    kb.style.fontSize = '12px';
    kb.addEventListener('click', () => showReaderShortcuts());
    this._actions.appendChild(kb);
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
      `<span style="display:inline-flex;flex:0 0 auto">${logoImg(18)}</span>` +
      '<span style="font-weight:600;font-size:14px;letter-spacing:-0.018em;color:var(--text-primary)">Runcell</span>';
    bar.appendChild(brand);

    // Course switcher (global: switch · join · create) — always visible
    this._courseSlot = document.createElement('div');
    this._courseSlot.style.cssText = 'padding:0 8px 4px;position:relative';
    this._paintCourseSwitcher();
    bar.appendChild(this._courseSlot);

    // Nav groups
    const nav = document.createElement('div');
    nav.style.cssText =
      'display:flex;flex-direction:column;gap:1px;padding:4px 8px';
    NAV.filter(n => n.group === 'main').forEach(n =>
      nav.appendChild(this._navItem(n))
    );
    bar.appendChild(nav);

    // Teacher section (separator + Teacher nav) — only shown for teachers.
    this._teachSection = document.createElement('div');
    const sep = document.createElement('div');
    sep.style.cssText =
      'height:1px;background:var(--border-subtle);margin:10px 16px';
    this._teachSection.appendChild(sep);
    const teachNav = document.createElement('div');
    teachNav.style.cssText =
      'display:flex;flex-direction:column;gap:1px;padding:0 8px';
    NAV.filter(n => n.group === 'teach').forEach(n =>
      teachNav.appendChild(this._navItem(n))
    );
    this._teachSection.appendChild(teachNav);
    bar.appendChild(this._teachSection);
    this._paintTeachSection();

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

  /** (Re)paint the sidebar course switcher (switch · join · create). */
  private _paintCourseSwitcher(): void {
    const slot = this._courseSlot;
    slot.innerHTML = '';
    const uc = activeCourse();

    const pop = document.createElement('div');
    pop.style.cssText = [
      'position:absolute;top:44px;left:8px;right:8px;background:var(--bg-elevated)',
      'border:1px solid var(--border-default);border-radius:10px',
      'box-shadow:0 8px 28px rgba(0,0,0,0.13);padding:6px;display:none',
      'flex-direction:column;gap:1px;z-index:250;animation:nm-rise 0.15s ease-out both'
    ].join(';');

    const capLbl = document.createElement('div');
    capLbl.style.cssText =
      'font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-quaternary);padding:6px 8px 4px';
    capLbl.textContent = 'Your courses';
    pop.appendChild(capLbl);

    allCourses().forEach(c => {
      const item = document.createElement('div');
      item.style.cssText =
        'display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;cursor:pointer;transition:background-color var(--dur-fast) var(--ease-out)';
      const info = document.createElement('div');
      info.style.cssText = 'display:flex;flex-direction:column;gap:1px;min-width:0;flex:1';
      info.innerHTML =
        `<span style="font-size:12.5px;font-weight:500;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.data.subject}</span>` +
        `<span style="font-size:10.5px;color:var(--text-quaternary);font-family:var(--font-mono)">${c.code}${c.isOwn ? ' · you teach' : ''}</span>`;
      info.addEventListener('click', () => {
        pop.style.display = 'none';
        setActiveCourse(c.id);
        this._paintCourseSwitcher();
        this.navigate('home');
      });
      item.appendChild(info);

      // Right slot: check (active) by default; Leave/Delete only on hover.
      const right = document.createElement('div');
      right.style.cssText =
        'flex:0 0 auto;display:flex;align-items:center;justify-content:flex-end';
      const check = document.createElement('span');
      check.style.cssText = `display:${c.id === uc.id ? 'inline-flex' : 'none'}`;
      check.innerHTML =
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      right.appendChild(check);

      let armed = false;
      const leave = document.createElement('span');
      leave.style.cssText =
        'display:none;font-size:10.5px;font-weight:500;color:var(--text-tertiary);padding:2px 7px;border-radius:5px;cursor:pointer;white-space:nowrap;border:1px solid var(--border-default);transition:color var(--dur-fast) var(--ease-out),background-color var(--dur-fast) var(--ease-out),border-color var(--dur-fast) var(--ease-out)';
      leave.textContent = c.isOwn ? 'Delete' : 'Leave';
      leave.title = c.isOwn ? 'Delete this course' : 'Leave this course';
      leave.addEventListener('mouseenter', () => {
        leave.style.color = 'var(--red-400)';
        leave.style.background = 'var(--red-bg)';
        leave.style.borderColor = 'rgba(192,52,52,0.32)';
      });
      leave.addEventListener('mouseleave', () => {
        if (!armed) {
          leave.style.color = 'var(--text-tertiary)';
          leave.style.background = 'transparent';
          leave.style.borderColor = 'var(--border-default)';
        }
      });
      leave.addEventListener('click', e => {
        e.stopPropagation();
        if (!armed) {
          armed = true;
          leave.textContent = 'Confirm';
          leave.style.color = 'var(--red-400)';
          leave.style.background = 'var(--red-bg)';
          leave.style.borderColor = 'rgba(192,52,52,0.32)';
          return;
        }
        if (c.isOwn) {
          deleteCourse(c.id);
        } else {
          leaveCourse(c.id);
        }
        this._paintCourseSwitcher();
        this.navigate('home');
      });
      right.appendChild(leave);
      item.appendChild(right);

      const resetLeave = (): void => {
        armed = false;
        leave.textContent = c.isOwn ? 'Delete' : 'Leave';
        leave.style.color = 'var(--text-tertiary)';
        leave.style.background = 'transparent';
        leave.style.borderColor = 'var(--border-default)';
      };
      item.addEventListener('mouseenter', () => {
        item.style.background = 'rgba(0,0,0,0.05)';
        check.style.display = 'none';
        leave.style.display = 'inline-flex';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
        leave.style.display = 'none';
        resetLeave();
        check.style.display = c.id === uc.id ? 'inline-flex' : 'none';
      });
      pop.appendChild(item);
    });

    const sep = document.createElement('div');
    sep.style.cssText = 'height:1px;background:var(--border-subtle);margin:4px 6px';
    pop.appendChild(sep);

    const action = (svg: string, label: string, onClick: () => void): HTMLElement => {
      const el = document.createElement('div');
      el.style.cssText =
        'display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:6px;cursor:pointer;font-size:12.5px;font-weight:500;color:var(--accent-text);transition:background-color var(--dur-fast) var(--ease-out)';
      el.innerHTML = `${svg}<span>${label}</span>`;
      el.addEventListener('mouseenter', () => {
        el.style.background = 'var(--accent-subtle-bg)';
      });
      el.addEventListener('mouseleave', () => {
        el.style.background = 'transparent';
      });
      el.addEventListener('click', () => {
        pop.style.display = 'none';
        onClick();
      });
      return el;
    };
    pop.appendChild(
      action(
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>',
        'Join a course…',
        () => openCourseModal(this, 'join')
      )
    );
    // Anyone can create a course (they become its single admin).
    pop.appendChild(
      action(
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
        'Create a course…',
        () => openCourseModal(this, 'create')
      )
    );
    slot.appendChild(pop);

    // Trigger row (select-styled)
    const trigger = document.createElement('div');
    trigger.style.cssText = [
      'display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:8px;cursor:pointer',
      'background:var(--bg-panel);border:1px solid var(--border-default)',
      'transition:border-color var(--dur-fast) var(--ease-out)'
    ].join(';');
    trigger.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:1px;min-width:0;flex:1">' +
      `<span style="font-size:12.5px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${uc.data.subject}</span>` +
      `<span style="font-size:10px;color:var(--text-quaternary);font-family:var(--font-mono)">${uc.isOwn ? 'You teach · ' : ''}${uc.code}</span>` +
      '</div>' +
      '<span style="flex:0 0 auto;display:inline-flex;color:var(--text-quaternary)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 15 12 20 17 15"></polyline><polyline points="7 9 12 4 17 9"></polyline></svg></span>';
    trigger.addEventListener('mouseenter', () => {
      trigger.style.borderColor = 'var(--border-strong)';
    });
    trigger.addEventListener('mouseleave', () => {
      trigger.style.borderColor = 'var(--border-default)';
    });
    const onOutside = (e: MouseEvent): void => {
      if (!slot.contains(e.target as Node)) {
        pop.style.display = 'none';
        document.removeEventListener('mousedown', onOutside);
      }
    };
    trigger.addEventListener('click', () => {
      const open = pop.style.display !== 'none';
      pop.style.display = open ? 'none' : 'flex';
      if (open) {
        document.removeEventListener('mousedown', onOutside);
      } else {
        setTimeout(() => document.addEventListener('mousedown', onOutside), 0);
      }
    });
    slot.appendChild(trigger);
  }

  /** Show the admin ("Teacher") nav only for a course you administer —
   * i.e. one you created, or the seeded demo course (showcase). */
  private _paintTeachSection(): void {
    if (this._teachSection) {
      const uc = activeCourse();
      this._teachSection.style.display = uc.isOwn || uc.isDemo ? '' : 'none';
    }
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
    popHead.appendChild(avatar(profile.name, 28, profile.avatarUrl));
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

    // Edit profile (name + photo)
    pop.appendChild(
      popItem(
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
        'Edit profile',
        () => {
          pop.style.display = 'none';
          openProfileModal(() => this._paintAccount());
        }
      )
    );

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
          void this._signOut(false);
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
        void this._signOut(true);
      },
      true
    );
    pop.appendChild(del);
    foot.appendChild(pop);

    // Account row
    const acct = document.createElement('div');
    acct.style.cssText =
      'display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:8px;cursor:pointer;transition:background-color var(--dur-fast) var(--ease-out)';
    acct.appendChild(avatar(profile.name, 28, profile.avatarUrl));
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
    const onOutside = (e: MouseEvent): void => {
      if (!foot.contains(e.target as Node)) {
        pop.style.display = 'none';
        document.removeEventListener('mousedown', onOutside);
      }
    };
    acct.addEventListener('click', () => {
      const open = pop.style.display !== 'none';
      pop.style.display = open ? 'none' : 'flex';
      if (open) {
        document.removeEventListener('mousedown', onOutside);
      } else {
        // Defer so this very click doesn't immediately close the popover.
        setTimeout(() => document.addEventListener('mousedown', onOutside), 0);
      }
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
  private async _signOut(wipe: boolean): Promise<void> {
    // Always clear per-user session state so the next account never inherits the
    // previous user's XP / completion / solved counters. loadProgressFromDB then
    // re-seeds the real totals for whoever signs in next.
    pointsEngine.reset();
    resetProgress();
    this.notebooksCompleted = 0;
    this.cellsAttempted = 0;
    this.cellsFirstTry = 0;
    this.xp.reset();
    if (wipe) {
      invited.length = 0;
      MATES.forEach(m => {
        m.me = false;
      });
    }
    clearUser();
    // End the Supabase session and WAIT for it to complete before showing the
    // login screen. The LoginWidget skips itself while a session still exists
    // (auth.ts), so without awaiting, the first sign-out would leave the old
    // user "logged in" and only a second click would take effect.
    await signOut();
    resetToDemoOnly(); // don't carry this user's DB courses into the next session
    this.doc = null;
    this._paintAccount(); // refresh the sidebar row out of the old account
    this._paintTeachSection();
    this.navigate('home');
    const login = new LoginWidget(() => {
      login.node.remove();
      this._paintAccount();
      this._paintTeachSection();
      void Promise.all([loadCoursesFromDB(), loadProgressFromDB()]).finally(() =>
        this.navigate('home')
      );
      this.maybeOnboard();
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
      this._paintTeachSection();
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
