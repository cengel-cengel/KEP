/**
 * E2E Smoke — /workspace?mode=nv lädt ohne JS-pageerror.
 * Render-without-crash, read-only. Keine Mutationen, keine
 * API-Daten-Asserts.
 */
import { expect, test } from '@playwright/test';

test.describe('Smoke — /workspace?mode=nv', () => {
  test('rendert ohne JS-pageerror und #root nicht leer', async ({
    page,
    context,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    // Eingeloggt simulieren (sonst Auth-Redirect).
    await context.addInitScript(() => {
      localStorage.setItem('tms_token', 'fake-test-token');
    });
    // Alle API-Calls leer-mocken — sonst hängen Queries auf
    // Network-Failure, was unter Umständen ein pageerror auslöst.
    await page.route('**/api/**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
    });

    await page.goto('/workspace?mode=nv');

    // #root muss gerendert haben (mind. ein child-Element).
    const rootChildCount = await page.locator('#root > *').count();
    expect(rootChildCount).toBeGreaterThan(0);

    // Kein uncaught JS-Error during render.
    expect(pageErrors).toEqual([]);
  });
});
