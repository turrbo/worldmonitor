import { authClient } from '@/services/auth-client';
import { subscribeAuthState } from '@/services/auth-state';
import type { AuthSession } from '@/services/auth-state';

const GOOGLE_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>`;

type TabId = 'signin' | 'signup';

export class AuthModal {
  private overlay: HTMLElement;
  private activeTab: TabId = 'signin';
  private escapeHandler: ((e: KeyboardEvent) => void) | null = null;
  private unsubscribeAuth: (() => void) | null = null;
  private isLoading = false;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.id = 'authModal';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-label', 'Sign In');

    // Click outside modal content closes
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    // Subscribe to auth state for auto-close on successful auth
    this.unsubscribeAuth = subscribeAuthState((state: AuthSession) => {
      if (state.user && this.overlay.classList.contains('active')) {
        this.close();
      }
    });

    document.body.appendChild(this.overlay);
  }

  public open(tab?: TabId): void {
    if (tab) this.activeTab = tab;
    this.isLoading = false;
    this.render();
    this.overlay.classList.add('active');

    this.escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this.escapeHandler);

    // Focus the first input after render
    requestAnimationFrame(() => {
      const firstInput = this.overlay.querySelector<HTMLInputElement>('.auth-form input');
      firstInput?.focus();
    });
  }

  public close(): void {
    this.overlay.classList.remove('active');
    this.isLoading = false;
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler);
      this.escapeHandler = null;
    }
    // Clear error messages
    const errorEl = this.overlay.querySelector<HTMLElement>('.auth-error');
    if (errorEl) errorEl.textContent = '';
  }

  public destroy(): void {
    this.close();
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth();
      this.unsubscribeAuth = null;
    }
    this.overlay.remove();
  }

  private render(): void {
    const isSignUp = this.activeTab === 'signup';
    const title = isSignUp ? 'Create Account' : 'Welcome';

    this.overlay.innerHTML = `
      <div class="modal auth-modal-content">
        <button class="auth-modal-close" aria-label="Close">&times;</button>
        <h2 style="margin: 0 0 16px; font-size: 20px; color: var(--text);">${title}</h2>
        <div class="auth-tabs">
          <button class="auth-tab${this.activeTab === 'signin' ? ' active' : ''}" data-tab="signin">Sign In</button>
          <button class="auth-tab${this.activeTab === 'signup' ? ' active' : ''}" data-tab="signup">Sign Up</button>
        </div>
        <form class="auth-form" novalidate>
          ${isSignUp ? `
          <div>
            <label for="auth-name">Name</label>
            <input type="text" id="auth-name" name="name" required autocomplete="name" placeholder="Your name" />
          </div>` : ''}
          <div>
            <label for="auth-email">Email</label>
            <input type="email" id="auth-email" name="email" required autocomplete="email" placeholder="you@example.com" />
          </div>
          <div>
            <label for="auth-password">Password</label>
            <input type="password" id="auth-password" name="password" required autocomplete="${isSignUp ? 'new-password' : 'current-password'}" minlength="8" placeholder="${isSignUp ? 'Min 8 characters' : 'Your password'}" />
          </div>
          <div class="auth-error" role="alert"></div>
          <button type="submit" class="auth-submit-btn">${isSignUp ? 'Create Account' : 'Sign In'}</button>
        </form>
        <div class="auth-divider"><span>or</span></div>
        <button class="auth-google-btn">${GOOGLE_SVG} Continue with Google</button>
        <p class="auth-footer">By continuing, you agree to our Terms of Service.</p>
      </div>
    `;

    this.attachListeners();
  }

  private attachListeners(): void {
    // Close button
    const closeBtn = this.overlay.querySelector<HTMLButtonElement>('.auth-modal-close');
    closeBtn?.addEventListener('click', () => this.close());

    // Tab switching
    const tabs = this.overlay.querySelectorAll<HTMLButtonElement>('.auth-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab as TabId;
        if (tabId && tabId !== this.activeTab) {
          this.activeTab = tabId;
          this.isLoading = false;
          this.render();
          // Focus first input after re-render
          requestAnimationFrame(() => {
            const firstInput = this.overlay.querySelector<HTMLInputElement>('.auth-form input');
            firstInput?.focus();
          });
        }
      });
    });

    // Form submit
    const form = this.overlay.querySelector<HTMLFormElement>('.auth-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.isLoading) return;
      if (this.activeTab === 'signup') {
        this.handleSignUp();
      } else {
        this.handleSignIn();
      }
    });

    // Google OAuth
    const googleBtn = this.overlay.querySelector<HTMLButtonElement>('.auth-google-btn');
    googleBtn?.addEventListener('click', () => {
      authClient.signIn.social({ provider: 'google', callbackURL: '/' });
    });
  }

  private async handleSignUp(): Promise<void> {
    const name = this.overlay.querySelector<HTMLInputElement>('#auth-name')?.value.trim() ?? '';
    const email = this.overlay.querySelector<HTMLInputElement>('#auth-email')?.value.trim() ?? '';
    const password = this.overlay.querySelector<HTMLInputElement>('#auth-password')?.value ?? '';

    if (!name || !email || !password) {
      this.showError('Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      this.showError('Password must be at least 8 characters.');
      return;
    }

    this.setLoading(true);
    this.clearError();

    try {
      const result = await authClient.signUp.email({ name, email, password });
      if (result.error) {
        this.showError(result.error.message ?? 'Sign up failed. Please try again.');
        this.setLoading(false);
      }
      // On success, the auth state subscription will auto-close the modal
    } catch (err: any) {
      this.showError(err?.message ?? 'An unexpected error occurred.');
      this.setLoading(false);
    }
  }

  private async handleSignIn(): Promise<void> {
    const email = this.overlay.querySelector<HTMLInputElement>('#auth-email')?.value.trim() ?? '';
    const password = this.overlay.querySelector<HTMLInputElement>('#auth-password')?.value ?? '';

    if (!email || !password) {
      this.showError('Please fill in all fields.');
      return;
    }

    this.setLoading(true);
    this.clearError();

    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        this.showError(result.error.message ?? 'Invalid email or password.');
        this.setLoading(false);
      }
      // On success, the auth state subscription will auto-close the modal
    } catch (err: any) {
      this.showError(err?.message ?? 'An unexpected error occurred.');
      this.setLoading(false);
    }
  }

  private showError(message: string): void {
    const errorEl = this.overlay.querySelector<HTMLElement>('.auth-error');
    if (errorEl) errorEl.textContent = message;
  }

  private clearError(): void {
    const errorEl = this.overlay.querySelector<HTMLElement>('.auth-error');
    if (errorEl) errorEl.textContent = '';
  }

  private setLoading(loading: boolean): void {
    this.isLoading = loading;
    const btn = this.overlay.querySelector<HTMLButtonElement>('.auth-submit-btn');
    if (btn) {
      btn.disabled = loading;
      if (loading) {
        btn.dataset.originalText = btn.textContent ?? '';
        btn.textContent = 'Loading...';
      } else {
        btn.textContent = btn.dataset.originalText ?? btn.textContent;
      }
    }
  }
}
