import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { INotebookTracker } from '@jupyterlab/notebook';

import { requestAPI } from './request';
import { NotebookMindPanel } from './panel';
import { LoginWidget } from './auth';
import { initGemini } from './gemini';
import { ttsEngine } from './tts';

interface IConfig {
  gemini_api_key: string;
  elevenlabs_api_key: string;
  supabase_url: string;
  supabase_anon_key: string;
}

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'notebookmind:plugin',
  description: 'Gamified learning layer for Jupyter Notebooks',
  autoStart: true,
  requires: [INotebookTracker],
  activate: async (app: JupyterFrontEnd, tracker: INotebookTracker) => {
    console.log('[NotebookMind] Activating…');

    // 1. Fetch config from server extension
    let config: IConfig = {
      gemini_api_key: '',
      elevenlabs_api_key: '',
      supabase_url: 'PLACEHOLDER',
      supabase_anon_key: 'PLACEHOLDER'
    };

    try {
      config = await requestAPI<IConfig>('config', app.serviceManager.serverSettings);
      console.log('[NotebookMind] Config loaded. Gemini key present:', !!config.gemini_api_key);
    } catch (err) {
      console.error('[NotebookMind] Failed to fetch config from server:', err);
    }

    // 2. Init Gemini
    if (config.gemini_api_key) {
      initGemini(config.gemini_api_key);
    }

    // 3. Init TTS (placeholder)
    if (config.elevenlabs_api_key) {
      ttsEngine.setApiKey(config.elevenlabs_api_key);
    }

    // 4. Show login wall — demo mode always succeeds
    const loginWidget = new LoginWidget(() => {
      loginWidget.node.remove();
      _loadPanel();
    });

    // Attach to JupyterLab's main DOM so it renders over everything
    const shellNode =
      document.querySelector('#main') ??
      document.querySelector('.jp-LabShell') ??
      document.body;
    shellNode.appendChild(loginWidget.node);

    function _loadPanel(): void {
      const panel = new NotebookMindPanel(tracker);

      if (!config.gemini_api_key) {
        panel.showError(
          '<strong>GEMINI_API_KEY not set.</strong> ' +
          'Restart JupyterLab with: ' +
          '<code style="background:#FCA5A5;padding:2px 6px;border-radius:4px">GEMINI_API_KEY=your_key jupyter lab</code>'
        );
      } else {
        panel.setGeminiReady(true);
      }

      app.shell.add(panel, 'right', { rank: 700 });
      app.shell.activateById(panel.id);

      // Populate with the currently active cell (if any)
      const currentNb = tracker.currentWidget;
      if (currentNb?.content.activeCell) {
        const cell = currentNb.content.activeCell;
        panel.updateCell(cell.model.sharedModel.source, cell.model.id);
      }
    }
  }
};

export default plugin;
