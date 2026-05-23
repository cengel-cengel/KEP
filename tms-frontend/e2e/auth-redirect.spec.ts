/**
 * E2E — Auth-Redirect-Regression.
 *
 * Die 4 Cases, die den Auth-Redirect-Bug (9fd8e7a + 4e2abb0)
 * gefangen hätten. Reines FE-Routing-Test (kein BE nötig).
 *
 * Token-Key: 'tms_token' im localStorage (siehe lib/api.ts
 * AUTH_TOKEN_KEY).
 *
 * Konvention:
 *   - "ausgeloggt" = vor goto localStorage.clear() via
 *     addInitScript
 *   - "eingeloggt" = localStorage.setItem('tms_token','fake')
 *     vor erstem Page-Mount
 *   - App-Marker = sichtbarer Nav-Text aus AppLayout (statisch,
 *     KEIN API-Call nötig). Wir prüfen "Disposition" oder
 *     "Dashboard" als Indikator dass AppLayout rendert.
 */
import { expect, test } from '@playwright/test';

test.describe('Auth-Redirect (4 Cases)', () => {
  test('CASE 1: ausgeloggt + "/" → /login', async ({ page }) => {
    // Kein Token gesetzt — frischer Browser-Context hat leeren
    // localStorage by default.
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    // Login-Form sichtbar (E-Mail-Input)
    await expect(page.getByLabel(/E-Mail/i)).toBeVisible();
  });

  test('CASE 2: ausgeloggt + "/workspace" → /login', async ({ page }) => {
    await page.goto('/workspace');
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
    await expect(page.getByLabel(/E-Mail/i)).toBeVisible();
  });

  test('CASE 3: eingeloggt + "/" → Dashboard (NICHT /login)', async ({
    page,
    context,
  }) => {
    // Token vor Page-Load setzen via addInitScript.
    await context.addInitScript(() => {
      localStorage.setItem('tms_token', 'fake-test-token');
    });
    // Mock API-Calls aus DashboardPage damit nicht hart crasht.
    // Wir liefern leere Responses — UI rendert ohne Daten, aber
    // OHNE Error-Throw. Test prüft NUR Routing + AppLayout-Marker.
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/cockpit/kpis')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            shipmentsToday: 0,
            shipmentsPendingDispatch: 0,
            mtd: { cmPercent: 0 },
          }),
        });
      }
      if (url.includes('/cockpit/open-tasks')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '[]',
        });
      }
      // Default: leeres Array — vermeidet 404-Fehler-Cascade.
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
    });

    await page.goto('/');
    // URL ist NICHT /login (PrivateRoute hat durchgelassen).
    await expect(page).not.toHaveURL(/\/login(\?|$)/);
    // AppLayout-Marker: irgendein Nav-Text aus dem AppLayout.
    // Konkret: "Disposition" steht in der Top-Nav-Bar.
    await expect(page.getByText(/Disposition/i).first()).toBeVisible();
  });

  test('CASE 4: eingeloggt + "/login" → / (NICHT /login)', async ({
    page,
    context,
  }) => {
    await context.addInitScript(() => {
      localStorage.setItem('tms_token', 'fake-test-token');
    });
    await page.route('**/api/**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
    });

    await page.goto('/login');
    // PublicOnlyRoute Navigate → / (URL endet NICHT auf /login).
    await expect(page).not.toHaveURL(/\/login(\?|$)/);
    // App rendert (AppLayout-Marker).
    await expect(page.getByText(/Disposition/i).first()).toBeVisible();
  });
});
