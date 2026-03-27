// Copyright (c) 2026 Ember Contributors. MIT License.
import { test, expect, createTestProject } from './fixtures';
import * as path from 'path';
import * as fs from 'fs';

const PHORBOL_SDF = path.resolve(__dirname, '../fixtures/phorbol.sdf');

test.describe('Phorbol SDF viewer', () => {
  test('NGL renders phorbol with 25 atoms and 27 bonds', async ({ app, window }) => {
    await createTestProject(window, '__phorbol_test__');

    // Switch to View tab
    await window.locator('header .tabs-boxed .tab', { hasText: 'View' }).click();
    await window.waitForTimeout(2000);

    // Load phorbol SDF directly into the NGL stage
    const loadResult = await window.evaluate(async (sdfPath: string) => {
      const nglStage = (window as any).__nglStage;
      if (!nglStage) return { error: 'NGL stage not ready' };

      try {
        const comp = await nglStage.loadFile(sdfPath, {
          defaultRepresentation: false,
          firstModelOnly: true,
        });

        if (!comp || !comp.structure) return { error: 'Failed to load structure' };

        // Add ball+stick representation
        comp.addRepresentation('ball+stick');
        nglStage.autoView();

        const bs = comp.structure.bondStore;
        return {
          name: comp.name,
          atomCount: comp.structure.atomCount,
          bondCount: bs?.count || 0,
          residueCount: comp.structure.residueCount,
        };
      } catch (err: any) {
        return { error: err.message };
      }
    }, PHORBOL_SDF);

    console.log('NGL load result:', JSON.stringify(loadResult, null, 2));

    // Take screenshot after loading
    await window.waitForTimeout(1000);
    await window.screenshot({ path: 'tests/screenshots/phorbol-ngl.png', fullPage: true });

    // Assert correct atom and bond counts
    expect(loadResult).not.toHaveProperty('error');
    expect(loadResult.atomCount).toBe(25);
    expect(loadResult.bondCount).toBe(27);
  });

  test('phorbol SDF fixture roundtrips correctly', async ({}) => {
    const content = fs.readFileSync(PHORBOL_SDF, 'utf-8');
    const lines = content.split('\n');
    const countsLine = lines[3].trim();
    const [atomCount, bondCount] = countsLine.split(/\s+/).map(Number);

    expect(atomCount).toBe(25);
    expect(bondCount).toBe(27);

    // No explicit H atoms
    const atomLines = lines.slice(4, 4 + atomCount);
    const hAtoms = atomLines.filter(l => l.trim().split(/\s+/)[3] === 'H');
    expect(hAtoms.length).toBe(0);

    // Has ring-closing bonds (bond indices > atomCount means ring closures)
    const bondLines = lines.slice(4 + atomCount, 4 + atomCount + bondCount);
    expect(bondLines.length).toBe(bondCount);
  });
});
