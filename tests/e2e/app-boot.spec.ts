// Copyright (c) 2026 Ember Contributors. MIT License.
import { test, expect } from './fixtures';

test.describe('App boot', () => {
  test('launches without crash', async ({ window }) => {
    const title = await window.title();
    expect(title).toBeTruthy();
  });

  test('header shows all mode tabs', async ({ window }) => {
    const tabs = window.locator('header .tabs-boxed .tab.tab-xs');
    await expect(tabs).toHaveCount(6);

    const labels = await tabs.allTextContents();
    expect(labels).toEqual(['View', 'MCMM', 'Dock', 'X-ray', 'Score', 'Simulate']);
  });

  test('mode tabs are gated until a project is selected', async ({ window }) => {
    const tabs = window.locator('header .tabs-boxed .tab.tab-xs');
    await expect(tabs.first()).toBeDisabled();
  });

  test('no console errors on boot', async ({ app }) => {
    const errors: string[] = [];
    const window = await app.firstWindow();
    window.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    // Give the app a moment to settle
    await window.waitForTimeout(2000);
    // Filter out known noise (NGL WebGL warnings, etc.)
    const real = errors.filter(e =>
      !e.includes('WebGL') &&
      !e.includes('THREE') &&
      !e.includes('deprecated') &&
      !e.includes('Failed to load resource')
    );
    expect(real).toEqual([]);
  });
});
