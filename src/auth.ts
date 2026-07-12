import { Widget } from '@lumino/widgets';
import { isConnected, signIn, signUp, getCurrentUser } from './supabase';
import { setUser } from './friendsData';

/** Prototype fallback: derive a display name from the email prefix. */
function nameFromEmail(email: string): string {
  return (
    email
      .split('@')[0]
      .replace(/[._]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase()) || 'Student'
  );
}

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
      background: 'rgba(24,25,32,0.42)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '10000',
      backdropFilter: 'blur(3px)',
      fontFamily: 'var(--font-sans, system-ui, sans-serif)'
    });

    // If already logged in (session persisted), skip the login screen
    if (isConnected() && getCurrentUser()) {
      setTimeout(() => this._onLogin(), 0);
      return;
    }

    const card = document.createElement('div');
    Object.assign(card.style, {
      background: 'var(--bg-elevated)',
      borderRadius: '12px',
      padding: '28px',
      width: '380px',
      maxWidth: 'calc(100vw - 32px)',
      border: '1px solid var(--border-strong)',
      boxShadow: '0 16px 48px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.9)',
      boxSizing: 'border-box',
      animation: 'nm-rise 0.22s cubic-bezier(0.16,1,0.3,1) both'
    });

    // Logo + title
    const logoRow = document.createElement('div');
    logoRow.style.cssText =
      'display:flex;flex-direction:column;gap:6px;align-items:center;text-align:center;margin-bottom:18px';
    logoRow.innerHTML = `
      <div style="width:34px;height:34px;border-radius:9px;background:var(--accent);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 12px var(--brand-glow)">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
      </div>
      <span style="font-size:17px;font-weight:600;letter-spacing:-0.02em;color:var(--text-primary)">NotebookMind</span>
      <span style="font-size:12.5px;color:var(--text-tertiary)">Learn your course notebooks, cell by cell.</span>
    `;
    card.appendChild(logoRow);

    // Tab switcher (Sign In / Create Account)
    let mode: 'signin' | 'signup' = 'signin';
    const tabBar = document.createElement('div');
    tabBar.style.cssText =
      'display:flex;gap:2px;background:var(--bg-base);border:1px solid var(--border-subtle);border-radius:8px;padding:3px;margin-bottom:18px';
    const tabSignIn = this._tabBtn('Sign in', true);
    const tabSignUp = this._tabBtn('Create account', false);
    tabBar.appendChild(tabSignIn);
    tabBar.appendChild(tabSignUp);
    card.appendChild(tabBar);

    // Form fields
    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'margin-bottom:12px;display:none';
    const nameInput = this._field('Display name', 'text', 'Your name');
    nameRow.appendChild(nameInput);
    card.appendChild(nameRow);

    const emailRow = document.createElement('div');
    emailRow.style.cssText = 'margin-bottom:12px';
    const emailInput = this._field('Email', 'email', 'you@university.edu');
    emailRow.appendChild(emailInput);
    card.appendChild(emailRow);

    const passRow = document.createElement('div');
    passRow.style.cssText = 'margin-bottom:12px';
    const passInput = this._field('Password', 'password', '••••••••');
    passRow.appendChild(passInput);
    card.appendChild(passRow);

    // Error display
    const errEl = document.createElement('div');
    errEl.style.cssText = [
      'display:none;background:var(--red-bg);border:1px solid rgba(192,52,52,0.32);border-radius:7px',
      'padding:9px 12px;font-size:12.5px;color:var(--red-400);margin-bottom:12px;line-height:1.45'
    ].join(';');
    card.appendChild(errEl);

    // Submit button
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Sign in';
    Object.assign(submitBtn.style, {
      width: '100%',
      height: 'var(--control-lg, 38px)',
      background: 'var(--accent)',
      color: 'var(--text-onbrand)',
      border: 'none',
      borderRadius: 'var(--radius-control, 6px)',
      fontSize: '14px',
      fontWeight: '500',
      letterSpacing: '-0.01em',
      cursor: 'pointer',
      marginTop: '6px',
      fontFamily: 'inherit',
      boxShadow: 'var(--shadow-brand)',
      transition: 'background-color 100ms ease-out'
    });
    submitBtn.addEventListener('mouseenter', () => {
      submitBtn.style.background = 'var(--accent-hover)';
    });
    submitBtn.addEventListener('mouseleave', () => {
      submitBtn.style.background = 'var(--accent)';
    });
    card.appendChild(submitBtn);

    // Supabase-not-connected fallback
    if (!isConnected()) {
      const noSbBanner = document.createElement('div');
      noSbBanner.style.cssText = [
        'padding:10px 12px;border-radius:7px;background:var(--bg-panel);border:1px solid var(--border-subtle)',
        'font-size:12px;color:var(--text-tertiary);line-height:1.5;margin-top:14px'
      ].join(';');
      noSbBanner.innerHTML =
        'Demo mode — no backend is connected. Any email and password work, and your progress is stored locally in this session.';
      card.appendChild(noSbBanner);
    }

    // Tab switching logic
    const setMode = (m: 'signin' | 'signup') => {
      mode = m;
      const paintTab = (b: HTMLButtonElement, on: boolean) => {
        b.style.background = on ? 'var(--bg-panel)' : 'transparent';
        b.style.boxShadow = on
          ? '0 1px 2px rgba(0,0,0,0.14), 0 0 0 1px var(--border-default)'
          : 'none';
        b.style.color = on ? 'var(--text-primary)' : 'var(--text-tertiary)';
      };
      paintTab(tabSignIn, m === 'signin');
      paintTab(tabSignUp, m === 'signup');
      nameRow.style.display = m === 'signup' ? 'block' : 'none';
      submitBtn.textContent = m === 'signin' ? 'Sign in' : 'Create account';
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

      // Demo / no Supabase fallback — prototype behavior: any email works.
      if (!isConnected()) {
        if (!email || !password) {
          errEl.textContent = 'Enter an email and a password to continue.';
          errEl.style.display = 'block';
          return;
        }
        setUser(
          mode === 'signup' && name ? name : nameFromEmail(email),
          email
        );
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
          submitBtn.textContent = 'Sign in';
          return;
        }
      } else {
        if (!name) {
          errEl.textContent = 'Please enter a display name.';
          errEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create account';
          return;
        }
        const { error } = await signUp(email, password, name);
        if (error) {
          errEl.textContent = error;
          errEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create account';
          return;
        }
        // After sign-up, sign in immediately
        const { error: siErr } = await signIn(email, password);
        if (siErr) {
          errEl.textContent =
            'Account created! Check your email to confirm, then sign in.';
          errEl.style.display = 'block';
          errEl.style.background = 'var(--green-bg)';
          errEl.style.borderColor = 'rgba(23,138,84,0.35)';
          errEl.style.color = 'var(--green-400)';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign in';
          setMode('signin');
          return;
        }
      }

      const u = getCurrentUser();
      setUser(
        (u?.user_metadata?.display_name as string) ||
          name ||
          nameFromEmail(email),
        email
      );
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
      'flex:1;text-align:center;padding:6px 0;border:none;border-radius:5px;font-size:12.5px',
      'font-weight:500;cursor:pointer;font-family:inherit;white-space:nowrap;transition:background-color 0.1s ease-out',
      `background:${active ? 'var(--bg-panel)' : 'transparent'}`,
      `box-shadow:${active ? '0 1px 2px rgba(0,0,0,0.14), 0 0 0 1px var(--border-default)' : 'none'}`,
      `color:${active ? 'var(--text-primary)' : 'var(--text-tertiary)'}`
    ].join(';');
    return btn;
  }

  private _field(label: string, type: string, placeholder: string): HTMLElement {
    const wrap = document.createElement('div');
    const lbl = document.createElement('label');
    lbl.textContent = label;
    lbl.style.cssText =
      'display:block;font-size:12px;font-weight:500;color:var(--text-secondary);margin-bottom:6px';
    const inp = document.createElement('input');
    inp.type = type;
    inp.placeholder = placeholder;
    Object.assign(inp.style, {
      width: '100%',
      height: 'var(--control-md, 32px)',
      padding: '0 10px',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-control, 6px)',
      fontSize: '14px',
      letterSpacing: '-0.01em',
      fontFamily: 'inherit',
      outline: 'none',
      boxSizing: 'border-box',
      color: 'var(--text-primary)',
      background: 'var(--surface-input)',
      transition: 'border-color 100ms ease-out, box-shadow 100ms ease-out'
    });
    inp.addEventListener('focus', () => {
      inp.style.borderColor = 'var(--accent)';
      inp.style.boxShadow = 'var(--ring)';
    });
    inp.addEventListener('blur', () => {
      inp.style.borderColor = 'var(--border-default)';
      inp.style.boxShadow = 'none';
    });
    wrap.appendChild(lbl);
    wrap.appendChild(inp);
    return wrap;
  }
}
