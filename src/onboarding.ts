import type { NotebookMindApp } from './nbApp';
import { profile } from './friendsData';
import { joinCourse, createOwnCourse } from './courseStore';
import { button, celebrate } from './uiKit';

/**
 * First-run welcome. Students are asked to join a course (invite code);
 * teachers are invited to create their first course. Either can skip and
 * explore the seeded demo course. Marks `profile.onboarded` when done.
 */
export function openOnboarding(app: NotebookMindApp): void {
  const isTeacher = profile.role === 'teacher';

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
    `<span style="font-size:13px;color:var(--text-tertiary);line-height:1.5">${
      isTeacher
        ? 'Create your first course. You’ll get an invite code to share with students, and can upload notebooks and slides.'
        : 'Join your first course with the invite code your teacher gave you. Don’t have one? Try the demo.'
    }</span>` +
    '</div>';

  const field = document.createElement('div');
  field.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  field.innerHTML = `<span style="font-size:12px;font-weight:500;color:var(--text-secondary)">${
    isTeacher ? 'Course name' : 'Invite code'
  }</span>`;
  const input = document.createElement('input');
  input.placeholder = isTeacher ? 'e.g. Statistics 101' : 'e.g. DEMO2025';
  input.style.cssText =
    `width:100%;box-sizing:border-box;height:var(--control-md);padding:0 12px;background:var(--surface-input);color:var(--text-primary);border:1px solid var(--border-default);border-radius:var(--radius-control);font-size:14px;font-family:${
      isTeacher ? 'var(--font-sans)' : 'var(--font-mono)'
    };letter-spacing:${isTeacher ? '-0.01em' : '0.08em'};outline:none;transition:border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)`;
  if (!isTeacher) {
    input.style.textTransform = 'uppercase';
  }
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
  hint.textContent = isTeacher
    ? 'You become the teacher and can manage weeks, notebooks and slides.'
    : 'Ask your teacher for the code. Try DEMO2025 for the demo course.';
  card.appendChild(hint);

  const err = document.createElement('span');
  err.style.cssText = 'font-size:12px;color:var(--red-400);min-height:15px';
  card.appendChild(err);

  const finish = (): void => {
    profile.onboarded = true;
    overlay.remove();
  };

  const primary = button(isTeacher ? 'Create course' : 'Join course', 'primary');
  primary.style.width = '100%';
  const submit = async (): Promise<void> => {
    const v = input.value.trim();
    if (isTeacher) {
      if (v.length < 3) {
        err.textContent = 'Give the course a name (at least 3 characters).';
        return;
      }
      primary.disabled = true;
      primary.textContent = 'Creating…';
      const res = await createOwnCourse(v);
      finish();
      celebrate(`Created ${res.data.subject}`);
      app.navigate('home');
    } else {
      if (v.length < 4) {
        err.textContent = 'Enter a valid invite code (at least 4 characters).';
        return;
      }
      primary.disabled = true;
      primary.textContent = 'Joining…';
      err.textContent = '';
      const res = await joinCourse(v);
      if (!res) {
        err.textContent = 'No course found with that invite code.';
        primary.disabled = false;
        primary.textContent = 'Join course';
        return;
      }
      finish();
      celebrate(`Joined ${res.data.subject}`);
      app.navigate('home');
    }
  };
  primary.addEventListener('click', () => void submit());
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      void submit();
    }
  });
  card.appendChild(primary);

  const skip = document.createElement('span');
  skip.style.cssText =
    'align-self:center;font-size:12.5px;color:var(--text-tertiary);cursor:pointer;padding:4px;transition:color var(--dur-fast) var(--ease-out)';
  skip.textContent = isTeacher ? 'Skip for now' : 'Skip — explore the demo course';
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
