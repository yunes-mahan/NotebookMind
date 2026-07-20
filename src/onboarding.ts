import type { NotebookMindApp } from './nbApp';
import { profile } from './friendsData';
import { joinCourse } from './courseStore';
import { openCourseModal } from './screenHome';
import { button, celebrate } from './uiKit';

/**
 * First-run welcome. Anyone can join a course with an invite code or create
 * their own (becoming its single admin). Skipping lands on the demo course.
 * Marks `profile.onboarded` when done.
 */
export function openOnboarding(app: NotebookMindApp): void {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:1200;background:var(--surface-overlay);display:flex;align-items:center;justify-content:center;font-family:var(--font-sans)';

  const card = document.createElement('div');
  card.style.cssText = [
    'width:400px;max-width:calc(100vw - 32px);background:var(--bg-elevated);border:1px solid var(--border-strong);border-radius:14px',
    'padding:28px;display:flex;flex-direction:column;gap:16px;box-sizing:border-box',
    'box-shadow:0 20px 56px rgba(0,0,0,0.18);animation:nm-rise 0.22s cubic-bezier(0.16,1,0.3,1) both'
  ].join(';');

  const firstName = (profile.name || 'there').split(/\s+/)[0];
  card.innerHTML =
    '<div style="display:flex;flex-direction:column;gap:6px">' +
    `<span style="font-size:18px;font-weight:600;letter-spacing:-0.02em;color:var(--text-primary)">Welcome, ${firstName}!</span>` +
    '<span style="font-size:13px;color:var(--text-tertiary);line-height:1.5">Join a course with an invite code — or create your own and become its admin.</span>' +
    '</div>';

  const field = document.createElement('div');
  field.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  field.innerHTML =
    '<span style="font-size:12px;font-weight:500;color:var(--text-secondary)">Invite code</span>';
  const input = document.createElement('input');
  input.placeholder = 'e.g. DEMO2025';
  input.style.cssText =
    'width:100%;box-sizing:border-box;height:var(--control-md);padding:0 12px;background:var(--surface-input);color:var(--text-primary);border:1px solid var(--border-default);border-radius:var(--radius-control);font-size:14px;font-family:var(--font-mono);letter-spacing:0.08em;text-transform:uppercase;outline:none;transition:border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)';
  input.addEventListener('focus', () => {
    input.style.borderColor = 'var(--accent)';
    input.style.boxShadow = 'var(--ring)';
  });
  input.addEventListener('blur', () => {
    input.style.borderColor = 'var(--border-default)';
    input.style.boxShadow = 'none';
  });
  field.appendChild(input);
  card.appendChild(field);

  const hint = document.createElement('span');
  hint.style.cssText = 'font-size:11.5px;color:var(--text-quaternary);line-height:1.45;margin-top:-6px';
  hint.textContent = 'Ask your teacher for the code. Try DEMO2025 for the demo course.';
  card.appendChild(hint);

  const err = document.createElement('span');
  err.style.cssText = 'font-size:12px;color:var(--red-400);min-height:15px';
  card.appendChild(err);

  const finish = (): void => {
    profile.onboarded = true;
    overlay.remove();
  };

  const primary = button('Join course', 'primary');
  primary.style.width = '100%';
  const submit = async (): Promise<void> => {
    if (input.value.trim().length < 4) {
      err.textContent = 'Enter a valid invite code (at least 4 characters).';
      return;
    }
    primary.textContent = 'Joining…';
    // DB-backed join when connected (real enrolment), local fallback offline.
    const res = await joinCourse(input.value);
    if (!res) {
      err.textContent = 'No course found with that invite code.';
      primary.textContent = 'Join course';
      return;
    }
    finish();
    celebrate(`Joined ${res.data.subject}`);
    app.navigate('home');
  };
  primary.addEventListener('click', submit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      submit();
    }
  });
  card.appendChild(primary);

  // Create a course instead
  const create = button('Create a course instead', 'secondary');
  create.style.width = '100%';
  create.addEventListener('click', () => {
    finish();
    openCourseModal(app, 'create');
  });
  card.appendChild(create);

  const skip = document.createElement('span');
  skip.style.cssText =
    'align-self:center;font-size:12.5px;color:var(--text-tertiary);cursor:pointer;padding:4px;transition:color var(--dur-fast) var(--ease-out)';
  skip.textContent = 'Skip — explore the demo course';
  skip.addEventListener('mouseenter', () => {
    skip.style.color = 'var(--text-primary)';
  });
  skip.addEventListener('mouseleave', () => {
    skip.style.color = 'var(--text-tertiary)';
  });
  skip.addEventListener('click', () => {
    finish();
    app.navigate('home');
  });
  card.appendChild(skip);

  overlay.appendChild(card);
  document.body.appendChild(overlay);
  setTimeout(() => input.focus(), 60);
}
