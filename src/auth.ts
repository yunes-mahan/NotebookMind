import { Widget } from '@lumino/widgets';

export class LoginWidget extends Widget {
  private _onLogin: () => void;

  constructor(onLogin: () => void) {
    super();
    this._onLogin = onLogin;
    this.addClass('nm-login-overlay');
    this._build();
  }

  private _build(): void {
    Object.assign(this.node.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      background: 'rgba(17,17,17,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '10000',
      backdropFilter: 'blur(4px)',
      fontFamily: 'system-ui, sans-serif'
    });

    const card = document.createElement('div');
    Object.assign(card.style, {
      background: '#FFFFFF',
      borderRadius: '20px',
      padding: '48px 40px',
      width: '380px',
      boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
      textAlign: 'center',
      boxSizing: 'border-box'
    });

    const logo = this._el('div', '📓', {
      fontSize: '52px',
      marginBottom: '12px'
    });

    const title = this._el('div', 'NotebookMind', {
      fontSize: '30px',
      fontWeight: '700',
      color: '#7C3AED',
      marginBottom: '6px'
    });

    const sub = this._el('div', 'Gamified learning for Jupyter Notebooks', {
      fontSize: '14px',
      color: '#6B7280',
      marginBottom: '20px'
    });

    // Demo notice banner — prominent, can't miss it
    const demoBanner = document.createElement('div');
    Object.assign(demoBanner.style, {
      background: '#EDE9FE',
      border: '1.5px solid #C4B5FD',
      borderRadius: '10px',
      padding: '10px 14px',
      marginBottom: '22px',
      fontSize: '13px',
      color: '#5B21B6',
      lineHeight: '1.5'
    });
    demoBanner.innerHTML =
      '🔓 <strong>Demo mode</strong> — no account needed.<br>Click <em>Enter NotebookMind</em> to start instantly.';

    const btn = document.createElement('button');
    btn.textContent = '🚀 Enter NotebookMind';
    Object.assign(btn.style, {
      width: '100%',
      padding: '16px',
      background: '#7C3AED',
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      fontSize: '16px',
      fontWeight: '700',
      cursor: 'pointer',
      marginBottom: '14px',
      transition: 'background 0.2s',
      letterSpacing: '0.3px',
      fontFamily: 'system-ui, sans-serif'
    });
    btn.addEventListener('mouseenter', () => { btn.style.background = '#6D28D9'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#7C3AED'; });
    btn.addEventListener('click', () => {
      this._onLogin();
      this.dispose();
    });

    const supabaseNote = this._el(
      'div',
      '🔌 Connect Supabase later for real accounts & cloud sync',
      { fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }
    );

    [logo, title, sub, demoBanner, btn, supabaseNote].forEach(el =>
      card.appendChild(el)
    );
    this.node.appendChild(card);
  }

  private _el(
    tag: string,
    text: string,
    styles: Partial<CSSStyleDeclaration>
  ): HTMLElement {
    const el = document.createElement(tag);
    el.textContent = text;
    Object.assign(el.style, styles);
    return el;
  }
}
