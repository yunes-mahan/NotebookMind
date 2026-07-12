import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';

import { requestAPI } from './request';
import { NotebookMindApp } from './nbApp';
import { LoginWidget } from './auth';
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
      label: 'Open NotebookMind',
      caption: 'Open the NotebookMind gamified learning panel',
      execute: () => openApp()
    });

    // Add to Command Palette under a named category
    if (palette) {
      palette.addItem({ command: 'notebookmind:open', category: 'NotebookMind' });
    }

    // Inject a persistent orange button into the JupyterLab top bar
    const injectTopBtn = (): boolean => {
      if (document.getElementById('nm-topbar-btn')) return true;
      const target =
        document.querySelector('.jp-MenuBar') ??
        document.querySelector('.lm-MenuBar') ??
        document.querySelector('#jp-top-panel') ??
        document.querySelector('.jp-Toolbar');
      if (!target) return false;
      const btn = document.createElement('button');
      btn.id = 'nm-topbar-btn';
      btn.textContent = '📓 NotebookMind';
      btn.title = 'Open NotebookMind';
      btn.style.cssText = [
        'background:var(--nm-primary);color:#fff;border:none;border-radius:7px',
        'padding:5px 14px;font-size:13px;font-weight:700;cursor:pointer',
        'margin:3px 12px 3px auto;font-family:system-ui,sans-serif;',
        'display:inline-block;vertical-align:middle;flex-shrink:0'
      ].join(';');
      btn.addEventListener('click', () => openApp());
      target.appendChild(btn);
      return true;
    };

    // Retry until the DOM is ready
    if (!injectTopBtn()) {
      const attempts = [500, 1500, 3000, 5000];
      for (const delay of attempts) {
        setTimeout(() => injectTopBtn(), delay);
      }
    }

    // Show login overlay on startup
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
