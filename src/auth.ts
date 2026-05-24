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
      background: 'rgba(28,40,64,0.55)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '10000',
      backdropFilter: 'blur(4px)',
      fontFamily: 'var(--nm-font, system-ui, sans-serif)'
    });

    const card = document.createElement('div');
    Object.assign(card.style, {
      background: '#FFFFFF',
      borderRadius: '16px',
      padding: '48px 40px',
      width: '380px',
      border: '1px solid var(--nm-border, #e4e7ec)',
      boxShadow: '0 24px 64px rgba(16,24,40,0.22)',
      textAlign: 'center',
      boxSizing: 'border-box'
    });

    const logo = this._el('div', '📓', {
      fontSize: '52px',
      marginBottom: '12px'
    });

    const title = this._el('div', 'NotebookMind', {
      fontSize: '30px',
      fontWeight: '800',
      letterSpacing: '-0.02em',
      color: 'var(--nm-text, #1c1d1f)',
      marginBottom: '6px'
    });

    const sub = this._el('div', 'Gamified learning for Jupyter Notebooks', {
      fontSize: '14px',
      color: 'var(--nm-text-secondary, #505967)',
      marginBottom: '20px'
    });

    // Demo notice banner — prominent, can't miss it
    const demoBanner = document.createElement('div');
    Object.assign(demoBanner.style, {
      background: 'var(--nm-accent-light, #e5eeff)',
      border: '1px solid var(--nm-accent-border, #b8d0ff)',
      borderRadius: '10px',
      padding: '10px 14px',
      marginBottom: '22px',
      fontSize: '13px',
      color: 'var(--nm-accent-hover, #2660bf)',
      lineHeight: '1.5'
    });
    demoBanner.innerHTML =
      '🔓 <strong>Demo mode</strong> — no account needed.<br>Click <em>Enter NotebookMind</em> to start instantly.';

    const btn = document.createElement('button');
    btn.textContent = '🚀 Enter NotebookMind';
    Object.assign(btn.style, {
      width: '100%',
      padding: '15px',
      background: 'var(--nm-btn-primary, #0e0e0c)',
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      fontSize: '16px',
      fontWeight: '600',
      cursor: 'pointer',
      marginBottom: '14px',
      transition: 'background 160ms cubic-bezier(0.32,0.72,0,1)',
      letterSpacing: '0.2px',
      fontFamily: 'var(--nm-font-sans, system-ui, sans-serif)',
      boxShadow: 'var(--nm-shadow-sm)'
    });
    btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--nm-btn-primary-hover, #2a2a28)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'var(--nm-btn-primary, #0e0e0c)'; });
    btn.addEventListener('click', () => {
      this._onLogin();
      this.dispose();
    });

    const supabaseNote = this._el(
      'div',
      '🔌 Connect Supabase later for real accounts & cloud sync',
      { fontSize: '11px', color: 'var(--nm-text-faint, #9fa1a7)', marginTop: '4px' }
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
