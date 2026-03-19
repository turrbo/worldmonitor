import { authClient } from '@/services/auth-client';
import { subscribeAuthState } from '@/services/auth-state';
import type { AuthSession } from '@/services/auth-state';

const BANNER_DISMISSED_KEY = 'wm-verify-banner-dismissed';

export class AuthHeaderWidget {
  private container: HTMLElement;
  private banner: HTMLElement | null = null;
  private unsubscribeAuth: (() => void) | null = null;
  private onSignInClick: () => void;
  private dropdownOpen = false;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;
  private escapeHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(onSignInClick: () => void) {
    this.onSignInClick = onSignInClick;
    this.container = document.createElement('div');
    this.container.className = 'auth-header-widget';

    this.unsubscribeAuth = subscribeAuthState((state: AuthSession) => {
      if (state.isPending) {
        // Show nothing while pending
        this.container.innerHTML = '';
        this.removeBanner();
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
    this.removeBanner();
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth();
      this.unsubscribeAuth = null;
    }
  }

  private render(state: AuthSession): void {
    this.closeDropdown();

    if (!state.user) {
      // Anonymous state: show Sign In button
      this.container.innerHTML = `<button class="auth-signin-btn">Sign In</button>`;
      const btn = this.container.querySelector<HTMLButtonElement>('.auth-signin-btn');
      btn?.addEventListener('click', () => this.onSignInClick());
      this.removeBanner();
      return;
    }

    // Authenticated state: show avatar button + dropdown
    const user = state.user;
    const initials = this.getInitials(user.name);
    const avatarContent = user.image
      ? `<img class="auth-avatar-img" src="${this.escapeAttr(user.image)}" alt="${this.escapeAttr(user.name)}" width="28" height="28" />`
      : `<span class="auth-avatar-initials">${this.escapeHtml(initials)}</span>`;

    const isPro = user.role === 'pro';
    const tierBadgeClass = isPro ? 'auth-tier-badge auth-tier-badge-pro' : 'auth-tier-badge';
    const tierLabel = isPro ? 'Pro' : 'Free';

    // Verification status indicator in dropdown
    const verificationIndicator = !user.emailVerified
      ? '<span class="auth-verify-status auth-verify-status-unverified"><span class="auth-verify-dot"></span> Unverified</span>'
      : '';

    this.container.innerHTML = `
      <button class="auth-avatar-btn" aria-label="Account menu">${avatarContent}</button>
      <div class="auth-dropdown">
        <div class="auth-dropdown-header">
          <strong>${this.escapeHtml(user.name)}</strong>
          <span>${this.escapeHtml(user.email)}</span>
          ${verificationIndicator}
          <span class="${tierBadgeClass}">${tierLabel}</span>
        </div>
        <div class="auth-dropdown-divider"></div>
        <button class="auth-signout-btn">Sign Out</button>
      </div>
    `;

    // Avatar click toggles dropdown
    const avatarBtn = this.container.querySelector<HTMLButtonElement>('.auth-avatar-btn');
    avatarBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.dropdownOpen) {
        this.closeDropdown();
      } else {
        this.openDropdown();
      }
    });

    // Sign Out button
    const signOutBtn = this.container.querySelector<HTMLButtonElement>('.auth-signout-btn');
    signOutBtn?.addEventListener('click', async () => {
      try {
        await authClient.signOut();
      } catch (err) {
        console.warn('[auth-widget] Sign out error:', err);
      }
      // Auth state subscription will trigger re-render to anonymous state
    });

    // Show/hide verification banner
    if (!user.emailVerified && !sessionStorage.getItem(BANNER_DISMISSED_KEY)) {
      this.showVerificationBanner(user.email);
    } else {
      this.removeBanner();
    }
  }

  private showVerificationBanner(email: string): void {
    // Reuse existing banner if present
    if (this.banner) return;

    this.banner = document.createElement('div');
    this.banner.className = 'auth-verify-banner';
    this.banner.innerHTML = `
      <span class="auth-verify-banner-text">Verify your email to unlock premium features.</span>
      <button class="auth-verify-banner-resend">Resend</button>
      <button class="auth-verify-banner-close" aria-label="Dismiss">&times;</button>
    `;

    // Resend verification email
    const resendBtn = this.banner.querySelector<HTMLButtonElement>('.auth-verify-banner-resend');
    resendBtn?.addEventListener('click', async () => {
      resendBtn.disabled = true;
      resendBtn.textContent = 'Sending...';
      try {
        await (authClient as any).sendVerificationEmail({
          email,
          callbackURL: window.location.origin,
        });
        resendBtn.textContent = 'Sent!';
        setTimeout(() => {
          resendBtn.textContent = 'Resend';
          resendBtn.disabled = false;
        }, 3000);
      } catch (err) {
        console.warn('[auth-widget] Resend verification error:', err);
        resendBtn.textContent = 'Failed';
        setTimeout(() => {
          resendBtn.textContent = 'Resend';
          resendBtn.disabled = false;
        }, 3000);
      }
    });

    // Dismiss banner
    const closeBtn = this.banner.querySelector<HTMLButtonElement>('.auth-verify-banner-close');
    closeBtn?.addEventListener('click', () => {
      sessionStorage.setItem(BANNER_DISMISSED_KEY, '1');
      this.removeBanner();
    });

    document.body.appendChild(this.banner);
  }

  private removeBanner(): void {
    if (this.banner) {
      this.banner.remove();
      this.banner = null;
    }
  }

  private openDropdown(): void {
    const dropdown = this.container.querySelector<HTMLElement>('.auth-dropdown');
    if (!dropdown) return;

    dropdown.classList.add('open');
    this.dropdownOpen = true;

    // Close on outside click
    this.outsideClickHandler = (e: MouseEvent) => {
      if (!this.container.contains(e.target as Node)) {
        this.closeDropdown();
      }
    };
    document.addEventListener('click', this.outsideClickHandler);

    // Close on Escape
    this.escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.closeDropdown();
    };
    document.addEventListener('keydown', this.escapeHandler);
  }

  private closeDropdown(): void {
    const dropdown = this.container.querySelector<HTMLElement>('.auth-dropdown');
    if (dropdown) dropdown.classList.remove('open');
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
