// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { expect, galata, test } from '@jupyterlab/galata';
import type { IJupyterLabPageFixture } from '@jupyterlab/galata';
import type { Token } from '@lumino/coreutils';

const PLUGIN_ID = '@jupyterlab/apputils-extension:browsing-context';

/**
 * Get the id of the browsing context of a page.
 */
function browsingContextId(page: IJupyterLabPageFixture): Promise<string> {
  return page.evaluate(async pluginId => {
    const plugin = (
      (window.jupyterapp as any).pluginRegistry._plugins as Map<
        string,
        { provides: Token<{ id: string }> }
      >
    ).get(pluginId);
    const context = await window.jupyterapp.resolveRequiredService(
      plugin!.provides
    );
    return context.id;
  }, PLUGIN_ID);
}

test.describe('Browsing context', () => {
  test('should provide a unique id per browser tab', async ({
    page,
    browser,
    baseURL,
    tmpPath,
    waitForApplication
  }) => {
    const id = await browsingContextId(page);
    expect(id).toBeTruthy();

    const { page: otherPage } = await galata.newPage({
      baseURL: baseURL!,
      browser,
      tmpPath,
      waitForApplication
    });
    try {
      expect(await browsingContextId(otherPage)).not.toEqual(id);
    } finally {
      await otherPage.context().close();
    }
  });
});
