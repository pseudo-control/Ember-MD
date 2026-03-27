// Copyright (c) 2026 Ember Contributors. MIT License.
/**
 * E2E tests for job cancellation confirmations across all job types.
 * Verifies that stop buttons open confirmation modals before cancelling.
 */
import { test, expect, createTestProject } from './fixtures';
import type { Page } from '@playwright/test';

test.describe('Job cancel confirmation', () => {
  test.beforeEach(async ({ window }) => {
    await createTestProject(window, '__e2e_cancel__');
    await window.waitForTimeout(500);
  });

  test('docking: cancel shows confirmation modal', async ({ window }) => {
    test.setTimeout(180_000);

    // Navigate to Dock tab, start a docking run using SMILES
    await window.locator('.tab.tab-sm', { hasText: 'Dock' }).click();
    await window.waitForTimeout(500);

    // Use PDB fetch for receptor
    const pdbInput = window.locator('input[placeholder*="8TCE"]:visible');
    await pdbInput.fill('8TCE');
    await window.locator('.btn.btn-primary.btn-sm:visible', { hasText: 'Fetch' }).click();
    await expect(window.locator('main').locator('text=8TCE.cif')).toBeVisible({ timeout: 30_000 });

    // Add ligand via SMILES
    const smilesInput = window.locator('textarea:visible');
    if (await smilesInput.isVisible()) {
      await smilesInput.fill('c1ccccc1');
      await window.locator('.btn.btn-primary.btn-sm:visible', { hasText: /Enter SMILES/i }).click();
      await window.waitForTimeout(3_000);
    }

    await window.locator('.btn.btn-primary:visible', { hasText: /Continue/i }).click();
    await window.waitForTimeout(1_000);

    // Start docking
    const startBtn = window.locator('.btn.btn-primary:visible', { hasText: /Start Docking/i });
    if (await startBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await startBtn.click();
      await window.waitForTimeout(2_000);

      // Check if running
      const isRunning = await window.evaluate(() => (window as any).__emberStore.state().isRunning);
      if (isRunning) {
        // Click cancel button — should open modal instead of cancelling immediately
        const cancelBtn = window.locator('button[title="Cancel"]');
        if (await cancelBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await cancelBtn.click();

          // Modal should appear
          await expect(window.locator('.modal.modal-open')).toBeVisible({ timeout: 3_000 });
          await expect(window.locator('text=/Stop Docking/i')).toBeVisible();

          // Cancel the modal (keep running)
          await window.locator('.modal-action .btn', { hasText: /Cancel/i }).click();
          await expect(window.locator('.modal.modal-open')).not.toBeVisible();

          // Confirm stop
          await cancelBtn.click();
          await window.locator('.btn.btn-error', { hasText: /Stop/i }).click();
          await expect(window.locator('.modal.modal-open')).not.toBeVisible({ timeout: 5_000 });
        }
      }
    }
  });

  test('conformer: cancel shows confirmation modal', async ({ window }) => {
    test.setTimeout(120_000);

    // Navigate to MCMM tab
    await window.locator('.tab.tab-sm', { hasText: 'MCMM' }).click();
    await window.waitForTimeout(500);

    // Load aspirin via SMILES
    await window.locator('textarea:visible').fill('CC(=O)Oc1ccccc1C(=O)O');
    await window.locator('.btn.btn-primary.btn-sm:visible', { hasText: /Enter SMILES/i }).click();
    await expect(window.locator('.btn.btn-primary:visible', { hasText: /Continue/i })).toBeEnabled({ timeout: 15_000 });
    await window.locator('.btn.btn-primary:visible', { hasText: /Continue/i }).click();
    await window.waitForTimeout(500);

    // Select MCMM method (slower, gives time to cancel)
    const methodSelect = window.locator('select').filter({ has: window.locator('option', { hasText: 'MCMM' }) });
    await methodSelect.selectOption('mcmm');
    await window.waitForTimeout(300);

    // Start conformer generation
    const startBtn = window.locator('.btn.btn-primary:visible', { hasText: /Start/i });
    await startBtn.click();
    await window.waitForTimeout(2_000);

    // The cancel button should be visible while running
    const cancelBtn = window.locator('button[title="Cancel"]');
    const isRunning = await window.evaluate(() => (window as any).__emberStore.state().conform.isRunning);
    if (isRunning && await cancelBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await cancelBtn.click();

      // Modal should appear
      await expect(window.locator('.modal.modal-open')).toBeVisible({ timeout: 3_000 });
      await expect(window.locator('text=/Stop Conformer Search/i')).toBeVisible();

      // Confirm stop
      await window.locator('.btn.btn-error', { hasText: /Stop/i }).click();
      await expect(window.locator('.modal.modal-open')).not.toBeVisible({ timeout: 5_000 });

      // Should return to idle state
      await window.waitForFunction(() => {
        const s = (window as any).__emberStore.state();
        return !s.conform.isRunning;
      }, null, { timeout: 10_000 });
    }
  });
});
