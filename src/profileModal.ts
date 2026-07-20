import { profile, setProfile } from './friendsData';
import { avatar, button, celebrate } from './uiKit';
import { isConnected } from './supabase';
import { updateProfile } from './supabaseDB';

/**
 * Shared "Edit profile" dialog (prototype style) — upload/replace a profile
 * photo and change the display name. Used from the sidebar account menu and
 * the Friends & profile screen so both entry points behave identically.
 */
export function openProfileModal(onSaved?: () => void): void {
  let pendingAvatar = profile.avatarUrl;

  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:1100;background:var(--surface-overlay);display:flex;align-items:center;justify-content:center;font-family:var(--font-sans)';

  const cardEl = document.createElement('div');
  cardEl.style.cssText = [
    'width:360px;background:var(--bg-elevated);border:1px solid var(--border-strong);border-radius:12px',
    'padding:24px;display:flex;flex-direction:column;gap:16px;box-sizing:border-box',
    'box-shadow:0 16px 48px rgba(0,0,0,0.14);animation:nm-rise 0.2s ease-out both'
  ].join(';');

  cardEl.innerHTML =
    '<div style="display:flex;flex-direction:column;gap:4px">' +
    '<span style="font-size:15px;font-weight:600;color:var(--text-primary)">Edit profile</span>' +
    '<span style="font-size:12.5px;color:var(--text-tertiary)">Your name and photo appear on the leaderboard and to friends.</span>' +
    '</div>';

  // ── Avatar + upload/remove ────────────────────────────────────
  const avatarRow = document.createElement('div');
  avatarRow.style.cssText = 'display:flex;align-items:center;gap:16px';
  const avatarHolder = document.createElement('div');
  const paintAvatar = (): void => {
    avatarHolder.innerHTML = '';
    avatarHolder.appendChild(avatar(nameInput?.value || profile.name, 64, pendingAvatar));
  };
  avatarRow.appendChild(avatarHolder);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pendingAvatar = String(reader.result);
      paintAvatar();
      paintPhotoButtons();
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
  });

  const photoBtns = document.createElement('div');
  photoBtns.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  const uploadBtn = button('Upload photo', 'secondary');
  uploadBtn.style.height = 'var(--control-sm)';
  uploadBtn.addEventListener('click', () => fileInput.click());
  const removeBtn = button('Remove photo', 'ghost');
  removeBtn.style.height = 'var(--control-sm)';
  removeBtn.addEventListener('click', () => {
    pendingAvatar = '';
    paintAvatar();
    paintPhotoButtons();
  });
  const paintPhotoButtons = (): void => {
    uploadBtn.textContent = pendingAvatar ? 'Replace photo' : 'Upload photo';
    removeBtn.style.display = pendingAvatar ? '' : 'none';
  };
  photoBtns.appendChild(uploadBtn);
  photoBtns.appendChild(removeBtn);
  avatarRow.appendChild(photoBtns);
  avatarRow.appendChild(fileInput);
  cardEl.appendChild(avatarRow);

  // ── Display name ──────────────────────────────────────────────
  const field = document.createElement('div');
  field.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  field.innerHTML =
    '<span style="font-size:12px;font-weight:500;color:var(--text-secondary)">Display name</span>';
  const nameInput = document.createElement('input');
  nameInput.value = profile.name === 'Guest' ? '' : profile.name;
  nameInput.placeholder = 'Your name';
  nameInput.style.cssText =
    'width:100%;box-sizing:border-box;height:var(--control-md);padding:0 12px;background:var(--surface-input);color:var(--text-primary);border:1px solid var(--border-default);border-radius:var(--radius-control);font-size:14px;font-family:var(--font-sans);letter-spacing:-0.01em;outline:none;transition:border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)';
  nameInput.addEventListener('focus', () => {
    nameInput.style.borderColor = 'var(--accent)';
    nameInput.style.boxShadow = 'var(--ring)';
  });
  nameInput.addEventListener('blur', () => {
    nameInput.style.borderColor = 'var(--border-default)';
    nameInput.style.boxShadow = 'none';
  });
  nameInput.addEventListener('input', paintAvatar);
  field.appendChild(nameInput);
  cardEl.appendChild(field);

  const err = document.createElement('span');
  err.style.cssText = 'font-size:12px;color:var(--red-400);min-height:15px;margin-top:-8px';
  cardEl.appendChild(err);

  // ── Actions ───────────────────────────────────────────────────
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
  const cancel = button('Cancel', 'ghost');
  const save = button('Save changes', 'primary');
  actions.appendChild(cancel);
  actions.appendChild(save);
  cardEl.appendChild(actions);

  const dispose = (): void => overlay.remove();
  cancel.addEventListener('click', dispose);
  const submit = (): void => {
    const name = nameInput.value.trim();
    if (!name) {
      err.textContent = "Name can't be empty.";
      return;
    }
    setProfile({ name, avatarUrl: pendingAvatar });
    // Persist to the account so the name + photo survive a reload / new device.
    if (isConnected()) {
      void updateProfile({
        display_name: name,
        avatar_url: pendingAvatar || null
      }).catch(() => undefined);
    }
    dispose();
    celebrate('Profile updated');
    onSaved?.();
  };
  save.addEventListener('click', submit);
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      submit();
    }
  });
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      dispose();
    }
  });

  paintAvatar();
  paintPhotoButtons();
  overlay.appendChild(cardEl);
  document.body.appendChild(overlay);
  setTimeout(() => nameInput.focus(), 50);
}
