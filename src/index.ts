import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { requestAPI } from './request';
import { NotebookMindApp } from './nbApp';
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
  activate: async (app: JupyterFrontEnd) => {
    console.log('[NotebookMind] Activating…');

    let config: IConfig = {
      gemini_api_key: '',
      elevenlabs_api_key: '',
      supabase_url: 'PLACEHOLDER',
      supabase_anon_key: 'PLACEHOLDER'
    };

    try {
      config = await requestAPI<IConfig>(
        'config',
        app.serviceManager.serverSettings
      );
      console.log(
        '[NotebookMind] Config loaded. AI key present:',
        !!config.gemini_api_key
      );
    } catch (err) {
      console.error('[NotebookMind] Failed to fetch config from server:', err);
    }

    if (config.gemini_api_key) {
      initGemini(config.gemini_api_key);
    }
    if (config.elevenlabs_api_key) {
      ttsEngine.setApiKey(config.elevenlabs_api_key);
    }

    let appWidget: NotebookMindApp | null = null;

    const openApp = (): void => {
      if (!appWidget || appWidget.isDisposed) {
        appWidget = new NotebookMindApp(app.serviceManager);
      }
      if (!appWidget.isAttached) {
        app.shell.add(appWidget, 'main');
      }
      app.shell.activateById(appWidget.id);
    };

    app.commands.addCommand('notebookmind:open', {
      label: 'Open NotebookMind',
      execute: () => openApp()
    });

    // Demo login wall — always succeeds, then opens the full-screen app.
    const loginWidget = new LoginWidget(() => {
      loginWidget.node.remove();
      openApp();
    });

    const shellNode =
      document.querySelector('#main') ??
      document.querySelector('.jp-LabShell') ??
      document.body;
    shellNode.appendChild(loginWidget.node);
  }
};

export default plugin;
