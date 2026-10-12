// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { WidgetTracker } from '@jupyterlab/apputils';
import type { IMessageHandler, Message } from '@lumino/messaging';
import { MessageLoop } from '@lumino/messaging';
import type { FileBrowser } from './browser';

/**
 * A widget tracker whose current file browser follows the one shown to the user.
 *
 * #### Notes
 * Side panels are shown without taking focus (e.g. at startup), so focus
 * alone cannot tell which file browser the user is looking at. The first
 * browser added is current until a browser takes the focus or is shown
 * while the current one is hidden.
 */
export class FileBrowserTracker extends WidgetTracker<FileBrowser> {
  /**
   * Add a new file browser to the tracker.
   *
   * @param widget - The file browser being added.
   */
  async add(widget: FileBrowser): Promise<void> {
    await super.add(widget);
    if (this.isDisposed || widget.isDisposed) {
      return;
    }
    MessageLoop.installMessageHook(widget, this._visibilityHook);
    // Visibility rather than the order of addition decides the current browser.
    if (this._previous && this.currentWidget === widget) {
      this.setCurrentWidget(this._previous);
    }
    this._syncCurrent();
  }

  /**
   * Dispose of the resources held by the tracker.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.forEach(widget => {
      MessageLoop.removeMessageHook(widget, this._visibilityHook);
    });
    super.dispose();
  }

  /**
   * Handle the current change event.
   */
  protected onCurrentChanged(value: FileBrowser | null): void {
    this._previous = this._current;
    this._current = value;
    // The focus can land on a hidden browser, e.g. Firefox keeps the focus
    // on nodes which get hidden.
    this._scheduleSync();
  }

  /**
   * Make a visible file browser current when the current one is not visible.
   *
   * The browser shown last is preferred over other visible browsers.
   */
  private _syncCurrent(): void {
    if (this.isDisposed || this.currentWidget?.isVisible) {
      return;
    }
    const shown = this._lastShown?.isVisible
      ? this._lastShown
      : this.find(widget => widget.isVisible);
    if (shown) {
      this.setCurrentWidget(shown);
    }
  }

  /**
   * Sync the current browser once the pending messages have been processed.
   */
  private _scheduleSync(): void {
    void Promise.resolve().then(() => {
      this._syncCurrent();
    });
  }

  /**
   * A message hook for the messages which change the visibility of a browser.
   */
  private _visibilityHook = (
    handler: IMessageHandler,
    msg: Message
  ): boolean => {
    switch (msg.type) {
      case 'after-show':
        this._lastShown = this.find(widget => widget === handler) ?? null;
        this._scheduleSync();
        break;
      case 'after-hide':
      case 'after-attach':
      case 'after-detach':
        this._scheduleSync();
        break;
      default:
        break;
    }
    return true;
  };

  private _current: FileBrowser | null = null;
  private _lastShown: FileBrowser | null = null;
  private _previous: FileBrowser | null = null;
}
