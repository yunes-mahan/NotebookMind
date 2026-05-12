import { Widget } from '@lumino/widgets';
import { INotebookTracker } from '@jupyterlab/notebook';
import { renderLearnTab } from './cellPanel';
import { renderQuizTab } from './quiz';
import { renderFlashcardTab } from './flashcard';
import { renderLeaderboard } from './leaderboard';
import { renderHeatmap } from './heatmap';
import { renderDependencyGraph } from './dependencyGraph';
import { renderAbbreviations } from './abbreviationPanel';
import {
  generateQuiz,
  generateFlashcards,
  detectAbbreviations,
  estimateDifficulty,
  generateDependencyGraph
} from './gemini';
import { pointsEngine } from './points';
import { progressTracker } from './progressTracker';

type TabId = 'learn' | 'quiz' | 'cards' | 'board' | 'stats';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'learn', label: '📖 Learn' },
  { id: 'quiz', label: '🧠 Quiz' },
  { id: 'cards', label: '🃏 Cards' },
  { id: 'board', label: '🏆 Board' },
  { id: 'stats', label: '📊 Stats' }
];

export class NotebookMindPanel extends Widget {
  private _activeTab: TabId = 'learn';
  private _cellSource = '';
  private _cellId = '';
  private _tabBtns = new Map<TabId, HTMLButtonElement>();
  private _tabContents = new Map<TabId, HTMLElement>();
  private _tracker: INotebookTracker;
  private _difficulties: number[] = [];
  private _geminiReady = false;
  private _pointsBadge: HTMLElement | null = null;

  constructor(tracker: INotebookTracker) {
    super();
    this._tracker = tracker;
    this.id = 'notebookmind-panel';
    this.title.label = '📓';
    this.title.caption = 'NotebookMind';
    this.addClass('nm-panel');
    this._build();
    this._bindEvents();
  }

  setGeminiReady(ready: boolean): void {
    this._geminiReady = ready;
  }

  showError(msg: string): void {
    const banner = this.node.querySelector<HTMLElement>('#nm-error-banner');
    if (banner) {
      banner.innerHTML = `⚠️ ${msg}`;
      banner.style.display = 'block';
    }
  }

  updateCell(source: string, cellId: string): void {
    this._cellSource = source;
    this._cellId = cellId;
    this._rerenderActiveAndReset();
  }

  private _rerenderActiveAndReset(): void {
    const learnDiv = this._tabContents.get('learn');
    if (learnDiv) { renderLearnTab(learnDiv, this._cellSource, this._cellId); }

    const quizDiv = this._tabContents.get('quiz');
    if (quizDiv) {
      renderQuizTab(quizDiv, this._cellSource, type =>
        generateQuiz(this._cellSource, type)
      );
    }

    const cardsDiv = this._tabContents.get('cards');
    if (cardsDiv) {
      renderFlashcardTab(cardsDiv, this._cellSource, () =>
        generateFlashcards(this._cellSource)
      );
    }
  }

  private _build(): void {
    Object.assign(this.node.style, {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#F9FAFB',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      minWidth: '280px',
      overflow: 'hidden'
    });

    // ── Header ──────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = [
      'background:linear-gradient(135deg,#7C3AED 0%,#5B21B6 100%)',
      'padding:14px 16px;display:flex;align-items:center',
      'justify-content:space-between;flex-shrink:0'
    ].join(';');

    const logoArea = document.createElement('div');
    logoArea.style.cssText =
      'font-size:14px;font-weight:700;color:white;display:flex;align-items:center;gap:6px';
    logoArea.innerHTML = '<span style="font-size:18px">📓</span><span>NotebookMind</span>';

    this._pointsBadge = document.createElement('div');
    this._pointsBadge.style.cssText = [
      'background:rgba(255,255,255,0.22);color:white',
      'padding:4px 11px;border-radius:20px;font-size:12px;font-weight:600'
    ].join(';');
    this._pointsBadge.textContent = '0 pts';

    header.appendChild(logoArea);
    header.appendChild(this._pointsBadge);

    // ── Error banner (hidden) ────────────────────────────────────────────────
    const errorBanner = document.createElement('div');
    errorBanner.id = 'nm-error-banner';
    errorBanner.style.cssText = [
      'background:#FEE2E2;border-bottom:1px solid #FECACA',
      'padding:10px 16px;font-size:12px;color:#991B1B;display:none;line-height:1.55'
    ].join(';');

    // ── Tab bar ──────────────────────────────────────────────────────────────
    const tabBar = document.createElement('div');
    tabBar.style.cssText = [
      'display:flex;background:#FFFFFF;border-bottom:2px solid #E5E7EB',
      'flex-shrink:0;overflow-x:auto'
    ].join(';');

    TABS.forEach(tab => {
      const btn = document.createElement('button');
      btn.textContent = tab.label;
      btn.style.cssText = [
        'flex:1;min-width:0;padding:10px 2px;border:none;background:transparent',
        'font-size:11px;cursor:pointer;font-weight:500;color:#6B7280',
        'border-bottom:2px solid transparent;margin-bottom:-2px',
        'transition:all 0.18s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
      ].join(';');
      btn.title = tab.label;
      btn.addEventListener('click', () => this._switchTab(tab.id));
      this._tabBtns.set(tab.id, btn);
      tabBar.appendChild(btn);
    });

    // ── Content area ─────────────────────────────────────────────────────────
    const contentArea = document.createElement('div');
    contentArea.style.cssText = 'flex:1;overflow-y:auto;padding:16px;min-height:0';

    TABS.forEach(tab => {
      const div = document.createElement('div');
      div.style.display = 'none';
      this._tabContents.set(tab.id, div);
      contentArea.appendChild(div);
    });

    this.node.appendChild(header);
    this.node.appendChild(errorBanner);
    this.node.appendChild(tabBar);
    this.node.appendChild(contentArea);

    this._switchTab('learn');
  }

  private _switchTab(id: TabId): void {
    this._activeTab = id;

    this._tabBtns.forEach((btn, tabId) => {
      const active = tabId === id;
      btn.style.color = active ? '#7C3AED' : '#6B7280';
      btn.style.borderBottomColor = active ? '#7C3AED' : 'transparent';
      btn.style.fontWeight = active ? '700' : '500';
      btn.style.background = active ? '#FAFAFF' : 'transparent';
    });

    this._tabContents.forEach((div, tabId) => {
      div.style.display = tabId === id ? 'block' : 'none';
    });

    // Lazy-render tabs that need fresh data each time
    const div = this._tabContents.get(id);
    if (!div) { return; }

    if (id === 'learn') {
      renderLearnTab(div, this._cellSource, this._cellId);
    } else if (id === 'quiz') {
      renderQuizTab(div, this._cellSource, type =>
        generateQuiz(this._cellSource, type)
      );
    } else if (id === 'cards') {
      renderFlashcardTab(div, this._cellSource, () =>
        generateFlashcards(this._cellSource)
      );
    } else if (id === 'board') {
      renderLeaderboard(div);
    } else if (id === 'stats') {
      this._renderStats(div);
    }
  }

  private _renderStats(div: HTMLElement): void {
    div.innerHTML = '';

    // Total points
    const ptSection = document.createElement('div');
    ptSection.style.cssText =
      'text-align:center;padding:20px 0 24px;border-bottom:1px solid #F3F4F6;margin-bottom:20px';
    const ptNum = document.createElement('div');
    ptNum.style.cssText = 'font-size:52px;font-weight:800;color:#7C3AED;line-height:1';
    ptNum.textContent = String(pointsEngine.total);
    const ptLabel = document.createElement('div');
    ptLabel.style.cssText = 'font-size:13px;color:#6B7280;margin-top:6px;font-weight:500';
    ptLabel.textContent = 'Total Points Earned';
    ptSection.appendChild(ptNum);
    ptSection.appendChild(ptLabel);

    // Progress bar
    const mastered = progressTracker.getMasteredCount();
    const totalCells = Math.max(progressTracker.getAllStates().size, 1);
    const pct = Math.round((mastered / totalCells) * 100);

    const progSection = document.createElement('div');
    progSection.style.cssText = 'margin-bottom:22px';
    const progLabel = document.createElement('div');
    progLabel.style.cssText = 'font-size:13px;color:#6B7280;margin-bottom:8px;font-weight:500';
    progLabel.textContent = `${mastered} of ${totalCells} cells mastered`;
    const progTrack = document.createElement('div');
    progTrack.style.cssText =
      'background:#E5E7EB;border-radius:8px;height:10px;overflow:hidden';
    const progFill = document.createElement('div');
    progFill.style.cssText = [
      `width:${pct}%;height:100%;background:linear-gradient(90deg,#7C3AED,#10B981)`,
      'border-radius:8px;transition:width 0.6s ease'
    ].join(';');
    progTrack.appendChild(progFill);
    progSection.appendChild(progLabel);
    progSection.appendChild(progTrack);

    // Complexity heatmap
    const heatSection = document.createElement('div');
    heatSection.style.cssText = 'margin-bottom:22px';
    const heatTitle = document.createElement('div');
    heatTitle.style.cssText =
      'font-size:13px;font-weight:600;color:#1F2937;margin-bottom:10px';
    heatTitle.textContent = '🌡 Complexity Heatmap';
    heatSection.appendChild(heatTitle);
    renderHeatmap(heatSection, this._difficulties, idx => this._jumpToCell(idx));

    // Dependency graph
    const graphSection = document.createElement('div');
    graphSection.style.cssText = 'margin-bottom:22px';
    const graphTitle = document.createElement('div');
    graphTitle.style.cssText =
      'font-size:13px;font-weight:600;color:#1F2937;margin-bottom:10px';
    graphTitle.textContent = '🔗 Cell Dependency Graph';
    const graphBtn = document.createElement('button');
    graphBtn.textContent = 'Generate Dependency Graph';
    graphBtn.style.cssText = [
      'width:100%;padding:10px;background:#7C3AED;color:white;border:none',
      'border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:10px',
      'transition:background 0.2s'
    ].join(';');
    graphBtn.addEventListener('mouseenter', () => { graphBtn.style.background = '#6D28D9'; });
    graphBtn.addEventListener('mouseleave', () => { graphBtn.style.background = '#7C3AED'; });
    const graphContainer = document.createElement('div');
    graphBtn.addEventListener('click', async () => {
      graphBtn.textContent = 'Generating...';
      graphBtn.disabled = true;
      const cellSources = this._getAllCellSources();
      try {
        const diagram = await generateDependencyGraph(cellSources);
        await renderDependencyGraph(graphContainer, diagram);
      } catch {
        graphContainer.innerHTML =
          '<div style="color:#EF4444;font-size:13px;padding:10px;background:#FEE2E2;border-radius:8px">Failed to generate graph.</div>';
      } finally {
        graphBtn.textContent = 'Generate Dependency Graph';
        graphBtn.disabled = false;
      }
    });
    graphSection.appendChild(graphTitle);
    graphSection.appendChild(graphBtn);
    graphSection.appendChild(graphContainer);

    // Abbreviations
    const abbrSection = document.createElement('div');
    const abbrTitle = document.createElement('div');
    abbrTitle.style.cssText =
      'font-size:13px;font-weight:600;color:#1F2937;margin-bottom:10px';
    abbrTitle.textContent = '🔤 Import Aliases';
    const abbrBtn = document.createElement('button');
    abbrBtn.textContent = 'Detect Abbreviations';
    abbrBtn.style.cssText = [
      'width:100%;padding:10px;background:#FFFFFF;color:#7C3AED',
      'border:1.5px solid #7C3AED;border-radius:8px;font-size:13px',
      'font-weight:600;cursor:pointer;margin-bottom:10px;transition:background 0.2s'
    ].join(';');
    abbrBtn.addEventListener('mouseenter', () => { abbrBtn.style.background = '#EDE9FE'; });
    abbrBtn.addEventListener('mouseleave', () => { abbrBtn.style.background = '#FFFFFF'; });
    const abbrContainer = document.createElement('div');
    abbrBtn.addEventListener('click', async () => {
      if (!this._cellSource.trim()) {
        abbrContainer.innerHTML =
          '<div style="color:#6B7280;font-size:13px">Select a cell first.</div>';
        return;
      }
      abbrBtn.textContent = 'Detecting...';
      abbrBtn.disabled = true;
      try {
        const abbrs = await detectAbbreviations(this._cellSource);
        renderAbbreviations(abbrContainer, abbrs);
      } catch {
        abbrContainer.innerHTML =
          '<div style="color:#EF4444;font-size:13px">Failed to detect abbreviations.</div>';
      } finally {
        abbrBtn.textContent = 'Detect Abbreviations';
        abbrBtn.disabled = false;
      }
    });
    abbrSection.appendChild(abbrTitle);
    abbrSection.appendChild(abbrBtn);
    abbrSection.appendChild(abbrContainer);

    div.appendChild(ptSection);
    div.appendChild(progSection);
    div.appendChild(heatSection);
    div.appendChild(graphSection);
    div.appendChild(abbrSection);
  }

  private _jumpToCell(index: number): void {
    const nbPanel = this._tracker.currentWidget;
    if (!nbPanel) { return; }
    const cell = nbPanel.content.widgets[index];
    if (cell) {
      nbPanel.content.activeCellIndex = index;
      cell.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  private _getAllCellSources(): string[] {
    const nbPanel = this._tracker.currentWidget;
    if (!nbPanel) { return []; }
    return nbPanel.content.widgets.map(c => c.model.sharedModel.source);
  }

  private _bindEvents(): void {
    document.addEventListener('notebookmind:points', (e: Event) => {
      const detail = (e as CustomEvent<{ total: number }>).detail;
      if (this._pointsBadge) {
        this._pointsBadge.textContent = `${detail.total} pts`;
      }
    });

    document.addEventListener('notebookmind:progress', () => {
      if (this._activeTab === 'stats') {
        const div = this._tabContents.get('stats');
        if (div) { this._renderStats(div); }
      }
    });

    this._tracker.activeCellChanged.connect(async () => {
      const nbPanel = this._tracker.currentWidget;
      if (!nbPanel) { return; }
      const cell = nbPanel.content.activeCell;
      if (!cell) { return; }

      const source = cell.model.sharedModel.source;
      const cellId = cell.model.id;
      this.updateCell(source, cellId);

      if (this._geminiReady && source.trim()) {
        try {
          const idx = nbPanel.content.activeCellIndex;
          this._difficulties[idx] = await estimateDifficulty(source);
        } catch {
          // estimation is best-effort
        }
      }
    });
  }
}
