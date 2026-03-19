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

  test('modal shows email entry form', async ({ page }) => {
    await page.goto('/');
    await page.locator('.auth-signin-btn').waitFor({ timeout: 20000 });
    await jsClick(page, '.auth-signin-btn');

    const content = page.locator('#authModal.active .auth-modal-content');
    await expect(content).toBeVisible({ timeout: 5000 });

    await expect(content.locator('input[type="email"]')).toBeVisible();
    await expect(content.locator('button[type="submit"]')).toBeVisible();
  });

  test('premium panels gated for anonymous users', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.panel', { timeout: 20000 });
    await expect(page.locator('.panel-is-locked').first()).toBeVisible({ timeout: 15000 });
  });

  test('no auth token in localStorage when anonymous', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.panel', { timeout: 20000 });
    const token = await page.evaluate(() => localStorage.getItem('better-auth_cookie'));
    expect(token).toBeNull();
  });
});
