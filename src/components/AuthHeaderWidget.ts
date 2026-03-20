import { authClient } from '@/services/auth-client';
import { subscribeAuthState } from '@/services/auth-state';
import type { AuthSession } from '@/services/auth-state';

const DEFAULT_AVATAR_SVG = `<svg class="auth-avatar-default" width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="14" cy="14" r="14" fill="currentColor" opacity="0.15"/>
  <circle cx="14" cy="11" r="4.5" fill="currentColor" opacity="0.6"/>
  <path d="M4 24c0-5.523 4.477-10 10-10s10 4.477 10 10" fill="currentColor" opacity="0.4"/>
</svg>`;

export class AuthHeaderWidget {
  private container: HTMLElement;
  private unsubscribeAuth: (() => void) | null = null;
  private onSignInClick: () => void;
  private onSettingsClick: (() => void) | null = null;
  private dropdownOpen = false;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;
  private escapeHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(onSignInClick: () => void, onSettingsClick?: () => void) {
    this.onSignInClick = onSignInClick;
    this.onSettingsClick = onSettingsClick ?? null;
    this.container = document.createElement('div');
    this.container.className = 'auth-header-widget';

    this.unsubscribeAuth = subscribeAuthState((state: AuthSession) => {
      if (state.isPending) {
        this.container.innerHTML = '';
        return;
      }
      this.render(state);
    });
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public destroy(): void {
    this.closeDropdown();
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth();
      this.unsubscribeAuth = null;
    }
  }

  private render(state: AuthSession): void {
    this.closeDropdown();

    if (!state.user) {
      this.container.innerHTML = `<button class="auth-signin-btn">Sign In</button>`;
      const btn = this.container.querySelector<HTMLButtonElement>('.auth-signin-btn');
      btn?.addEventListener('click', () => this.onSignInClick());
      return;
    }

    const user = state.user;
    const initials = this.getInitials(user.name);
    const avatarContent = user.image
      ? `<img class="auth-avatar-img" src="${this.escapeAttr(user.image)}" alt="${this.escapeAttr(user.name ?? '')}" width="28" height="28" />`
      : initials !== '?'
        ? `<span class="auth-avatar-initials">${this.escapeHtml(initials)}</span>`
        : DEFAULT_AVATAR_SVG;

    const isPro = user.role === 'pro';
    const tierBadgeClass = isPro ? 'auth-tier-badge auth-tier-badge-pro' : 'auth-tier-badge';
    const tierLabel = isPro ? 'Pro' : 'Free';

    this.container.innerHTML = `
      <button class="auth-avatar-btn" aria-label="Account menu" aria-expanded="false">${avatarContent}</button>
      <div class="auth-dropdown" role="menu">
        <div class="auth-dropdown-header">
          <div class="auth-dropdown-avatar">${avatarContent}</div>
          <div class="auth-dropdown-info">
            <strong class="auth-dropdown-name">${this.escapeHtml(user.name ?? 'User')}</strong>
            <span class="auth-dropdown-email">${this.escapeHtml(user.email)}</span>
            <span class="${tierBadgeClass}">${tierLabel}</span>
          </div>
        </div>
        <div class="auth-dropdown-divider"></div>
        <div class="auth-profile-edit" id="authProfileEdit" style="display:none">
          <div class="auth-profile-edit-field">
            <label for="authNameInput">Display Name</label>
            <input id="authNameInput" class="auth-profile-input" type="text" value="${this.escapeAttr(user.name ?? '')}" placeholder="Your name" maxlength="60" />
          </div>
          <div class="auth-profile-edit-field">
            <label for="authAvatarInput">Avatar URL</label>
            <input id="authAvatarInput" class="auth-profile-input" type="url" value="${this.escapeAttr(user.image ?? '')}" placeholder="https://..." maxlength="500" />
          </div>
          <div class="auth-profile-edit-actions">
            <button class="auth-profile-save-btn">Save</button>
            <button class="auth-profile-cancel-btn">Cancel</button>
          </div>
          <div class="auth-profile-msg" id="authProfileMsg"></div>
        </div>
        <button class="auth-dropdown-item" id="authEditProfileBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit Profile
        </button>
        <button class="auth-dropdown-item" id="authSettingsBtn"${this.onSettingsClick ? '' : ' style="display:none"'}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Settings
        </button>
        <div class="auth-dropdown-divider"></div>
        <button class="auth-dropdown-item auth-signout-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign Out
        </button>
      </div>
    `;

    const avatarBtn = this.container.querySelector<HTMLButtonElement>('.auth-avatar-btn');
    avatarBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.dropdownOpen) {
        this.closeDropdown();
      } else {
        this.openDropdown();
      }
    });

    const editProfileBtn = this.container.querySelector<HTMLButtonElement>('#authEditProfileBtn');
    editProfileBtn?.addEventListener('click', () => this.toggleEditMode(true));

    const cancelBtn = this.container.querySelector<HTMLButtonElement>('.auth-profile-cancel-btn');
    cancelBtn?.addEventListener('click', () => this.toggleEditMode(false));

    const saveBtn = this.container.querySelector<HTMLButtonElement>('.auth-profile-save-btn');
    saveBtn?.addEventListener('click', () => this.saveProfile());

    const settingsBtn = this.container.querySelector<HTMLButtonElement>('#authSettingsBtn');
    settingsBtn?.addEventListener('click', () => {
      this.closeDropdown();
      this.onSettingsClick?.();
    });

    const signOutBtn = this.container.querySelector<HTMLButtonElement>('.auth-signout-btn');
    signOutBtn?.addEventListener('click', async () => {
      try {
        await authClient.signOut();
      } catch (err) {
        console.warn('[auth-widget] Sign out error:', err);
      }
    });
  }

  private toggleEditMode(show: boolean): void {
    const editSection = this.container.querySelector<HTMLElement>('#authProfileEdit');
    const editBtn = this.container.querySelector<HTMLButtonElement>('#authEditProfileBtn');
    if (!editSection) return;
    editSection.style.display = show ? 'block' : 'none';
    if (editBtn) editBtn.style.display = show ? 'none' : '';
    if (show) {
      this.container.querySelector<HTMLInputElement>('#authNameInput')?.focus();
    }
  }

  private async saveProfile(): Promise<void> {
    const nameInput = this.container.querySelector<HTMLInputElement>('#authNameInput');
    const avatarInput = this.container.querySelector<HTMLInputElement>('#authAvatarInput');
    const msg = this.container.querySelector<HTMLElement>('#authProfileMsg');
    if (!nameInput) return;

    const name = nameInput.value.trim();
    const image = avatarInput?.value.trim() || null;

    if (!name) {
      if (msg) msg.textContent = 'Name cannot be empty.';
      return;
    }

    const saveBtn = this.container.querySelector<HTMLButtonElement>('.auth-profile-save-btn');
    if (saveBtn) saveBtn.disabled = true;
    if (msg) msg.textContent = '';

    const updateUser = (authClient as Record<string, unknown>)['updateUser'];
    if (typeof updateUser !== 'function') {
      if (msg) { msg.textContent = 'Profile updates not available.'; msg.className = 'auth-profile-msg auth-profile-msg-err'; }
      if (saveBtn) saveBtn.disabled = false;
      return;
    }
    try {
      await (updateUser as (data: { name: string; image: string | null }) => Promise<unknown>).call(authClient, { name, image });
      if (msg) { msg.textContent = 'Saved!'; msg.className = 'auth-profile-msg auth-profile-msg-ok'; }
      setTimeout(() => this.toggleEditMode(false), 800);
    } catch (err) {
      console.warn('[auth-widget] Profile update error:', err);
      if (msg) { msg.textContent = 'Failed to save. Try again.'; msg.className = 'auth-profile-msg auth-profile-msg-err'; }
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  private openDropdown(): void {
    const dropdown = this.container.querySelector<HTMLElement>('.auth-dropdown');
    const avatarBtn = this.container.querySelector<HTMLButtonElement>('.auth-avatar-btn');
    if (!dropdown) return;

    dropdown.classList.add('open');
    avatarBtn?.setAttribute('aria-expanded', 'true');
    this.dropdownOpen = true;

    this.outsideClickHandler = (e: MouseEvent) => {
      if (!this.container.contains(e.target as Node)) {
        this.closeDropdown();
      }
    };
    document.addEventListener('click', this.outsideClickHandler);

    this.escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.closeDropdown();
    };
    document.addEventListener('keydown', this.escapeHandler);
  }

  private closeDropdown(): void {
    const dropdown = this.container.querySelector<HTMLElement>('.auth-dropdown');
    const avatarBtn = this.container.querySelector<HTMLButtonElement>('.auth-avatar-btn');
    if (dropdown) dropdown.classList.remove('open');
    avatarBtn?.setAttribute('aria-expanded', 'false');
    this.dropdownOpen = false;

    if (this.outsideClickHandler) {
      document.removeEventListener('click', this.outsideClickHandler);
      this.outsideClickHandler = null;
    }
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler);
      this.escapeHandler = null;
    }
  }

  private getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '?';
    if (parts.length === 1) return first.toUpperCase();
    const last = parts[parts.length - 1]?.[0] ?? '';
    return (first + last).toUpperCase();
  }

  private escapeHtml(str: string): string {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  private escapeAttr(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
