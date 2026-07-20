import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';

import { requestAPI } from './request';
import { NotebookMindApp } from './nbApp';
import { LoginWidget } from './auth';
import { loadCoursesFromDB, loadProgressFromDB } from './courseStore';
import { initGemini } from './gemini';
import { ttsEngine } from './tts';
import { initSupabase } from './supabase';

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
  optional: [ICommandPalette],
  activate: async (app: JupyterFrontEnd, palette: ICommandPalette | null) => {
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
    if (config.supabase_url && config.supabase_url !== 'PLACEHOLDER') {
      initSupabase(config.supabase_url, config.supabase_anon_key);
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

    // Register command
    app.commands.addCommand('notebookmind:open', {
      label: 'Open Runcell',
      caption: 'Open the Runcell gamified learning panel',
      execute: () => openApp()
    });

    // Add to Command Palette under a named category
    if (palette) {
      palette.addItem({ command: 'notebookmind:open', category: 'Runcell' });
    }

    // (No injected top-bar button — the app opens automatically after login,
    // and can be reopened from the command palette via "Open NotebookMind".)

    // Show login overlay on startup. After login, pull the user's DB courses
    // (taught + enrolled) so they appear before the app renders.
    const loginWidget = new LoginWidget(() => {
      loginWidget.node.remove();
      void Promise.all([loadCoursesFromDB(), loadProgressFromDB()]).finally(() =>
        openApp()
      );
    });

    const shellNode =
      document.querySelector('#main') ??
      document.querySelector('.jp-LabShell') ??
      document.body;
    shellNode.appendChild(loginWidget.node);
  }
};

export default plugin;
