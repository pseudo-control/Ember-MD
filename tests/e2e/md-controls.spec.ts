// Copyright (c) 2026 Ember Contributors. MIT License.
/**
 * E2E tests for MD simulation controls: pause/resume, stop modal, extend.
 * Uses ligand-only ibuprofen with 0.5 ns production to allow time for
 * interacting with controls during the production phase.
 */
import { test, expect, createTestProject } from './fixtures';
import type { Page } from '@playwright/test';

/** Start a ligand-only simulation via SMILES and navigate to the progress page */
async function startSimulation(window: Page, productionNs = 0.5): Promise<void> {
  // Ligand-only via SMILES — ibuprofen
  const textarea = window.locator('textarea:visible');
  await expect(textarea).toBeVisible();
  await textarea.fill('CC(C)Cc1ccc(cc1)C(C)C(=O)O');
  await window.locator('.btn.btn-primary.btn-sm:visible', { hasText: /Enter SMILES/i }).click();
  await expect(window.locator('text=/Ligand Only/i').first()).toBeVisible({ timeout: 15_000 });

  await window.locator('.btn.btn-primary:visible', { hasText: /Continue/i }).click();
  await window.waitForTimeout(1_000);

  // Set duration and padding via store
  await window.evaluate((ns: number) => {
    const store = (window as any).__emberStore;
    store.setMdConfig({ productionNs: ns, paddingNm: 1.5 });
  }, productionNs);
  await window.waitForTimeout(300);

  await window.locator('.btn.btn-primary', { hasText: /Start Simulation/i }).click();
  await expect(window.locator('text=/Running MD Simulation/i')).toBeVisible({ timeout: 10_000 });
}

/** Wait until the simulation reaches the production stage */
async function waitForProduction(window: Page, timeout = 180_000): Promise<void> {
  await window.waitForFunction(() => {
    const s = (window as any).__emberStore.state();
    return s.md.currentStage === 'production';
  }, null, { timeout });
}

test.describe('MD simulation controls', () => {
  test.beforeEach(async ({ window }) => {
    await createTestProject(window, '__e2e_md_ctrl__');
    await window.locator('.tab.tab-sm', { hasText: 'Simulate' }).click();
    await window.waitForTimeout(500);
  });

  test('pause shows "Pausing..." then "Paused" badge', async ({ window }) => {
    test.setTimeout(300_000);
    await startSimulation(window, 0.5);
    await waitForProduction(window);
    // Let some progress accumulate
    await window.waitForTimeout(2_000);

    // Click pause
    const pauseBtn = window.locator('button[title="Pause"]');
    await expect(pauseBtn).toBeVisible({ timeout: 5_000 });
    await pauseBtn.click();

    // Should show "Pausing..." transition badge
    await expect(window.locator('.badge', { hasText: 'Pausing...' })).toBeVisible({ timeout: 5_000 });

    // Should settle to "Paused" badge
    await expect(window.locator('.badge', { hasText: 'Paused' })).toBeVisible({ timeout: 5_000 });

    // Spinner should not be visible while paused
    await expect(window.locator('.loading.loading-spinner')).not.toBeVisible();
  });

  test('resume shows "Resuming..." then spinner resumes', async ({ window }) => {
    test.setTimeout(300_000);
    await startSimulation(window, 0.5);
    await waitForProduction(window);
    await window.waitForTimeout(2_000);

    // Pause first
    await window.locator('button[title="Pause"]').click();
    await expect(window.locator('.badge', { hasText: 'Paused' })).toBeVisible({ timeout: 5_000 });

    // Resume
    const resumeBtn = window.locator('button[title="Resume"]');
    await resumeBtn.click();

    // Should show "Resuming..." transition badge
    await expect(window.locator('.badge', { hasText: 'Resuming...' })).toBeVisible({ timeout: 5_000 });

    // Should settle back to running (spinner visible, no paused badge)
    await expect(window.locator('.loading.loading-spinner')).toBeVisible({ timeout: 5_000 });
    await expect(window.locator('.badge.badge-warning')).not.toBeVisible({ timeout: 5_000 });
  });

  test('stop opens confirmation modal with options', async ({ window }) => {
    test.setTimeout(300_000);
    await startSimulation(window, 0.5);
    await waitForProduction(window);

    // Click stop
    await window.locator('button[title="Stop"]').click();

    // Modal should appear
    await expect(window.locator('.modal.modal-open')).toBeVisible({ timeout: 3_000 });
    await expect(window.locator('text=/Stop Simulation/i')).toBeVisible();

    // During production, "Collect Results" should be visible
    await expect(window.locator('.btn', { hasText: /Collect Results/i })).toBeVisible();
    await expect(window.locator('.btn', { hasText: /Discard/i })).toBeVisible();

    // Cancel closes modal, simulation continues
    await window.locator('.modal-action .btn', { hasText: /Cancel/i }).click();
    await expect(window.locator('.modal.modal-open')).not.toBeVisible();

    // Simulation should still be running
    const isRunning = await window.evaluate(() => {
      return (window as any).__emberStore.state().isRunning;
    });
    expect(isRunning).toBe(true);
  });

  test('collect results: stop during production triggers post-simulation analysis', async ({ window }) => {
    test.setTimeout(300_000);
    await startSimulation(window, 0.5);
    await waitForProduction(window);

    // Wait for some production progress to accumulate
    await window.waitForFunction(() => {
      const s = (window as any).__emberStore.state();
      return s.md.stageProgress > 5;
    }, null, { timeout: 120_000 });

    // Stop and collect
    await window.locator('button[title="Stop"]').click();
    await expect(window.locator('.modal.modal-open')).toBeVisible({ timeout: 3_000 });
    await window.locator('.btn', { hasText: /Collect Results/i }).click();

    // Modal should close
    await expect(window.locator('.modal.modal-open')).not.toBeVisible({ timeout: 5_000 });

    // Should proceed to clustering/scoring and eventually complete
    await window.waitForFunction(() => {
      const s = (window as any).__emberStore.state();
      return s.currentPhase === 'complete' || s.currentPhase === 'error';
    }, null, { timeout: 180_000 });

    // View Results should appear (partial trajectory analysis completed)
    const phase = await window.evaluate(() => (window as any).__emberStore.state().currentPhase);
    expect(phase).toBe('complete');
  });

  test('discard: stop and confirm delete removes run folder', async ({ window }) => {
    test.setTimeout(300_000);
    await startSimulation(window, 0.5);
    await waitForProduction(window);

    // Record outputDir
    const outputDir = await window.evaluate(() => (window as any).__emberStore.state().md.outputDir);
    expect(outputDir).toBeTruthy();

    // Stop → Discard → Confirm
    await window.locator('button[title="Stop"]').click();
    await expect(window.locator('.modal.modal-open')).toBeVisible({ timeout: 3_000 });
    await window.locator('.btn', { hasText: /Discard/i }).click();

    // Second confirmation
    await expect(window.locator('text=/Are you sure/i')).toBeVisible();
    await window.locator('.btn.btn-error', { hasText: /Delete Run/i }).click();

    // Phase should return to idle
    await window.waitForFunction(() => {
      return (window as any).__emberStore.state().currentPhase === 'idle';
    }, null, { timeout: 10_000 });

    // Output directory should be deleted
    const exists = await window.evaluate(async (dir: string) => {
      return await (window as any).electronAPI.fileExists(dir);
    }, outputDir);
    expect(exists).toBe(false);
  });

  test('extend: adding time updates progress bar total', async ({ window }) => {
    test.setTimeout(300_000);
    await startSimulation(window, 0.5);
    await waitForProduction(window);

    // Wait until some progress is visible
    await window.waitForFunction(() => {
      const s = (window as any).__emberStore.state();
      return s.md.stageProgress > 0;
    }, null, { timeout: 60_000 });

    // The extend UI should be visible during production
    const extendInput = window.locator('input[type="number"][min="0.1"]');
    await expect(extendInput).toBeVisible({ timeout: 5_000 });

    // Set extend amount and click
    await extendInput.fill('2');
    await extendInput.dispatchEvent('input');
    await window.locator('.btn', { hasText: /\+2 ns/i }).click();

    // Wait for the progress total to update to 2.5 ns (0.5 + 2.0)
    await window.waitForFunction(() => {
      // Check the DOM for the new total (displayed in progress bar area)
      const spans = Array.from(document.querySelectorAll('span'));
      return spans.some(s => s.textContent?.includes('2.5 ns'));
    }, null, { timeout: 30_000 });

    // Cancel the extended run to clean up
    await window.locator('button[title="Stop"]').click();
    await expect(window.locator('.modal.modal-open')).toBeVisible({ timeout: 3_000 });
    await window.locator('.btn', { hasText: /Discard/i }).click();
    await window.locator('.btn.btn-error', { hasText: /Delete Run/i }).click();
  });
});
