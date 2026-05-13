// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { showErrorMessage } from '@jupyterlab/apputils';
import { PageConfig, PathExt } from '@jupyterlab/coreutils';
import { renameFile } from '@jupyterlab/docmanager';
import type { ITranslator } from '@jupyterlab/translation';
import type {
  BreadcrumbDropTarget,
  IBreadcrumbItem,
  IBreadcrumbLeadingShortcut
} from '@jupyterlab/ui-components';
import { Breadcrumbs, folderIcon, homeIcon } from '@jupyterlab/ui-components';
import type { Drag } from '@lumino/dragdrop';
import type { Message } from '@lumino/messaging';
import { Widget } from '@lumino/widgets';
import type { FileBrowserModel } from './model';
import { PathNavigator } from './pathnavigator';

/**
 * The MIME type used for contents drag data in JupyterLab.
 */
const CONTENTS_MIME = 'application/x-jupyter-icontents';

/**
 * The id used for the "home" shortcut. Activating it navigates to `/`.
 */
const HOME_SHORTCUT_ID = 'home';

/**
 * The id used for the "preferred path" shortcut. Activating it navigates to
 * the path declared in `PageConfig.preferredPath`.
 */
const PREFERRED_SHORTCUT_ID = 'preferred';

/**
 * The CSS class applied to the home shortcut, preserved for backward
 * compatibility with downstream selectors and tests.
 */
const HOME_SHORTCUT_CLASS = 'jp-BreadCrumbs-home';

/**
 * The CSS class applied to the preferred-path shortcut, preserved for
 * backward compatibility with downstream selectors and tests.
 */
const PREFERRED_SHORTCUT_CLASS = 'jp-BreadCrumbs-preferred';

/**
 * A widget that hosts the folder breadcrumbs for a file browser model.
 *
 * #### Notes
 * This class is a thin adapter on top of the generic
 * {@link Breadcrumbs} widget from `@jupyterlab/ui-components`. It owns the
 * file-browser-specific behavior — translating model state into segments,
 * applying `PageConfig` policies, performing file moves on drop, and
 * orchestrating an inline path editor — but defers all rendering, keyboard
 * navigation, and adaptive layout to the parent class.
 */
export class BreadCrumbs extends Breadcrumbs {
  /**
   * Construct a new file browser breadcrumb widget.
   *
   * @param options Constructor options.
   */
  constructor(options: BreadCrumbs.IOptions) {
    super({
      translator: options.translator,
      fullPath: options.fullPath,
      minimumLeftItems: options.minimumLeftItems,
      minimumRightItems: options.minimumRightItems
    });
    this._model = options.model;
    this._onPathEdited = options.onPathEdited;
    this._onPathActivated = options.onPathActivated;

    this.setAcceptDrop((target, event) =>
      this._decideAcceptDrop(target, event)
    );

    // Populate state from the model immediately so the trail is initialized
    // before the first render.
    this._syncFromModel();

    this._pathNavigator = new PathNavigator({
      model: this._model,
      translator: options.translator
    });
    this._pathNavigator.closed.connect(this._onPathNavigatorClosed, this);

    this._model.refreshed.connect(this._onModelRefreshed, this);
    this.segmentActivated.connect(this._handleSegmentActivated, this);
    this.shortcutActivated.connect(this._handleShortcutActivated, this);
    this.ellipsisActivated.connect(this._handleEllipsisActivated, this);
    this.editRequested.connect(this._handleEditRequested, this);
    this.dropOccurred.connect(this._handleDrop, this);
  }

  /**
   * Enter edit mode: show the path input and hide the breadcrumb content.
   */
  enterEditMode(): void {
    // Snapshot the current path so the refresh handler can reliably detect
    // whether the path actually changed while in edit mode.
    const contents = this._model.manager.services.contents;
    this._lastPath = contents.localPath(this._model.path);
    this.setEditMode(true);
    this._pathNavigator.open();
  }

  /**
   * Move focus to the trailing breadcrumb segment.
   *
   * Defers via `requestAnimationFrame` so any pending DOM updates are applied
   * before focus is set.
   */
  focusLastCrumb(): void {
    this.focusTrailingSegment();
  }

  /**
   * Dispose of the resources held by the widget.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._model.refreshed.disconnect(this._onModelRefreshed, this);
    this._pathNavigator.closed.disconnect(this._onPathNavigatorClosed, this);
    this._pathNavigator.dispose();
    super.dispose();
  }

  /**
   * A message handler invoked on an `'after-attach'` message.
   */
  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    Widget.attach(this._pathNavigator, this.node);
  }

  /**
   * A message handler invoked on a `'before-detach'` message.
   */
  protected onBeforeDetach(msg: Message): void {
    Widget.detach(this._pathNavigator);
    super.onBeforeDetach(msg);
  }

  /**
   * A handler invoked on an `'update-request'` message.
   *
   * #### Notes
   * Reads fresh state from the model before delegating to the generic
   * render path. This matches the long-standing behavior where the original
   * widget read `model.path` directly at render time, and keeps the trail
   * consistent for renders triggered between `pathChanged` and `refreshed`.
   */
  protected onUpdateRequest(msg: Message): void {
    if (this.isEditMode) {
      return;
    }
    this._syncFromModel();
    super.onUpdateRequest(msg);
  }

  /**
   * Handle the model's `refreshed` signal.
   *
   * In edit mode, dismiss the editor if the path navigator's submitted path
   * matches or the path has otherwise changed. Outside edit mode, recompute
   * segments and request a re-render.
   */
  private _onModelRefreshed(): void {
    const contents = this._model.manager.services.contents;
    const localPath = contents.localPath(this._model.path);
    if (this.isEditMode) {
      if (
        this._pathNavigator.matchesSubmittedPath(localPath) ||
        localPath !== this._lastPath
      ) {
        this._exitEditMode();
        this._onPathEdited?.();
      }
      return;
    }
    this._syncFromModel();
    if (this._restoreActivationFocusAfter) {
      this._restoreActivationFocusAfter = false;
      requestAnimationFrame(() => {
        if (this.isDisposed || this.isEditMode) {
          return;
        }
        this._onPathActivated?.();
      });
    }
  }

  /**
   * Read fresh segments and shortcuts from the model and push them into the
   * parent widget.
   */
  private _syncFromModel(): void {
    const contents = this._model.manager.services.contents;
    const localPath = contents.localPath(this._model.path);
    this._lastPath = localPath;

    const allParts = localPath.split('/').filter(p => p !== '');
    const rootParts = this._model.root
      ? this._model.root.split('/').filter(p => p !== '')
      : [];
    const rootDepth = rootParts.length;
    const visibleParts = this._model.root
      ? allParts.slice(rootDepth)
      : allParts;

    const segments: IBreadcrumbItem[] = visibleParts.map((label, i) => {
      const fullIndex = rootDepth + i;
      const cumulativePath = allParts.slice(0, fullIndex + 1).join('/');
      return { label, id: cumulativePath, title: cumulativePath };
    });

    const shortcuts: IBreadcrumbLeadingShortcut[] = [];
    if (!this._model.root) {
      const preferredPath = PageConfig.getOption('preferredPath');
      const hasPreferred =
        preferredPath && preferredPath !== '/' ? true : false;
      if (hasPreferred) {
        shortcuts.push({
          icon: homeIcon,
          id: PREFERRED_SHORTCUT_ID,
          title: '/' + preferredPath,
          className: PREFERRED_SHORTCUT_CLASS
        });
      }
      shortcuts.push({
        icon: folderIcon,
        id: HOME_SHORTCUT_ID,
        title: PageConfig.getOption('serverRoot') || 'Jupyter Server Root',
        className: HOME_SHORTCUT_CLASS
      });
    }

    this.setSegments(segments);
    this.setLeadingShortcuts(shortcuts);
  }

  /**
   * Translate a segment activation into a navigation (or edit-mode entry).
   */
  private _handleSegmentActivated(
    _sender: Breadcrumbs,
    args: { id: string; isTerminal: boolean; viaKeyboard: boolean }
  ): void {
    if (args.isTerminal && args.viaKeyboard) {
      this.enterEditMode();
      return;
    }
    this._navigateTo(`/${args.id}`);
  }

  /**
   * Translate a shortcut activation into a navigation (or edit-mode entry).
   *
   * Preserves a long-standing UX corner case: pressing Space on the home
   * shortcut while already at the root opens the path editor.
   */
  private _handleShortcutActivated(
    _sender: Breadcrumbs,
    args: { id: string; viaKeyboard: boolean }
  ): void {
    const contents = this._model.manager.services.contents;
    const localPath = contents.localPath(this._model.path);
    if (args.id === HOME_SHORTCUT_ID) {
      if (args.viaKeyboard && localPath === '') {
        this.enterEditMode();
        return;
      }
      this._navigateTo('/');
      return;
    }
    if (args.id === PREFERRED_SHORTCUT_ID) {
      const preferred = PageConfig.getOption('preferredPath');
      this._navigateTo(preferred ? '/' + preferred : '/');
    }
  }

  /**
   * Translate an ellipsis activation into a navigation to the last hidden
   * segment.
   */
  private _handleEllipsisActivated(
    _sender: Breadcrumbs,
    args: { hiddenSegmentIds: ReadonlyArray<string> }
  ): void {
    if (args.hiddenSegmentIds.length === 0) {
      return;
    }
    const lastHidden = args.hiddenSegmentIds[args.hiddenSegmentIds.length - 1];
    this._navigateTo(`/${lastHidden}`);
  }

  /**
   * Handle a background click or other generic edit request from the widget.
   */
  private _handleEditRequested(): void {
    this.enterEditMode();
  }

  /**
   * Decide whether to accept a drop. Drops are only accepted when the drag
   * carries Jupyter contents and the target is not the current directory.
   */
  private _decideAcceptDrop(
    target: BreadcrumbDropTarget,
    event: Drag.Event
  ): boolean {
    if (!event.mimeData.hasData(CONTENTS_MIME)) {
      return false;
    }
    const currentPath = this._model.manager.services.contents.localPath(
      this._model.path
    );
    if (target.kind === 'segment' && target.id === currentPath) {
      return false;
    }
    return true;
  }

  /**
   * Move the dragged files to the drop target.
   */
  private _handleDrop(
    _sender: Breadcrumbs,
    args: { target: BreadcrumbDropTarget; event: Drag.Event }
  ): void {
    const destinationPath = this._resolveDropDestination(args.target);
    if (destinationPath === null) {
      return;
    }
    const manager = this._model.manager;
    const oldPaths = args.event.mimeData.getData(CONTENTS_MIME) as string[];
    const promises: Promise<any>[] = [];
    for (const oldPath of oldPaths) {
      const name = PathExt.basename(oldPath);
      const newPath = PathExt.join(destinationPath, name);
      promises.push(renameFile(manager, oldPath, newPath));
    }
    void Promise.all(promises).catch(err => {
      return showErrorMessage(this._trans.__('Move Error'), err);
    });
  }

  /**
   * Map a drop target to a destination path on the contents manager.
   */
  private _resolveDropDestination(target: BreadcrumbDropTarget): string | null {
    if (target.kind === 'shortcut') {
      if (target.id === HOME_SHORTCUT_ID) {
        return '/';
      }
      if (target.id === PREFERRED_SHORTCUT_ID) {
        const preferred = PageConfig.getOption('preferredPath');
        return preferred ? '/' + preferred : '/';
      }
      return null;
    }
    return `/${target.id}`;
  }

  /**
   * Navigate the model to `path`, remembering to fire the post-activation
   * focus callback once the resulting refresh arrives.
   */
  private _navigateTo(path: string): void {
    this._restoreActivationFocusAfter = true;
    this._model.cd(path).catch(error => {
      this._restoreActivationFocusAfter = false;
      void showErrorMessage(this._trans.__('Open Error'), error);
    });
  }

  /**
   * Exit edit mode and restore the breadcrumb display.
   *
   * Closes the path navigator as well as toggling the visual state, so an
   * external path change cannot leave the editor logically open after the
   * trail has visually returned.
   */
  private _exitEditMode(): void {
    if (!this.isEditMode) {
      return;
    }
    this.setEditMode(false);
    this._pathNavigator.close();
  }

  /**
   * React to the path navigator closing (Escape, blur, or after commit).
   */
  private _onPathNavigatorClosed(): void {
    this._exitEditMode();
  }

  private _model: FileBrowserModel;
  private _lastPath = '';
  private _pathNavigator: PathNavigator;
  private _onPathEdited?: () => void;
  private _onPathActivated?: () => void;
  private _restoreActivationFocusAfter = false;
}

/**
 * The namespace for the `BreadCrumbs` class statics.
 */
export namespace BreadCrumbs {
  /**
   * An options object for initializing a bread crumb widget.
   */
  export interface IOptions {
    /**
     * A file browser model instance.
     */
    model: FileBrowserModel;

    /**
     * The application language translator.
     */
    translator?: ITranslator;

    /**
     * Show the full file browser path in breadcrumbs
     */
    fullPath?: boolean;

    /**
     * Number of items to show on left of ellipsis
     */
    minimumLeftItems?: number;

    /**
     * Number of items to show on right of ellipsis
     */
    minimumRightItems?: number;

    /**
     * Callback invoked after path edit changes directory.
     */
    onPathEdited?: () => void;

    /**
     * Callback invoked after breadcrumb activation changes directory.
     */
    onPathActivated?: () => void;
  }
}
