import { authClient } from '@/services/auth-client';
import { subscribeAuthState } from '@/services/auth-state';
import type { AuthSession } from '@/services/auth-state';

type AuthModalView = 'email' | 'otp';

export class AuthModal {
  private overlay: HTMLElement;
  private activeView: AuthModalView = 'email';
  private escapeHandler: ((e: KeyboardEvent) => void) | null = null;
  private unsubscribeAuth: (() => void) | null = null;
  private isLoading = false;
  private currentEmail = '';

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

  public open(): void {
    this.activeView = 'email';
    this.isLoading = false;
    this.render();
    this.overlay.classList.add('active');

    this.escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this.escapeHandler);

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
    if (this.activeView === 'otp') {
      this.renderOTP();
    } else {
      this.renderEmailEntry();
    }
  }

  private renderEmailEntry(): void {
    this.overlay.innerHTML = `
      <div class="modal auth-modal-content">
        <button class="auth-modal-close" aria-label="Close">&times;</button>
        <h2 style="margin: 0 0 8px; font-size: 20px; color: var(--text);">Welcome</h2>
        <p style="margin: 0 0 20px; font-size: 14px; color: var(--text-secondary);">Enter your email to sign in or create an account.</p>
        <form class="auth-form" novalidate>
          <div>
            <label for="auth-email">Email</label>
            <input type="email" id="auth-email" name="email" required autocomplete="email" placeholder="you@example.com" value="${this.escapeAttr(this.currentEmail)}" />
          </div>
          <div class="auth-error" role="alert"></div>
          <button type="submit" class="auth-submit-btn">Continue</button>
        </form>
        <p class="auth-footer">We'll send you a one-time code to sign in.</p>
      </div>
    `;

    this.attachEmailListeners();
  }

  private renderOTP(): void {
    this.overlay.innerHTML = `
      <div class="modal auth-modal-content">
        <button class="auth-modal-close" aria-label="Close">&times;</button>
        <h2 style="margin: 0 0 8px; font-size: 20px; color: var(--text);">Check your email</h2>
        <p style="margin: 0 0 20px; font-size: 14px; color: var(--text-secondary);">
          We sent a 6-digit code to <strong>${this.escapeHtml(this.currentEmail)}</strong>
        </p>
        <form class="auth-form" novalidate>
          <div>
            <label for="auth-otp">Verification code</label>
            <input type="text" id="auth-otp" name="otp" required autocomplete="one-time-code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" placeholder="000000" style="text-align: center; font-size: 24px; letter-spacing: 6px; font-weight: 600;" />
          </div>
          <div class="auth-error" role="alert"></div>
          <button type="submit" class="auth-submit-btn">Verify</button>
        </form>
        <div class="auth-otp-actions">
          <button type="button" class="auth-link-btn auth-back-link">Use a different email</button>
          <button type="button" class="auth-link-btn auth-resend-link">Resend code</button>
        </div>
      </div>
    `;

    this.attachOTPListeners();
  }

  private attachEmailListeners(): void {
    const closeBtn = this.overlay.querySelector<HTMLButtonElement>('.auth-modal-close');
    closeBtn?.addEventListener('click', () => this.close());

    const form = this.overlay.querySelector<HTMLFormElement>('.auth-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.isLoading) return;
      this.handleSendOTP();
    });
  }

  private attachOTPListeners(): void {
    const closeBtn = this.overlay.querySelector<HTMLButtonElement>('.auth-modal-close');
    closeBtn?.addEventListener('click', () => this.close());

    const backLink = this.overlay.querySelector<HTMLButtonElement>('.auth-back-link');
    backLink?.addEventListener('click', () => {
      this.activeView = 'email';
      this.isLoading = false;
      this.render();
      requestAnimationFrame(() => {
        this.overlay.querySelector<HTMLInputElement>('#auth-email')?.focus();
      });
    });

    const resendLink = this.overlay.querySelector<HTMLButtonElement>('.auth-resend-link');
    resendLink?.addEventListener('click', () => {
      if (this.isLoading) return;
      this.handleResendOTP();
    });

    const form = this.overlay.querySelector<HTMLFormElement>('.auth-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.isLoading) return;
      this.handleVerifyOTP();
    });
  }

  private async handleSendOTP(): Promise<void> {
    const email = this.overlay.querySelector<HTMLInputElement>('#auth-email')?.value.trim() ?? '';

    if (!email) {
      this.showError('Please enter your email address.');
      return;
    }

    this.setLoading(true);
    this.clearError();

    try {
      const result = await (authClient as any).emailOtp.sendVerificationOtp({
        email,
        type: 'sign-in',
      });
      if (result.error) {
        this.showError(result.error.message ?? 'Failed to send code. Please try again.');
        this.setLoading(false);
        return;
      }

      this.currentEmail = email;
      this.isLoading = false;
      this.activeView = 'otp';
      this.render();
      requestAnimationFrame(() => {
        this.overlay.querySelector<HTMLInputElement>('#auth-otp')?.focus();
      });
    } catch (err: any) {
      this.showError(err?.message ?? 'An unexpected error occurred.');
      this.setLoading(false);
    }
  }

  private async handleVerifyOTP(): Promise<void> {
    const otp = this.overlay.querySelector<HTMLInputElement>('#auth-otp')?.value.trim() ?? '';

    if (!otp || otp.length !== 6) {
      this.showError('Please enter the 6-digit code.');
      return;
    }

    this.setLoading(true);
    this.clearError();

    try {
      const result = await (authClient as any).signIn.emailOtp({
        email: this.currentEmail,
        otp,
      });
      if (result.error) {
        console.error('[auth] OTP verify error:', result.error);
        const msg = result.error.message || result.error.code || 'Invalid or expired code.';
        this.showError(msg);
        this.setLoading(false);
        return;
      }
      // On success, the auth state subscription will auto-close the modal
    } catch (err: any) {
      this.showError(err?.message ?? 'An unexpected error occurred.');
      this.setLoading(false);
    }
  }

  private async handleResendOTP(): Promise<void> {
    this.setLoading(true);
    this.clearError();

    try {
      const result = await (authClient as any).emailOtp.sendVerificationOtp({
        email: this.currentEmail,
        type: 'sign-in',
      });
      this.setLoading(false);
      if (result.error) {
        this.showError(result.error.message ?? 'Failed to resend code.');
      } else {
        this.showError(''); // clear any previous error
        // Brief visual feedback
        const resendBtn = this.overlay.querySelector<HTMLButtonElement>('.auth-resend-link');
        if (resendBtn) {
          resendBtn.textContent = 'Code sent!';
          resendBtn.disabled = true;
          setTimeout(() => {
            resendBtn.textContent = 'Resend code';
            resendBtn.disabled = false;
          }, 3000);
        }
      }
    } catch (err: any) {
      this.showError(err?.message ?? 'Failed to resend code.');
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

  private escapeAttr(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
