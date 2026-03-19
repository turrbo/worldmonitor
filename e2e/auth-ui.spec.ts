import { expect, test, type Page } from '@playwright/test';

/** Click an element via JS to bypass overlay interception. */
async function jsClick(page: Page, selector: string) {
  await page.evaluate((sel) => {
    (document.querySelector(sel) as HTMLElement)?.click();
  }, selector);
}

test.describe('auth UI (anonymous state)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('better-auth_cookie');
      // Dismiss the layer performance warning overlay
      localStorage.setItem('wm-layer-warning-dismissed', 'true');
    });
  });

  test('Sign In button visible with readable text', async ({ page }) => {
    await page.goto('/');
    const signInBtn = page.locator('.auth-signin-btn');
    await signInBtn.waitFor({ timeout: 20000 });
    await expect(signInBtn).toBeVisible();
    await expect(signInBtn).toHaveText('Sign In');

    const styles = await signInBtn.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, background: cs.backgroundColor };
    });
    expect(styles.color).not.toBe(styles.background);
  });

  test('Sign In click opens auth modal', async ({ page }) => {
    await page.goto('/');
    await page.locator('.auth-signin-btn').waitFor({ timeout: 20000 });
    await jsClick(page, '.auth-signin-btn');

    const modal = page.locator('#authModal.active');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('modal has Sign In, Sign Up, Forgot Password', async ({ page }) => {
    await page.goto('/');
    await page.locator('.auth-signin-btn').waitFor({ timeout: 20000 });
    await jsClick(page, '.auth-signin-btn');

    const content = page.locator('#authModal.active .auth-modal-content');
    await expect(content).toBeVisible({ timeout: 5000 });

    await expect(content.locator('text=Sign In').first()).toBeVisible();
    await expect(content.locator('text=Sign Up').first()).toBeVisible();
    await expect(content.locator('text=Forgot password').first()).toBeVisible();
  });

  test('Forgot Password shows reset form', async ({ page }) => {
    await page.goto('/');
    await page.locator('.auth-signin-btn').waitFor({ timeout: 20000 });
    await jsClick(page, '.auth-signin-btn');

    const content = page.locator('#authModal.active .auth-modal-content');
    await expect(content).toBeVisible({ timeout: 5000 });

    // Use JS click to bypass any remaining overlay issues
    await jsClick(page, '.auth-forgot-link');
    await expect(content.locator('text=Reset Password').first()).toBeVisible({ timeout: 3000 });
  });

  test('premium panels gated for anonymous users', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.panel', { timeout: 20000 });
    // Auth subscription + panel creation need time
    await page.waitForTimeout(5000);

    const lockedCount = await page.locator('.panel-is-locked').count();
    expect(lockedCount).toBeGreaterThanOrEqual(1);
  });

  test('no auth token in localStorage when anonymous', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.panel', { timeout: 20000 });
    const token = await page.evaluate(() => localStorage.getItem('better-auth_cookie'));
    expect(token).toBeNull();
  });
});
