// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { DocumentManager } from '@jupyterlab/docmanager';
import { DocumentRegistry, TextModelFactory } from '@jupyterlab/docregistry';
import { DocumentWidgetOpenerMock } from '@jupyterlab/docregistry/lib/testutils';
import { ServiceManagerMock } from '@jupyterlab/services/lib/testutils';
import { framePromise } from '@jupyterlab/testing';
import { Panel, Widget } from '@lumino/widgets';
import {
  FileBrowser,
  FileBrowserTracker,
  FilterFileBrowserModel
} from '../src';

const namespace = 'filebrowser-tracker-test';

describe('filebrowser/tracker', () => {
  let model: FilterFileBrowserModel;
  let tracker: FileBrowserTracker;
  let widgets: Widget[];

  beforeAll(() => {
    const manager = new DocumentManager({
      registry: new DocumentRegistry({
        textModelFactory: new TextModelFactory()
      }),
      opener: new DocumentWidgetOpenerMock(),
      manager: new ServiceManagerMock()
    });
    model = new FilterFileBrowserModel({ manager });
  });

  beforeEach(() => {
    tracker = new FileBrowserTracker({ namespace });
    widgets = [];
  });

  afterEach(() => {
    tracker.dispose();
    widgets.forEach(widget => {
      widget.dispose();
    });
  });

  /**
   * Create a file browser attached to the document, hidden or not.
   */
  function createBrowser(id: string, hidden = false): FileBrowser {
    const browser = new FileBrowser({ id, model, restore: false });
    browser.setHidden(hidden);
    Widget.attach(browser, document.body);
    widgets.push(browser);
    return browser;
  }

  describe('FileBrowserTracker', () => {
    describe('#add()', () => {
      it('should make the first browser current', async () => {
        const first = createBrowser('first', true);
        await tracker.add(first);
        expect(tracker.currentWidget).toBe(first);
      });

      it('should not make a hidden browser current', async () => {
        const visible = createBrowser('visible');
        const hidden = createBrowser('hidden', true);
        await tracker.add(visible);
        await tracker.add(hidden);
        expect(tracker.currentWidget).toBe(visible);
      });

      it('should keep the current browser when no browser is visible', async () => {
        const first = createBrowser('first', true);
        const second = createBrowser('second', true);
        await tracker.add(first);
        await tracker.add(second);
        expect(tracker.currentWidget).toBe(first);
      });

      it('should keep the first browser current when browsers are added at once', async () => {
        const first = createBrowser('first', true);
        const second = createBrowser('second', true);
        await Promise.all([tracker.add(first), tracker.add(second)]);
        expect(tracker.currentWidget).toBe(first);
      });

      it('should not make a visible browser current if the current one is visible', async () => {
        const first = createBrowser('first');
        const second = createBrowser('second');
        await tracker.add(first);
        await tracker.add(second);
        expect(tracker.currentWidget).toBe(first);
      });

      it('should make a visible browser current if the current one is hidden', async () => {
        const hidden = createBrowser('hidden', true);
        const visible = createBrowser('visible');
        await tracker.add(hidden);
        await tracker.add(visible);
        expect(tracker.currentWidget).toBe(visible);
      });

      it('should not track a browser disposed while being added', async () => {
        const browser = createBrowser('browser');
        const promise = tracker.add(browser);
        browser.dispose();
        await promise;
        expect(tracker.has(browser)).toBe(false);
        expect(tracker.currentWidget).toBeNull();
      });
    });

    describe('#currentWidget', () => {
      it('should follow the browser shown in place of the current one', async () => {
        const first = createBrowser('first');
        const second = createBrowser('second', true);
        await tracker.add(first);
        await tracker.add(second);

        first.hide();
        second.show();
        await framePromise();
        expect(tracker.currentWidget).toBe(second);

        second.hide();
        first.show();
        await framePromise();
        expect(tracker.currentWidget).toBe(first);
      });

      it('should follow a browser shown through a parent which does not focus it', async () => {
        const first = createBrowser('first');
        const wrapper = new Panel();
        const second = new FileBrowser({ id: 'second', model, restore: false });
        wrapper.addWidget(second);
        wrapper.hide();
        Widget.attach(wrapper, document.body);
        widgets.push(wrapper);
        await tracker.add(first);
        await tracker.add(second);
        expect(tracker.currentWidget).toBe(first);

        first.hide();
        wrapper.show();
        await framePromise();
        expect(tracker.currentWidget).toBe(second);
      });

      it('should prefer the browser shown last over other visible browsers', async () => {
        const left = createBrowser('left');
        const right = createBrowser('right');
        const other = createBrowser('other', true);
        await tracker.add(left);
        await tracker.add(right);
        await tracker.add(other);
        expect(tracker.currentWidget).toBe(left);

        left.hide();
        other.show();
        await framePromise();
        expect(tracker.currentWidget).toBe(other);

        other.hide();
        await framePromise();
        expect(tracker.currentWidget).toBe(right);
      });

      it('should keep the current browser when all browsers are hidden', async () => {
        const first = createBrowser('first');
        const second = createBrowser('second', true);
        await tracker.add(first);
        await tracker.add(second);

        first.hide();
        await framePromise();
        expect(tracker.currentWidget).toBe(first);
      });

      it('should follow a browser attached in place of the current one', async () => {
        const first = new FileBrowser({ id: 'first', model, restore: false });
        const second = new FileBrowser({ id: 'second', model, restore: false });
        widgets.push(first, second);
        await tracker.add(first);
        await tracker.add(second);
        expect(tracker.currentWidget).toBe(first);

        Widget.attach(second, document.body);
        await framePromise();
        expect(tracker.currentWidget).toBe(second);

        Widget.detach(second);
        Widget.attach(first, document.body);
        await framePromise();
        expect(tracker.currentWidget).toBe(first);
      });

      it('should fall back to a visible browser when the current one is disposed', async () => {
        const first = createBrowser('first');
        const second = createBrowser('second', true);
        await tracker.add(first);
        await tracker.add(second);

        first.hide();
        second.show();
        await framePromise();
        expect(tracker.currentWidget).toBe(second);

        first.show();
        await framePromise();
        expect(tracker.currentWidget).toBe(second);

        second.dispose();
        await framePromise();
        expect(tracker.currentWidget).toBe(first);
      });

      it('should not stay on a hidden browser which took the focus', async () => {
        const visible = createBrowser('visible');
        const hidden = createBrowser('hidden', true);
        await tracker.add(visible);
        await tracker.add(hidden);

        hidden.node.tabIndex = -1;
        hidden.node.focus();
        expect(tracker.currentWidget).toBe(hidden);
        await framePromise();
        expect(tracker.currentWidget).toBe(visible);
      });
    });

    describe('#dispose()', () => {
      it('should stop following the browsers', async () => {
        const first = createBrowser('first');
        const second = createBrowser('second', true);
        await tracker.add(first);
        await tracker.add(second);
        tracker.dispose();

        first.hide();
        second.show();
        await framePromise();
        expect(tracker.isDisposed).toBe(true);
        expect(tracker.currentWidget).toBeNull();
      });
    });
  });
});
