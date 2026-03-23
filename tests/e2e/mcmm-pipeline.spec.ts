/**
 * MCMM (conformer generation) full pipeline test.
 * Uses SMILES input (no file dialogs needed).
 */
import { test, expect, createTestProject } from './fixtures';

test.describe('MCMM pipeline', () => {
  test.beforeEach(async ({ window }) => {
    await createTestProject(window, '__e2e_mcmm__');
    await window.locator('.tab.tab-sm', { hasText: 'MCMM' }).click();
    await window.waitForTimeout(500);
  });

  test('load ligand via SMILES', async ({ window }) => {
    test.setTimeout(30_000);

    // Enter aspirin SMILES
    const textarea = window.locator('textarea');
    await textarea.fill('CC(=O)Oc1ccccc1C(=O)O');

    const enterBtn = window.locator('.btn.btn-primary.btn-sm', { hasText: /Enter SMILES/i });
    await enterBtn.click();

    // Continue should become enabled after SMILES conversion
    const continueBtn = window.locator('.btn.btn-primary', { hasText: /Continue/i });
    await expect(continueBtn).toBeEnabled({ timeout: 15_000 });
  });

  test('configure shows method dropdown', async ({ window }) => {
    test.setTimeout(30_000);

    // Load via SMILES
    await window.locator('textarea').fill('CC(=O)Oc1ccccc1C(=O)O');
    await window.locator('.btn.btn-primary.btn-sm', { hasText: /Enter SMILES/i }).click();
    await expect(window.locator('.btn.btn-primary', { hasText: /Continue/i })).toBeEnabled({ timeout: 15_000 });

    // Navigate to configure
    await window.locator('.btn.btn-primary', { hasText: /Continue/i }).click();
    await window.waitForTimeout(500);

    // Should see method dropdown — filter by its unique option content to avoid hidden ViewerMode selects
    const methodSelect = window.locator('select').filter({ has: window.locator('option', { hasText: 'ETKDG' }) });
    await expect(methodSelect).toBeVisible();

    const options = await methodSelect.locator('option').allTextContents();
    const optionsLower = options.map(o => o.toLowerCase());
    expect(optionsLower.some(o => o.includes('etkdg'))).toBe(true);
    expect(optionsLower.some(o => o.includes('mcmm'))).toBe(true);
  });

  test('run ETKDG conformer search and verify results', async ({ window }) => {
    test.setTimeout(120_000);

    // Load via SMILES
    await window.locator('textarea').fill('CC(=O)Oc1ccccc1C(=O)O');
    await window.locator('.btn.btn-primary.btn-sm', { hasText: /Enter SMILES/i }).click();
    await expect(window.locator('.btn.btn-primary', { hasText: /Continue/i })).toBeEnabled({ timeout: 15_000 });

    // Continue to configure
    await window.locator('.btn.btn-primary', { hasText: /Continue/i }).click();
    await window.waitForTimeout(500);

    // Ensure method is ETKDG (fastest) — filter by unique option content
    const methodSelect = window.locator('select').filter({ has: window.locator('option', { hasText: 'ETKDG' }) });
    await methodSelect.selectOption('etkdg');
    await window.waitForTimeout(200);

    // Start search
    await window.locator('.btn.btn-primary', { hasText: /Start/i }).click();

    // Wait for search to complete (progress page shows "View Results" button)
    const viewResultsBtn = window.locator('.btn.btn-primary', { hasText: /View Results/i });
    await expect(viewResultsBtn).toBeVisible({ timeout: 60_000 });
    await viewResultsBtn.click();
    await window.waitForTimeout(500);

    // Now on results page
    const resultsTitle = window.locator('text=Conformer Results');
    await expect(resultsTitle).toBeVisible({ timeout: 5_000 });

    // Check results table
    const table = window.locator('table');
    await expect(table).toBeVisible();

    const rows = table.locator('tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    const headerText = await table.locator('thead').textContent();
    expect(headerText?.toLowerCase()).toContain('energy');

    const view3dBtn = window.locator('.btn.btn-primary', { hasText: /View 3D/i });
    await expect(view3dBtn).toBeVisible();
  });
});
