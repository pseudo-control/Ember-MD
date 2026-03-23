/**
 * Viewer NGL state tests.
 * Asserts on NGL stage internal state (compList, reprList, camera) — not screenshots.
 * Uses direct store/IPC manipulation to load structures — NO file dialogs.
 */
import { test, expect, createTestProject } from './fixtures';
import type { Page } from '@playwright/test';
import * as path from 'path';

const FIXTURES = path.resolve(__dirname, '../fixtures');
const ALANINE_PDB = path.join(FIXTURES, 'alanine_dipeptide.pdb');
const BENZENE_SDF = path.join(FIXTURES, 'benzene.sdf');
const RECEPTOR_CIF = path.resolve(__dirname, '../../ember-test-protein/8tce.cif');

/** Navigate to View tab with a test project */
async function setupViewer(window: Page): Promise<void> {
  await createTestProject(window, '__e2e_viewer_ngl__');
  const viewTab = window.locator('.tab.tab-sm', { hasText: 'View' });
  await expect(viewTab).toHaveClass(/tab-active/);
}

/** Wait for NGL stage to be ready */
async function waitForNglStage(window: Page): Promise<void> {
  await window.waitForFunction(
    () => !!(window as any).__nglStage,
    null,
    { timeout: 10_000 }
  );
}

/** Get NGL component count */
async function getCompCount(window: Page): Promise<number> {
  return window.evaluate(() => {
    const stage = (window as any).__nglStage;
    return stage ? stage.compList.length : -1;
  });
}

/** Get representation types for a component */
async function getReprTypes(window: Page, compIndex = 0): Promise<string[]> {
  return window.evaluate((idx: number) => {
    const stage = (window as any).__nglStage;
    if (!stage || !stage.compList[idx]) return [];
    return stage.compList[idx].reprList.map((r: any) => r.repr?.type || 'unknown');
  }, compIndex);
}

/** Get camera rotation quaternion */
async function getCameraRotation(window: Page): Promise<number[] | null> {
  return window.evaluate(() => {
    const stage = (window as any).__nglStage;
    if (!stage) return null;
    return stage.viewerControls.rotation.toArray();
  });
}

/** Load a PDB/CIF into the viewer via direct store manipulation */
async function loadStructureInViewer(window: Page, pdbPath: string, ligandPath?: string): Promise<void> {
  await window.evaluate(async (args: { pdb: string; lig?: string }) => {
    // Import into the project's structures/ dir first
    const api = (window as any).electronAPI;
    const projResult = await api.ensureProject('__e2e_viewer_ngl__');
    const projDir = projResult.ok ? projResult.value : '';
    const importResult = await api.importStructure(args.pdb, projDir);
    const importedPath = importResult.ok ? importResult.value : args.pdb;

    // Trigger viewer load by dispatching custom event with the path
    // The viewer watches state().viewer.pdbPath — set it via the store
    const store = (window as any).__emberStore;
    if (store) {
      store.resetViewer();
      store.setViewerPdbPath(importedPath);
      if (args.lig) store.setViewerLigandPath(args.lig);
      store.setMode('viewer');
    }
  }, { pdb: pdbPath, lig: ligandPath });
}

test.describe('Viewer NGL state', () => {
  test.beforeEach(async ({ window }) => {
    await setupViewer(window);
    await waitForNglStage(window);
  });

  test('NGL stage is exposed in test mode', async ({ window }) => {
    const hasStage = await window.evaluate(() => !!(window as any).__nglStage);
    expect(hasStage).toBe(true);
    // Verify stage has the expected API surface
    const hasCompList = await window.evaluate(() => Array.isArray((window as any).__nglStage?.compList));
    expect(hasCompList).toBe(true);
  });

  test('load PDB → component added to compList', async ({ window }) => {
    test.setTimeout(30_000);
    await loadStructureInViewer(window, ALANINE_PDB);
    await window.waitForTimeout(3_000);

    const compCount = await getCompCount(window);
    expect(compCount).toBeGreaterThan(0);
  });

  test('load holo complex → protein component with representations', async ({ window }) => {
    test.setTimeout(60_000);
    await loadStructureInViewer(window, RECEPTOR_CIF);
    await window.waitForTimeout(5_000);

    const compCount = await getCompCount(window);
    expect(compCount).toBeGreaterThan(0);

    const reprs = await getReprTypes(window, 0);
    expect(reprs.length).toBeGreaterThan(0);
  });

  test('load ligand-only SDF → component loaded', async ({ window }) => {
    test.setTimeout(30_000);
    await loadStructureInViewer(window, BENZENE_SDF);
    await window.waitForTimeout(3_000);

    const compCount = await getCompCount(window);
    expect(compCount).toBeGreaterThan(0);
  });

  test('camera rotation changes after drag interaction', async ({ window }) => {
    test.setTimeout(30_000);
    await loadStructureInViewer(window, ALANINE_PDB);
    await window.waitForTimeout(3_000);

    const rotBefore = await getCameraRotation(window);
    expect(rotBefore).not.toBeNull();

    // Simulate drag on the NGL canvas
    const canvas = window.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await window.mouse.move(cx, cy);
      await window.mouse.down();
      await window.mouse.move(cx + 100, cy + 50, { steps: 10 });
      await window.mouse.up();
      await window.waitForTimeout(500);
    }

    const rotAfter = await getCameraRotation(window);
    expect(rotAfter).not.toBeNull();
    if (rotBefore && rotAfter) {
      expect(rotAfter).not.toEqual(rotBefore);
    }
  });

  test('clear viewer → compList empties', async ({ window }) => {
    test.setTimeout(30_000);
    await loadStructureInViewer(window, ALANINE_PDB);
    await window.waitForTimeout(3_000);
    expect(await getCompCount(window)).toBeGreaterThan(0);

    // Clear via NGL stage directly (same as what ViewerMode does on session reset)
    await window.evaluate(() => {
      const stage = (window as any).__nglStage;
      if (stage) stage.removeAllComponents();
    });
    await window.waitForTimeout(500);

    expect(await getCompCount(window)).toBe(0);
  });
});
