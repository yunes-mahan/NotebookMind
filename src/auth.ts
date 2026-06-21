import { Widget } from '@lumino/widgets';
import { isConnected, signIn, signUp, getCurrentUser } from './supabase';

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
      background: 'rgba(15,15,12,0.60)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '10000',
      backdropFilter: 'blur(6px)',
      fontFamily: 'var(--nm-font-sans, system-ui, sans-serif)'
    });

    // If already logged in (session persisted), skip the login screen
    if (isConnected() && getCurrentUser()) {
      setTimeout(() => this._onLogin(), 0);
      return;
    }

    const card = document.createElement('div');
    Object.assign(card.style, {
      background: '#FFFFFF',
      borderRadius: '18px',
      padding: '44px 40px 36px',
      width: '400px',
      maxWidth: 'calc(100vw - 32px)',
      border: '1px solid #e7e5e0',
      boxShadow: '0 32px 80px rgba(16,24,40,0.26)',
      boxSizing: 'border-box'
    });

    // Logo + title
    const logoRow = document.createElement('div');
    logoRow.style.cssText = 'text-align:center;margin-bottom:28px';
    logoRow.innerHTML = `
      <div style="font-size:48px;margin-bottom:10px">📓</div>
      <div style="font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#0a0a0a;line-height:1.1">NotebookMind</div>
      <div style="font-size:14px;color:#78716c;margin-top:6px">Gamified learning for Jupyter Notebooks</div>
    `;
    card.appendChild(logoRow);

    // Tab switcher (Sign In / Create Account)
    let mode: 'signin' | 'signup' = 'signin';
    const tabBar = document.createElement('div');
    tabBar.style.cssText =
      'display:flex;border-radius:10px;background:#f4f3ef;padding:3px;margin-bottom:24px;gap:3px';
    const tabSignIn = this._tabBtn('Sign In', true);
    const tabSignUp = this._tabBtn('Create Account', false);
    tabBar.appendChild(tabSignIn);
    tabBar.appendChild(tabSignUp);
    card.appendChild(tabBar);

    // Form fields
    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'margin-bottom:14px;display:none';
    const nameInput = this._field('Display name', 'text', 'Your name');
    nameRow.appendChild(nameInput);
    card.appendChild(nameRow);

    const emailRow = document.createElement('div');
    emailRow.style.cssText = 'margin-bottom:14px';
    const emailInput = this._field('Email', 'email', 'you@university.edu');
    emailRow.appendChild(emailInput);
    card.appendChild(emailRow);

    const passRow = document.createElement('div');
    passRow.style.cssText = 'margin-bottom:6px';
    const passInput = this._field('Password', 'password', '••••••••');
    passRow.appendChild(passInput);
    card.appendChild(passRow);

    // Error display
    const errEl = document.createElement('div');
    errEl.style.cssText = [
      'display:none;background:#fce7ec;border:1px solid #f3a8b8;border-radius:8px',
      'padding:10px 14px;font-size:13px;color:#9b1a36;margin-bottom:14px;line-height:1.45'
    ].join(';');
    card.appendChild(errEl);

    // Submit button
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Sign In';
    Object.assign(submitBtn.style, {
      width: '100%',
      padding: '14px',
      background: 'var(--nm-primary, #fe7030)',
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      fontSize: '15px',
      fontWeight: '700',
      cursor: 'pointer',
      marginTop: '10px',
      letterSpacing: '0.1px',
      fontFamily: 'inherit',
      transition: 'background 160ms ease'
    });
    submitBtn.addEventListener('mouseenter', () => {
      submitBtn.style.background = 'var(--nm-primary-hover, #ec5f22)';
    });
    submitBtn.addEventListener('mouseleave', () => {
      submitBtn.style.background = 'var(--nm-primary, #fe7030)';
    });
    card.appendChild(submitBtn);

    // Supabase-not-connected fallback
    if (!isConnected()) {
      const noSbBanner = document.createElement('div');
      noSbBanner.style.cssText = [
        'background:#faf1d6;border:1px solid #e8d28b;border-radius:10px',
        'padding:10px 14px;font-size:12.5px;color:#7c5c0f;line-height:1.5;margin-top:18px'
      ].join(';');
      noSbBanner.innerHTML =
        '⚠️ <strong>No Supabase connection.</strong> Set <code>SUPABASE_URL</code> + <code>SUPABASE_ANON_KEY</code> in start.ps1 and restart. Clicking <em>Sign In</em> will enter demo mode.';
      card.appendChild(noSbBanner);
    }

    // Tab switching logic
    const setMode = (m: 'signin' | 'signup') => {
      mode = m;
      tabSignIn.style.background = m === 'signin' ? '#fff' : 'transparent';
      tabSignIn.style.boxShadow =
        m === 'signin' ? '0 1px 4px rgba(0,0,0,0.12)' : 'none';
      tabSignUp.style.background = m === 'signup' ? '#fff' : 'transparent';
      tabSignUp.style.boxShadow =
        m === 'signup' ? '0 1px 4px rgba(0,0,0,0.12)' : 'none';
      nameRow.style.display = m === 'signup' ? 'block' : 'none';
      submitBtn.textContent = m === 'signin' ? 'Sign In' : 'Create Account';
      errEl.style.display = 'none';
    };
    tabSignIn.addEventListener('click', () => setMode('signin'));
    tabSignUp.addEventListener('click', () => setMode('signup'));

    // Submit handler
    const handleSubmit = async () => {
      const email = (emailRow.querySelector('input') as HTMLInputElement).value.trim();
      const password = (passRow.querySelector('input') as HTMLInputElement).value;
      const name = (nameRow.querySelector('input') as HTMLInputElement).value.trim();

      errEl.style.display = 'none';

      // Demo / no Supabase fallback
      if (!isConnected()) {
        this._onLogin();
        this.dispose();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = mode === 'signin' ? 'Signing in…' : 'Creating account…';

      if (mode === 'signin') {
        const { error } = await signIn(email, password);
        if (error) {
          errEl.textContent = error;
          errEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign In';
          return;
        }
      } else {
        if (!name) {
          errEl.textContent = 'Please enter a display name.';
          errEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Account';
          return;
        }
        const { error } = await signUp(email, password, name);
        if (error) {
          errEl.textContent = error;
          errEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Account';
          return;
        }
        // After sign-up, sign in immediately
        const { error: siErr } = await signIn(email, password);
        if (siErr) {
          errEl.textContent =
            'Account created! Check your email to confirm, then sign in.';
          errEl.style.display = 'block';
          errEl.style.background = '#dcf0e5';
          errEl.style.borderColor = '#7cc9a0';
          errEl.style.color = '#1f6644';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign In';
          setMode('signin');
          return;
        }
      }

      this._onLogin();
      this.dispose();
    };

    submitBtn.addEventListener('click', handleSubmit);
    // Allow Enter key
    [emailInput, passInput, nameInput].forEach(inp => {
      inp.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          handleSubmit();
        }
      });
    });

    this.node.appendChild(card);
  }

  private _tabBtn(label: string, active: boolean): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = [
      'flex:1;padding:8px 12px;border:none;border-radius:8px;font-size:13.5px',
      'font-weight:600;cursor:pointer;font-family:inherit;transition:all 140ms ease',
      `background:${active ? '#fff' : 'transparent'}`,
      `box-shadow:${active ? '0 1px 4px rgba(0,0,0,0.12)' : 'none'}`,
      `color:${active ? '#0a0a0a' : '#78716c'}`
    ].join(';');
    return btn;
  }

  private _field(label: string, type: string, placeholder: string): HTMLElement {
    const wrap = document.createElement('div');
    const lbl = document.createElement('label');
    lbl.textContent = label;
    lbl.style.cssText =
      'display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:5px';
    const inp = document.createElement('input');
    inp.type = type;
    inp.placeholder = placeholder;
    Object.assign(inp.style, {
      width: '100%',
      padding: '11px 14px',
      border: '1.5px solid #e7e5e0',
      borderRadius: '9px',
      fontSize: '14px',
      fontFamily: 'inherit',
      outline: 'none',
      boxSizing: 'border-box',
      color: '#0a0a0a',
      background: '#fafaf7',
      transition: 'border-color 140ms ease'
    });
    inp.addEventListener('focus', () => {
      inp.style.borderColor = 'var(--nm-primary, #fe7030)';
      inp.style.background = '#fff';
    });
    inp.addEventListener('blur', () => {
      inp.style.borderColor = '#e7e5e0';
      inp.style.background = '#fafaf7';
    });
    wrap.appendChild(lbl);
    wrap.appendChild(inp);
    return wrap;
  }
}
