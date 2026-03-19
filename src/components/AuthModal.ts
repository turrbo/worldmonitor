import { authClient } from '@/services/auth-client';
import { subscribeAuthState } from '@/services/auth-state';
import type { AuthSession } from '@/services/auth-state';

type AuthModalView = 'signin' | 'signup' | 'forgot-password' | 'reset-password';

export class AuthModal {
  private overlay: HTMLElement;
  private activeView: AuthModalView = 'signin';
  private escapeHandler: ((e: KeyboardEvent) => void) | null = null;
  private unsubscribeAuth: (() => void) | null = null;
  private isLoading = false;
  private resetToken: string | null = null;
  private lastEmail = '';

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
        // Don't auto-close on reset-password view (user might just have been signed out)
        if (this.activeView !== 'reset-password') {
          this.close();
        }
      }
    });

    document.body.appendChild(this.overlay);
  }

  public open(tab?: 'signin' | 'signup' | 'reset-password'): void {
    if (tab) this.activeView = tab;
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
    this.resetToken = null;
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

  public setResetToken(token: string): void {
    this.resetToken = token;
  }

  private render(): void {
    switch (this.activeView) {
      case 'forgot-password':
        this.renderForgotPassword();
        break;
      case 'reset-password':
        this.renderResetPassword();
        break;
      default:
        this.renderSignInSignUp();
        break;
    }
  }

  private renderSignInSignUp(): void {
    const isSignUp = this.activeView === 'signup';
    const title = isSignUp ? 'Create Account' : 'Welcome';

    this.overlay.innerHTML = `
      <div class="modal auth-modal-content">
        <button class="auth-modal-close" aria-label="Close">&times;</button>
        <h2 style="margin: 0 0 16px; font-size: 20px; color: var(--text);">${title}</h2>
        <div class="auth-tabs">
          <button class="auth-tab${this.activeView === 'signin' ? ' active' : ''}" data-tab="signin">Sign In</button>
          <button class="auth-tab${this.activeView === 'signup' ? ' active' : ''}" data-tab="signup">Sign Up</button>
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
          ${!isSignUp ? '<button type="button" class="auth-forgot-link">Forgot password?</button>' : ''}
          <div class="auth-error" role="alert"></div>
          <button type="submit" class="auth-submit-btn">${isSignUp ? 'Create Account' : 'Sign In'}</button>
        </form>
        <p class="auth-footer">By continuing, you agree to our Terms of Service.</p>
      </div>
    `;

    this.attachSignInSignUpListeners();
  }

  private renderForgotPassword(): void {
    this.overlay.innerHTML = `
      <div class="modal auth-modal-content">
        <button class="auth-modal-close" aria-label="Close">&times;</button>
        <h2 style="margin: 0 0 8px; font-size: 20px; color: var(--text);">Reset Password</h2>
        <p style="margin: 0 0 20px; font-size: 14px; color: var(--text-secondary);">Enter your email and we'll send you a link to reset your password.</p>
        <form class="auth-form" novalidate>
          <div>
            <label for="auth-email">Email</label>
            <input type="email" id="auth-email" name="email" required autocomplete="email" placeholder="you@example.com" value="${this.escapeAttr(this.lastEmail)}" />
          </div>
          <div class="auth-error" role="alert"></div>
          <div class="auth-success" role="status"></div>
          <button type="submit" class="auth-submit-btn">Send Reset Link</button>
        </form>
        <button type="button" class="auth-back-link">Back to Sign In</button>
      </div>
    `;

    this.attachForgotPasswordListeners();
  }

  private renderResetPassword(): void {
    this.overlay.innerHTML = `
      <div class="modal auth-modal-content">
        <button class="auth-modal-close" aria-label="Close">&times;</button>
        <h2 style="margin: 0 0 8px; font-size: 20px; color: var(--text);">Set New Password</h2>
        <p style="margin: 0 0 20px; font-size: 14px; color: var(--text-secondary);">Choose a new password for your account.</p>
        <form class="auth-form" novalidate>
          <div>
            <label for="auth-new-password">New Password</label>
            <input type="password" id="auth-new-password" name="newPassword" required autocomplete="new-password" minlength="8" placeholder="Min 8 characters" />
          </div>
          <div>
            <label for="auth-confirm-password">Confirm Password</label>
            <input type="password" id="auth-confirm-password" name="confirmPassword" required autocomplete="new-password" minlength="8" placeholder="Confirm your password" />
          </div>
          <div class="auth-error" role="alert"></div>
          <div class="auth-success" role="status"></div>
          <button type="submit" class="auth-submit-btn">Reset Password</button>
        </form>
        <button type="button" class="auth-back-link">Back to Sign In</button>
      </div>
    `;

    this.attachResetPasswordListeners();
  }

  private attachSignInSignUpListeners(): void {
    // Close button
    const closeBtn = this.overlay.querySelector<HTMLButtonElement>('.auth-modal-close');
    closeBtn?.addEventListener('click', () => this.close());

    // Tab switching
    const tabs = this.overlay.querySelectorAll<HTMLButtonElement>('.auth-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab as 'signin' | 'signup';
        if (tabId && tabId !== this.activeView) {
          // Capture email before re-render
          this.captureEmail();
          this.activeView = tabId;
          this.isLoading = false;
          this.render();
          requestAnimationFrame(() => {
            const firstInput = this.overlay.querySelector<HTMLInputElement>('.auth-form input');
            firstInput?.focus();
          });
        }
      });
    });

    // Forgot password link
    const forgotLink = this.overlay.querySelector<HTMLButtonElement>('.auth-forgot-link');
    forgotLink?.addEventListener('click', () => {
      this.captureEmail();
      this.activeView = 'forgot-password';
      this.isLoading = false;
      this.render();
      requestAnimationFrame(() => {
        const emailInput = this.overlay.querySelector<HTMLInputElement>('#auth-email');
        emailInput?.focus();
      });
    });

    // Form submit
    const form = this.overlay.querySelector<HTMLFormElement>('.auth-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.isLoading) return;
      if (this.activeView === 'signup') {
        this.handleSignUp();
      } else {
        this.handleSignIn();
      }
    });

  }

  private attachForgotPasswordListeners(): void {
    // Close button
    const closeBtn = this.overlay.querySelector<HTMLButtonElement>('.auth-modal-close');
    closeBtn?.addEventListener('click', () => this.close());

    // Back to sign in
    const backLink = this.overlay.querySelector<HTMLButtonElement>('.auth-back-link');
    backLink?.addEventListener('click', () => {
      this.captureEmail();
      this.activeView = 'signin';
      this.isLoading = false;
      this.render();
    });

    // Form submit
    const form = this.overlay.querySelector<HTMLFormElement>('.auth-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.isLoading) return;
      this.handleForgotPassword();
    });
  }

  private attachResetPasswordListeners(): void {
    // Close button
    const closeBtn = this.overlay.querySelector<HTMLButtonElement>('.auth-modal-close');
    closeBtn?.addEventListener('click', () => this.close());

    // Back to sign in
    const backLink = this.overlay.querySelector<HTMLButtonElement>('.auth-back-link');
    backLink?.addEventListener('click', () => {
      this.activeView = 'signin';
      this.isLoading = false;
      this.resetToken = null;
      this.render();
    });

    // Form submit
    const form = this.overlay.querySelector<HTMLFormElement>('.auth-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.isLoading) return;
      this.handleResetPassword();
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

  private async handleForgotPassword(): Promise<void> {
    const email = this.overlay.querySelector<HTMLInputElement>('#auth-email')?.value.trim() ?? '';

    if (!email) {
      this.showError('Please enter your email address.');
      return;
    }

    this.setLoading(true);
    this.clearError();
    this.clearSuccess();

    try {
      const result = await (authClient as any).requestPasswordReset({
        email,
        redirectTo: window.location.origin,
      });
      if (result.error) {
        this.showError(result.error.message ?? 'Failed to send reset email. Please try again.');
        this.setLoading(false);
      } else {
        this.setLoading(false);
        this.showSuccess('Check your email for a password reset link.');
        // Disable the submit button after success
        const btn = this.overlay.querySelector<HTMLButtonElement>('.auth-submit-btn');
        if (btn) btn.disabled = true;
      }
    } catch (err: any) {
      this.showError(err?.message ?? 'An unexpected error occurred.');
      this.setLoading(false);
    }
  }

  private async handleResetPassword(): Promise<void> {
    const newPassword = this.overlay.querySelector<HTMLInputElement>('#auth-new-password')?.value ?? '';
    const confirmPassword = this.overlay.querySelector<HTMLInputElement>('#auth-confirm-password')?.value ?? '';

    if (!newPassword || !confirmPassword) {
      this.showError('Please fill in both password fields.');
      return;
    }
    if (newPassword.length < 8) {
      this.showError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      this.showError('Passwords do not match.');
      return;
    }
    if (!this.resetToken) {
      this.showError('Invalid reset token. Please request a new reset link.');
      return;
    }

    this.setLoading(true);
    this.clearError();
    this.clearSuccess();

    try {
      const result = await (authClient as any).resetPassword({
        newPassword,
        token: this.resetToken,
      });
      if (result.error) {
        this.showError(result.error.message ?? 'Password reset failed. The link may have expired.');
        this.setLoading(false);
      } else {
        this.setLoading(false);
        this.resetToken = null;
        this.showSuccess('Password reset successfully! You can now sign in.');
        // Switch to sign-in view after a short delay
        setTimeout(() => {
          this.activeView = 'signin';
          this.render();
        }, 2000);
      }
    } catch (err: any) {
      this.showError(err?.message ?? 'An unexpected error occurred.');
      this.setLoading(false);
    }
  }

  private captureEmail(): void {
    const emailInput = this.overlay.querySelector<HTMLInputElement>('#auth-email');
    if (emailInput) {
      this.lastEmail = emailInput.value.trim();
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

  private showSuccess(message: string): void {
    const successEl = this.overlay.querySelector<HTMLElement>('.auth-success');
    if (successEl) successEl.textContent = message;
  }

  private clearSuccess(): void {
    const successEl = this.overlay.querySelector<HTMLElement>('.auth-success');
    if (successEl) successEl.textContent = '';
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

  private escapeAttr(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
