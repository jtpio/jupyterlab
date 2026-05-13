// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import type { ITranslator, TranslationBundle } from '@jupyterlab/translation';
import { nullTranslator } from '@jupyterlab/translation';
import { JSONExt } from '@lumino/coreutils';
import type { IDisposable } from '@lumino/disposable';
import { DisposableDelegate } from '@lumino/disposable';
import type { Drag } from '@lumino/dragdrop';
import type { Message } from '@lumino/messaging';
import { Throttler } from '@lumino/polling';
import type { ISignal } from '@lumino/signaling';
import { Signal } from '@lumino/signaling';
import { Widget } from '@lumino/widgets';
import { ellipsesIcon } from '../icon/iconimports';
import type { LabIcon } from '../icon/labicon';

/**
 * The class name added to the breadcrumb root node.
 */
const BREADCRUMB_CLASS = 'jp-BreadCrumbs';

/**
 * The class name added to a regular path segment item.
 */
const BREADCRUMB_ITEM_CLASS = 'jp-BreadCrumbs-item';

/**
 * The class name added to the ellipsis (collapsed segments) element.
 */
const BREADCRUMB_ELLIPSIS_CLASS = 'jp-BreadCrumbs-ellipsis';

/**
 * The class name added to the path-separator element between items.
 */
const BREADCRUMB_SEPARATOR_CLASS = 'jp-BreadCrumbs-separator';

/**
 * The class name added to a leading shortcut element (e.g. home).
 */
const BREADCRUMB_SHORTCUT_CLASS = 'jp-BreadCrumbs-shortcut';

/**
 * The class name for the container that holds the breadcrumb content.
 */
const BREADCRUMB_CONTAINER_CLASS = 'jp-BreadCrumbs-container';

/**
 * The class name for the inner wrapper that hugs the rendered breadcrumb items.
 */
const BREADCRUMB_CONTENT_CLASS = 'jp-BreadCrumbs-content';

/**
 * The class name added to the widget root when in edit mode.
 *
 * In edit mode, the breadcrumb content is hidden via CSS so a consumer-supplied
 * editor widget (attached as a sibling) becomes visible.
 */
const BREADCRUMB_EDIT_MODE_CLASS = 'jp-mod-editMode';

/**
 * The class name applied to a segment or shortcut while it is the active
 * drop target.
 */
const BREADCRUMB_DROP_TARGET_CLASS = 'jp-mod-dropTarget';

/**
 * A path segment to render as a breadcrumb item.
 */
export interface IBreadcrumbItem {
  /**
   * Text displayed for the segment (typically the basename).
   */
  label: string;

  /**
   * Opaque identifier emitted back to the consumer on activation/drop.
   *
   * Consumers typically use the cumulative path here (e.g. `'src/foo/bar'`),
   * but the value is treated as opaque by the widget. Ids are not required
   * to be unique within a trail — the widget tracks terminal status by
   * position, not by id.
   */
  id: string;

  /**
   * Tooltip text. Defaults to `label` if not provided.
   */
  title?: string;
}

/**
 * A leading icon button rendered before the path segments (e.g. home).
 */
export interface IBreadcrumbLeadingShortcut {
  /**
   * The icon to display.
   */
  icon: LabIcon;

  /**
   * Opaque identifier emitted back on activation/drop.
   */
  id: string;

  /**
   * Tooltip text.
   */
  title?: string;

  /**
   * An additional CSS class name to apply to the rendered element.
   *
   * Useful for theming or for distinguishing different shortcuts in CSS.
   */
  className?: string;
}

/**
 * A drop target descriptor passed to `acceptDrop` and `dropOccurred`.
 */
export type BreadcrumbDropTarget =
  | { kind: 'segment'; id: string }
  | { kind: 'shortcut'; id: string };

/**
 * Arguments emitted by the {@link Breadcrumbs.segmentActivated} signal.
 */
export interface IBreadcrumbSegmentActivated {
  /**
   * The `id` of the activated segment.
   */
  id: string;

  /**
   * Whether the activated segment is the last in the current trail
   * (i.e. represents the current location).
   */
  isTerminal: boolean;

  /**
   * Whether the activation was triggered by keyboard (`true`) or pointer
   * input (`false`).
   */
  viaKeyboard: boolean;
}

/**
 * Arguments emitted by the {@link Breadcrumbs.shortcutActivated} signal.
 */
export interface IBreadcrumbShortcutActivated {
  /**
   * The `id` of the activated shortcut.
   */
  id: string;

  /**
   * Whether the activation was triggered by keyboard.
   */
  viaKeyboard: boolean;
}

/**
 * Arguments emitted by the {@link Breadcrumbs.ellipsisActivated} signal.
 */
export interface IBreadcrumbEllipsisActivated {
  /**
   * Identifiers of the segments hidden behind the ellipsis, in their original
   * order.
   */
  hiddenSegmentIds: ReadonlyArray<string>;

  /**
   * Whether the activation was triggered by keyboard.
   */
  viaKeyboard: boolean;
}

/**
 * Arguments emitted by the {@link Breadcrumbs.dropOccurred} signal.
 */
export interface IBreadcrumbDrop {
  /**
   * The target the drop landed on.
   */
  target: BreadcrumbDropTarget;

  /**
   * The original drag event. Consumers read `mimeData` from this to obtain
   * the source of the drop, and may set `dropAction` if they need to override
   * the default behavior (the component has already set
   * `dropAction = proposedAction`).
   */
  event: Drag.Event;
}

/**
 * A reusable breadcrumb-trail widget.
 *
 * The widget renders a sequence of leading shortcut icons followed by a path
 * trail (segments separated by `/`). It supports:
 *
 *   - Adaptive collapsing of middle segments into an ellipsis when the
 *     available width is too narrow to show the whole trail.
 *   - Keyboard navigation between segments via arrow keys (roving tabindex).
 *   - Activation of segments, shortcuts, and the ellipsis via click or
 *     `Enter`/`Space`.
 *   - Drop-target visuals for drag-and-drop operations (the actual drop
 *     handling is delegated to the consumer via the {@link dropOccurred}
 *     signal).
 *   - An "edit mode" CSS state that hides the trail so a consumer-supplied
 *     editor widget (attached as a sibling of the trail) can take over.
 *
 * The widget is data-driven: consumers call {@link setSegments} and
 * {@link setLeadingShortcuts} to update what is displayed, and connect to
 * the signals to react to user input.
 */
export class Breadcrumbs extends Widget {
  /**
   * Construct a new breadcrumbs widget.
   */
  constructor(options: Breadcrumbs.IOptions = {}) {
    super();
    this.addClass(BREADCRUMB_CLASS);

    this.translator = options.translator ?? nullTranslator;
    this._trans = this.translator.load('jupyterlab');

    this._segments = options.segments ? options.segments.slice() : [];
    this._leadingShortcuts = options.leadingShortcuts
      ? options.leadingShortcuts.slice()
      : [];
    this._fullPath = options.fullPath ?? false;
    this._minimumLeftItems = options.minimumLeftItems ?? 0;
    this._minimumRightItems = options.minimumRightItems ?? 2;
    this._acceptDrop = options.acceptDrop;

    // The ellipsis element is created once and reused. The set of leading
    // shortcuts is not stable (consumers can swap them out at runtime), so
    // shortcut elements are recreated on each render.
    this._ellipsisElement = Private.createEllipsisElement();

    this._container = document.createElement('span');
    this._container.className = BREADCRUMB_CONTAINER_CLASS;
    this._content = document.createElement('span');
    this._content.className = BREADCRUMB_CONTENT_CLASS;
    this._container.appendChild(this._content);
    this.node.appendChild(this._container);

    this._resizeThrottler = new Throttler(() => this._onResize(), 50);
    this._resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const newWidth = entry.contentRect.width;
      if (this._lastRenderedWidth > 0 && newWidth < this._lastRenderedWidth) {
        this._onResize();
      } else {
        void this._resizeThrottler.invoke();
      }
    });
  }

  /**
   * The signal emitted when a path segment is activated (by click or
   * keyboard).
   */
  get segmentActivated(): ISignal<this, IBreadcrumbSegmentActivated> {
    return this._segmentActivated;
  }

  /**
   * The signal emitted when a leading shortcut is activated.
   */
  get shortcutActivated(): ISignal<this, IBreadcrumbShortcutActivated> {
    return this._shortcutActivated;
  }

  /**
   * The signal emitted when the ellipsis is activated.
   */
  get ellipsisActivated(): ISignal<this, IBreadcrumbEllipsisActivated> {
    return this._ellipsisActivated;
  }

  /**
   * The signal emitted when the user clicks on the breadcrumb background
   * (i.e. not on a segment, shortcut, or ellipsis). Consumers typically
   * respond by calling {@link setEditMode}(true) and attaching an editor.
   */
  get editRequested(): ISignal<this, void> {
    return this._editRequested;
  }

  /**
   * The signal emitted when a drag is dropped on a segment or shortcut.
   *
   * The component has already set `event.dropAction = event.proposedAction`
   * by the time this fires; consumers can override if needed.
   */
  get dropOccurred(): ISignal<this, IBreadcrumbDrop> {
    return this._dropOccurred;
  }

  /**
   * Whether to render every path segment regardless of available width.
   *
   * When `false` (the default), middle segments may be collapsed into an
   * ellipsis to fit within the widget's width.
   */
  get fullPath(): boolean {
    return this._fullPath;
  }

  set fullPath(value: boolean) {
    if (this._fullPath === value) {
      return;
    }
    this._fullPath = value;
    this.update();
  }

  /**
   * Minimum number of leading segments to keep visible when the trail is
   * collapsed. Defaults to `0`.
   */
  get minimumLeftItems(): number {
    return this._minimumLeftItems;
  }

  set minimumLeftItems(value: number) {
    if (this._minimumLeftItems === value) {
      return;
    }
    this._minimumLeftItems = value;
    this.update();
  }

  /**
   * Minimum number of trailing segments to keep visible when the trail is
   * collapsed. Defaults to `2`.
   */
  get minimumRightItems(): number {
    return this._minimumRightItems;
  }

  set minimumRightItems(value: number) {
    if (this._minimumRightItems === value) {
      return;
    }
    this._minimumRightItems = value;
    this.update();
  }

  /**
   * Whether the widget is currently in edit mode.
   */
  get isEditMode(): boolean {
    return this._isEditMode;
  }

  /**
   * Replace the displayed path segments and schedule a re-render.
   *
   * No-op when the new segments compare equal (by id and label) to the
   * existing ones, to avoid invalidating the width cache on poll-driven
   * refreshes that don't actually change the path.
   */
  setSegments(segments: ReadonlyArray<IBreadcrumbItem>): void {
    if (Private.segmentsEqual(this._segments, segments)) {
      return;
    }
    this._segments = segments.slice();
    // The set of measured-segment widths is keyed by segment position, so any
    // change to the segments invalidates the cache.
    this._cachedWidths = null;
    this.update();
  }

  /**
   * Replace the leading shortcuts and schedule a re-render.
   *
   * No-op when the new shortcuts compare equal (by id and icon name) to the
   * existing ones.
   */
  setLeadingShortcuts(
    shortcuts: ReadonlyArray<IBreadcrumbLeadingShortcut>
  ): void {
    if (Private.shortcutsEqual(this._leadingShortcuts, shortcuts)) {
      return;
    }
    this._leadingShortcuts = shortcuts.slice();
    this._cachedWidths = null;
    this.update();
  }

  /**
   * Read-only access to the current segments. Useful for inspection in tests
   * or by consumers that wrap this widget.
   */
  get segments(): ReadonlyArray<IBreadcrumbItem> {
    return this._segments;
  }

  /**
   * Read-only access to the current leading shortcuts.
   */
  get leadingShortcuts(): ReadonlyArray<IBreadcrumbLeadingShortcut> {
    return this._leadingShortcuts;
  }

  /**
   * Toggle edit mode.
   *
   * In edit mode, the breadcrumb content is hidden via CSS. The consumer is
   * responsible for attaching an editor widget (typically as a sibling of
   * the trail) and for calling `setEditMode(false)` when the editor closes.
   */
  setEditMode(on: boolean): void {
    if (on === this._isEditMode) {
      return;
    }
    this._isEditMode = on;
    if (on) {
      this.node.classList.add(BREADCRUMB_EDIT_MODE_CLASS);
    } else {
      this.node.classList.remove(BREADCRUMB_EDIT_MODE_CLASS);
    }
    // Clear cached render state so exiting edit mode unconditionally re-renders
    // (the consumer may have changed the segments while in edit mode).
    this._previousState = null;
    if (!on) {
      this.update();
    }
  }

  /**
   * Override the drop-acceptance policy.
   *
   * Returns a disposable that restores the previous policy when disposed.
   * If the callback is `undefined`, drops are never accepted.
   */
  setAcceptDrop(
    acceptDrop?: (target: BreadcrumbDropTarget, event: Drag.Event) => boolean
  ): IDisposable {
    const previous = this._acceptDrop;
    this._acceptDrop = acceptDrop;
    return new DisposableDelegate(() => {
      this._acceptDrop = previous;
    });
  }

  /**
   * Move focus to the last segment in the trail.
   *
   * If the trail is empty (no segments and no shortcuts), focus moves to
   * the widget node so keyboard input is not lost.
   *
   * Deferred via `requestAnimationFrame` so any pending DOM updates are
   * reflected before focus is set.
   */
  focusTrailingSegment(): void {
    requestAnimationFrame(() => {
      if (this.isDisposed) {
        return;
      }
      this._focusTrailingInternal();
    });
  }

  /**
   * Handle DOM events forwarded by the widget's event listeners.
   *
   * #### Notes
   * Implements `EventListener`. Not intended to be called directly.
   */
  handleEvent(event: Event): void {
    switch (event.type) {
      case 'keydown':
        this._evtKeyDown(event as KeyboardEvent);
        break;
      case 'click':
        this._evtClick(event as MouseEvent);
        break;
      case 'lm-dragenter':
        this._evtDragEnter(event as Drag.Event);
        break;
      case 'lm-dragleave':
        this._evtDragLeave(event as Drag.Event);
        break;
      case 'lm-dragover':
        this._evtDragOver(event as Drag.Event);
        break;
      case 'lm-drop':
        this._evtDrop(event as Drag.Event);
        break;
      default:
        return;
    }
  }

  /**
   * Dispose of the resources held by the widget.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    Signal.clearData(this);
    this._resizeObserver.disconnect();
    this._resizeThrottler.dispose();
    super.dispose();
  }

  /**
   * A message handler invoked on an `'after-attach'` message.
   */
  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    this.update();
    const node = this.node;
    node.addEventListener('keydown', this);
    node.addEventListener('click', this);
    node.addEventListener('lm-dragenter', this);
    node.addEventListener('lm-dragleave', this);
    node.addEventListener('lm-dragover', this);
    node.addEventListener('lm-drop', this);
    this._resizeObserver.observe(node);
  }

  /**
   * A message handler invoked on a `'before-detach'` message.
   */
  protected onBeforeDetach(msg: Message): void {
    const node = this.node;
    node.removeEventListener('keydown', this);
    node.removeEventListener('click', this);
    node.removeEventListener('lm-dragenter', this);
    node.removeEventListener('lm-dragleave', this);
    node.removeEventListener('lm-dragover', this);
    node.removeEventListener('lm-drop', this);
    this._resizeObserver.unobserve(node);
    super.onBeforeDetach(msg);
  }

  /**
   * A handler invoked on an `'update-request'` message.
   */
  protected onUpdateRequest(msg: Message): void {
    if (this._isEditMode) {
      // Edit mode hides the content via CSS; no re-render needed.
      return;
    }

    const adaptiveItems = this._calculateAdaptiveItems();

    const state: Private.IRenderState = {
      segmentKey: this._segments.map(s => `${s.id}\x1f${s.label}`).join('\x1e'),
      shortcutKey: this._leadingShortcuts
        .map(s => `${s.id}\x1f${s.icon.name}`)
        .join('\x1e'),
      fullPath: this._fullPath,
      minimumLeftItems: adaptiveItems.left,
      minimumRightItems: adaptiveItems.right
    };

    if (this._previousState && JSONExt.deepEqual(state, this._previousState)) {
      return;
    }
    this._previousState = state;

    Private.renderTrail(
      this._content,
      this._segments,
      this._leadingShortcuts,
      this._ellipsisElement,
      adaptiveItems.left,
      adaptiveItems.right,
      this._fullPath
    );
    this._syncTabIndices();
  }

  /**
   * Resolve the breadcrumb part associated with an event target.
   */
  private _resolvePartFromEvent(target: EventTarget | null): {
    element: HTMLElement;
    kind: 'segment' | 'shortcut' | 'ellipsis';
  } | null {
    let node = target as HTMLElement | null;
    while (node && node !== this.node) {
      if (node.classList.contains(BREADCRUMB_ELLIPSIS_CLASS)) {
        return { element: node, kind: 'ellipsis' };
      }
      if (node.classList.contains(BREADCRUMB_SHORTCUT_CLASS)) {
        return { element: node, kind: 'shortcut' };
      }
      if (node.classList.contains(BREADCRUMB_ITEM_CLASS)) {
        return { element: node, kind: 'segment' };
      }
      node = node.parentElement;
    }
    return null;
  }

  /**
   * Return the focusable elements in DOM order.
   */
  private _getFocusableElements(): HTMLElement[] {
    const out: HTMLElement[] = [];
    const children = this._content.children;
    for (let i = 0; i < children.length; i++) {
      const el = children[i] as HTMLElement;
      if (
        el.classList.contains(BREADCRUMB_SHORTCUT_CLASS) ||
        el.classList.contains(BREADCRUMB_ITEM_CLASS)
      ) {
        out.push(el);
      }
    }
    return out;
  }

  /**
   * Return the elements that can accept a drop (segments + shortcuts,
   * excluding the ellipsis).
   */
  private _getDropTargetElements(): HTMLElement[] {
    const out: HTMLElement[] = [];
    const children = this._content.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      if (child.classList.contains(BREADCRUMB_ELLIPSIS_CLASS)) {
        continue;
      }
      if (
        child.classList.contains(BREADCRUMB_SHORTCUT_CLASS) ||
        child.classList.contains(BREADCRUMB_ITEM_CLASS)
      ) {
        out.push(child);
      }
    }
    return out;
  }

  /**
   * Initialize the roving tabindex so exactly one focusable element is in
   * the tab order.
   */
  private _syncTabIndices(): void {
    const items = this._getFocusableElements();
    for (let i = 0; i < items.length; i++) {
      items[i].tabIndex = i === 0 ? 0 : -1;
    }
  }

  /**
   * Focus the given element and update the roving tabindex.
   */
  private _focusElement(element: HTMLElement): void {
    const items = this._getFocusableElements();
    const idx = items.indexOf(element);
    if (idx === -1) {
      return;
    }
    for (let i = 0; i < items.length; i++) {
      items[i].tabIndex = i === idx ? 0 : -1;
    }
    element.focus();
  }

  /**
   * Move focus to the trailing focusable element, or to the widget itself if
   * there are none.
   */
  private _focusTrailingInternal(): void {
    const items = this._getFocusableElements();
    if (items.length === 0) {
      this.node.tabIndex = -1;
      this.node.focus();
      return;
    }
    this._focusElement(items[items.length - 1]);
  }

  /**
   * Describe a part: its drop-target kind and id, where applicable.
   *
   * `isTerminal` is derived from the rendered position so that consumers who
   * happen to pass non-unique segment ids still get a correct terminal flag.
   */
  private _describeSegmentPart(
    element: HTMLElement
  ): { id: string; isTerminal: boolean } | null {
    if (
      !element.classList.contains(BREADCRUMB_ITEM_CLASS) ||
      element.classList.contains(BREADCRUMB_ELLIPSIS_CLASS)
    ) {
      return null;
    }
    const id = element.dataset.id;
    if (id === undefined) {
      return null;
    }
    const positionStr = element.dataset.position;
    const position = positionStr !== undefined ? parseInt(positionStr, 10) : -1;
    const isTerminal =
      Number.isFinite(position) && position === this._segments.length - 1;
    return { id, isTerminal };
  }

  /**
   * Handle a `keydown` event.
   */
  private _evtKeyDown(event: KeyboardEvent): void {
    if (this._isEditMode) {
      return;
    }
    const part = this._resolvePartFromEvent(event.target);
    if (!part || !this._content.contains(part.element)) {
      return;
    }

    const isActivateKey = event.key === 'Enter' || event.key === ' ';
    if (isActivateKey) {
      this._activatePart(part.element, part.kind, /* viaKeyboard */ true);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    const items = this._getFocusableElements();
    const idx = items.indexOf(part.element);
    if (idx === -1) {
      return;
    }
    const delta = event.key === 'ArrowLeft' ? -1 : 1;
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= items.length) {
      return;
    }
    this._focusElement(items[nextIdx]);
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Handle a `click` event.
   */
  private _evtClick(event: MouseEvent): void {
    if (event.button !== 0) {
      return;
    }
    if (this._isEditMode) {
      return;
    }
    const part = this._resolvePartFromEvent(event.target);
    if (part && this._content.contains(part.element)) {
      this._activatePart(part.element, part.kind, /* viaKeyboard */ false);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // The click landed on the widget background (including separators between
    // items). Treat this as an explicit edit request.
    this._editRequested.emit();
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Move focus to the given part and emit the matching activation signal.
   */
  private _activatePart(
    element: HTMLElement,
    kind: 'segment' | 'shortcut' | 'ellipsis',
    viaKeyboard: boolean
  ): void {
    this._focusElement(element);
    switch (kind) {
      case 'segment': {
        const desc = this._describeSegmentPart(element);
        if (!desc) {
          return;
        }
        this._segmentActivated.emit({
          id: desc.id,
          isTerminal: desc.isTerminal,
          viaKeyboard
        });
        return;
      }
      case 'shortcut': {
        const id = element.dataset.id;
        if (id === undefined) {
          return;
        }
        this._shortcutActivated.emit({ id, viaKeyboard });
        return;
      }
      case 'ellipsis': {
        this._ellipsisActivated.emit({
          hiddenSegmentIds: this._hiddenSegmentIds(),
          viaKeyboard
        });
        return;
      }
    }
  }

  /**
   * Compute the ids of segments currently hidden behind the ellipsis.
   *
   * Returns an empty array when no segments are hidden.
   */
  private _hiddenSegmentIds(): ReadonlyArray<string> {
    if (this._fullPath || this._segments.length === 0) {
      return [];
    }
    const left =
      this._previousState?.minimumLeftItems ?? this._minimumLeftItems;
    const right =
      this._previousState?.minimumRightItems ?? this._minimumRightItems;
    if (this._segments.length <= left + right) {
      return [];
    }
    return this._segments
      .slice(left, this._segments.length - right)
      .map(s => s.id);
  }

  /**
   * Handle `lm-dragenter`.
   */
  private _evtDragEnter(event: Drag.Event): void {
    const result = this._dropTargetForEvent(event);
    if (!result) {
      return;
    }
    if (!this._acceptDropAt(result.target, event)) {
      return;
    }
    this._highlightDropTarget(result.element);
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Handle `lm-dragleave`.
   */
  private _evtDragLeave(event: Drag.Event): void {
    event.preventDefault();
    event.stopPropagation();
    this._clearDropHighlight();
  }

  /**
   * Handle `lm-dragover`.
   */
  private _evtDragOver(event: Drag.Event): void {
    event.preventDefault();
    event.stopPropagation();
    this._clearDropHighlight();
    const result = this._dropTargetForEvent(event);
    if (!result) {
      return;
    }
    if (!this._acceptDropAt(result.target, event)) {
      return;
    }
    event.dropAction = event.proposedAction;
    this._highlightDropTarget(result.element);
  }

  /**
   * Handle `lm-drop`.
   */
  private _evtDrop(event: Drag.Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.proposedAction === 'none') {
      event.dropAction = 'none';
      this._clearDropHighlight();
      return;
    }
    const result = this._dropTargetForEvent(event);
    if (!result) {
      this._clearDropHighlight();
      return;
    }
    if (!this._acceptDropAt(result.target, event)) {
      this._clearDropHighlight();
      return;
    }
    event.dropAction = event.proposedAction;
    this._clearDropHighlight();
    this._dropOccurred.emit({ target: result.target, event });
  }

  /**
   * Locate the drop-target element under a drag event, if any.
   */
  private _dropTargetForEvent(
    event: Drag.Event
  ): { element: HTMLElement; target: BreadcrumbDropTarget } | null {
    const elements = this._getDropTargetElements();
    let node = event.target as HTMLElement | null;
    while (node && node !== this.node) {
      const idx = elements.indexOf(node);
      if (idx !== -1) {
        const hit = elements[idx];
        const id = hit.dataset.id;
        if (id === undefined) {
          return null;
        }
        const kind: 'segment' | 'shortcut' = hit.classList.contains(
          BREADCRUMB_SHORTCUT_CLASS
        )
          ? 'shortcut'
          : 'segment';
        return { element: hit, target: { kind, id } };
      }
      node = node.parentElement;
    }
    return null;
  }

  /**
   * Ask the consumer-supplied policy whether to accept a drop.
   *
   * Defaults to `false` when no policy is configured (i.e. drops are opt-in).
   */
  private _acceptDropAt(
    target: BreadcrumbDropTarget,
    event: Drag.Event
  ): boolean {
    if (!this._acceptDrop) {
      return false;
    }
    try {
      return this._acceptDrop(target, event);
    } catch {
      return false;
    }
  }

  /**
   * Add the drop-highlight class to an element.
   */
  private _highlightDropTarget(element: HTMLElement): void {
    element.classList.add(BREADCRUMB_DROP_TARGET_CLASS);
  }

  /**
   * Remove the drop-highlight class from any element in the widget.
   */
  private _clearDropHighlight(): void {
    const existing = this.node.getElementsByClassName(
      BREADCRUMB_DROP_TARGET_CLASS
    );
    while (existing.length > 0) {
      existing[0].classList.remove(BREADCRUMB_DROP_TARGET_CLASS);
    }
  }

  /**
   * Handle a resize observation.
   */
  private _onResize(): void {
    if (this.isDisposed || !this.isAttached) {
      return;
    }
    this._previousState = null;
    this.update();
  }

  /**
   * Compute how many left/right items to keep visible at the current width.
   */
  private _calculateAdaptiveItems(): { left: number; right: number } {
    this._lastRenderedWidth = 0;

    const totalParts = this._segments.length;
    if (this._fullPath || totalParts === 0) {
      return { left: this._minimumLeftItems, right: this._minimumRightItems };
    }

    const minTotal = this._minimumLeftItems + this._minimumRightItems;
    if (totalParts <= minTotal) {
      return { left: this._minimumLeftItems, right: this._minimumRightItems };
    }

    const containerWidth = this.node.clientWidth;
    if (containerWidth === 0) {
      return { left: this._minimumLeftItems, right: this._minimumRightItems };
    }

    if (
      !this._cachedWidths ||
      this._cachedWidths.itemWidths.length !== totalParts ||
      this._cachedWidths.shortcutCount !== this._leadingShortcuts.length
    ) {
      this._measureAllItemWidths();
    }
    const cache = this._cachedWidths!;
    const separatorWidth = cache.separator;
    const ellipsisOverhead = cache.ellipsis + separatorWidth;

    const shortcutsWidth = cache.shortcutsTotal;
    // The trail always includes a leading separator immediately after the
    // shortcuts (or at the very start, when there are no shortcuts).
    const fixedOverhead = shortcutsWidth + separatorWidth;
    const availableForItems = containerWidth - fixedOverhead;

    let totalWidth = 0;
    for (let i = 0; i < totalParts; i++) {
      totalWidth += cache.itemWidths[i] + separatorWidth;
    }
    if (totalWidth <= availableForItems) {
      this._lastRenderedWidth = fixedOverhead + totalWidth;
      return { left: totalParts, right: 0 };
    }

    const availableWithEllipsis = availableForItems - ellipsisOverhead;

    let leftUsed = 0;
    for (let i = 0; i < this._minimumLeftItems && i < totalParts; i++) {
      leftUsed += cache.itemWidths[i] + separatorWidth;
    }
    const availableForRight = availableWithEllipsis - leftUsed;

    let rightItems = 0;
    let usedWidth = 0;
    for (let i = totalParts - 1; i >= this._minimumLeftItems; i--) {
      const w = cache.itemWidths[i] + separatorWidth;
      if (usedWidth + w <= availableForRight) {
        usedWidth += w;
        rightItems++;
      } else {
        break;
      }
    }

    const finalRight = Math.max(rightItems, this._minimumRightItems);
    let rightUsed = usedWidth;
    if (finalRight > rightItems) {
      rightUsed = 0;
      for (let i = totalParts - finalRight; i < totalParts; i++) {
        rightUsed += cache.itemWidths[i] + separatorWidth;
      }
    }
    this._lastRenderedWidth =
      fixedOverhead + ellipsisOverhead + leftUsed + rightUsed;
    return { left: this._minimumLeftItems, right: finalRight };
  }

  /**
   * Populate `_cachedWidths` by rendering each item off-screen.
   */
  private _measureAllItemWidths(): void {
    const node = this._content;
    const separators = node.getElementsByClassName(BREADCRUMB_SEPARATOR_CLASS);
    const separator = separators.length > 0 ? separators[0] : null;
    const ellipsis = this._ellipsisElement;

    const measurer = document.createElement('div');
    measurer.style.position = 'absolute';
    measurer.style.visibility = 'hidden';
    measurer.style.height = '0';
    measurer.style.overflow = 'hidden';
    measurer.style.whiteSpace = 'nowrap';
    measurer.className = BREADCRUMB_CLASS;
    node.appendChild(measurer);

    const itemWidths: number[] = [];
    for (let i = 0; i < this._segments.length; i++) {
      const elem = document.createElement('span');
      elem.className = BREADCRUMB_ITEM_CLASS;
      elem.textContent = this._segments[i].label;
      measurer.appendChild(elem);
      const measured = elem.getBoundingClientRect().width;
      itemWidths.push(
        (measured > 0
          ? measured
          : Math.max(this._segments[i].label.length * 8, 20)) + 4
      );
    }

    // Measure live shortcut elements when present; otherwise estimate.
    let shortcutsTotal = 0;
    if (this._leadingShortcuts.length > 0) {
      const liveShortcuts = node.getElementsByClassName(
        BREADCRUMB_SHORTCUT_CLASS
      );
      if (liveShortcuts.length === this._leadingShortcuts.length) {
        for (let i = 0; i < liveShortcuts.length; i++) {
          shortcutsTotal +=
            (liveShortcuts[i].getBoundingClientRect().width || 22) + 4;
        }
      } else {
        // Fallback estimate when shortcuts have not yet been rendered.
        shortcutsTotal = this._leadingShortcuts.length * (22 + 4);
      }
    }

    node.removeChild(measurer);

    this._cachedWidths = {
      shortcutsTotal,
      shortcutCount: this._leadingShortcuts.length,
      ellipsis: (ellipsis.getBoundingClientRect().width || 28) + 4,
      separator: separator?.getBoundingClientRect().width || 4,
      itemWidths
    };
  }

  protected translator: ITranslator;
  protected _trans: TranslationBundle;

  private _segments: IBreadcrumbItem[];
  private _leadingShortcuts: IBreadcrumbLeadingShortcut[];
  private _fullPath: boolean;
  private _minimumLeftItems: number;
  private _minimumRightItems: number;
  private _acceptDrop?: (
    target: BreadcrumbDropTarget,
    event: Drag.Event
  ) => boolean;

  private _container: HTMLElement;
  private _content: HTMLElement;
  private _ellipsisElement: HTMLElement;

  private _isEditMode = false;
  private _previousState: Private.IRenderState | null = null;
  private _cachedWidths: Private.IWidthCache | null = null;
  private _lastRenderedWidth = 0;
  private _resizeObserver: ResizeObserver;
  private _resizeThrottler: Throttler;

  private _segmentActivated = new Signal<this, IBreadcrumbSegmentActivated>(
    this
  );
  private _shortcutActivated = new Signal<this, IBreadcrumbShortcutActivated>(
    this
  );
  private _ellipsisActivated = new Signal<this, IBreadcrumbEllipsisActivated>(
    this
  );
  private _editRequested = new Signal<this, void>(this);
  private _dropOccurred = new Signal<this, IBreadcrumbDrop>(this);
}

/**
 * The namespace for the {@link Breadcrumbs} class statics.
 */
export namespace Breadcrumbs {
  /**
   * Options accepted by the {@link Breadcrumbs} constructor.
   */
  export interface IOptions {
    /**
     * Initial path segments.
     */
    segments?: ReadonlyArray<IBreadcrumbItem>;

    /**
     * Initial leading shortcuts (e.g. home).
     */
    leadingShortcuts?: ReadonlyArray<IBreadcrumbLeadingShortcut>;

    /**
     * If `true`, every segment is rendered regardless of available width.
     * Defaults to `false`.
     */
    fullPath?: boolean;

    /**
     * Minimum number of leading segments to keep visible when the trail is
     * collapsed. Defaults to `0`.
     */
    minimumLeftItems?: number;

    /**
     * Minimum number of trailing segments to keep visible when the trail is
     * collapsed. Defaults to `2`.
     */
    minimumRightItems?: number;

    /**
     * Drop-acceptance policy. The function is invoked on `lm-dragenter`,
     * `lm-dragover`, and `lm-drop` for any segment or shortcut under the
     * pointer; it should return `true` if the drop should be accepted there.
     *
     * If not provided, drops are never accepted (drop-target visuals are
     * suppressed).
     */
    acceptDrop?: (target: BreadcrumbDropTarget, event: Drag.Event) => boolean;

    /**
     * The application language translator.
     */
    translator?: ITranslator;
  }
}

/**
 * Internal helpers.
 */
namespace Private {
  /**
   * The cached render state, used to skip DOM updates when nothing has
   * meaningfully changed since the last render.
   */
  export interface IRenderState {
    [key: string]: string | number | boolean;
    segmentKey: string;
    shortcutKey: string;
    fullPath: boolean;
    minimumLeftItems: number;
    minimumRightItems: number;
  }

  /**
   * Cached pixel widths used by the adaptive-layout calculation.
   */
  export interface IWidthCache {
    shortcutsTotal: number;
    shortcutCount: number;
    ellipsis: number;
    separator: number;
    itemWidths: number[];
  }

  /**
   * Structural equality on path segments. Considers only `id` and `label`;
   * tooltip differences are ignored (they don't affect width or layout).
   */
  export function segmentsEqual(
    a: ReadonlyArray<IBreadcrumbItem>,
    b: ReadonlyArray<IBreadcrumbItem>
  ): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i].id !== b[i].id || a[i].label !== b[i].label) {
        return false;
      }
    }
    return true;
  }

  /**
   * Structural equality on leading shortcuts. Compares id, icon identity, and
   * className.
   */
  export function shortcutsEqual(
    a: ReadonlyArray<IBreadcrumbLeadingShortcut>,
    b: ReadonlyArray<IBreadcrumbLeadingShortcut>
  ): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (
        a[i].id !== b[i].id ||
        a[i].icon !== b[i].icon ||
        a[i].className !== b[i].className
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Create the singleton ellipsis element.
   */
  export function createEllipsisElement(): HTMLElement {
    const element = ellipsesIcon.element({
      className: `${BREADCRUMB_ITEM_CLASS} ${BREADCRUMB_ELLIPSIS_CLASS}`,
      tag: 'span',
      stylesheet: 'breadCrumb'
    });
    element.tabIndex = -1;
    return element;
  }

  /**
   * Build the DOM children of the trail container.
   */
  export function renderTrail(
    container: HTMLElement,
    segments: ReadonlyArray<IBreadcrumbItem>,
    shortcuts: ReadonlyArray<IBreadcrumbLeadingShortcut>,
    ellipsisElement: HTMLElement,
    minimumLeftItems: number,
    minimumRightItems: number,
    fullPath: boolean
  ): void {
    const nodes: Node[] = [];

    for (const shortcut of shortcuts) {
      nodes.push(createShortcutElement(shortcut));
    }
    // Always emit a separator after the shortcuts (or at the start if there
    // are no shortcuts). This matches the long-standing JupyterLab visual
    // convention of a leading "/" on the trail.
    nodes.push(createSeparator());

    if (segments.length > 0) {
      if (!fullPath && segments.length > minimumLeftItems + minimumRightItems) {
        for (let i = 0; i < minimumLeftItems; i++) {
          nodes.push(createItemElement(segments[i], i));
          nodes.push(createSeparator());
        }

        const hiddenSegments = segments.slice(
          minimumLeftItems,
          segments.length - minimumRightItems
        );
        ellipsisElement.title = hiddenSegments.map(s => s.label).join('/');
        ellipsisElement.dataset.hiddenIds = hiddenSegments
          .map(s => s.id)
          .join('\x1e');
        nodes.push(ellipsisElement);
        nodes.push(createSeparator());

        for (
          let i = segments.length - minimumRightItems;
          i < segments.length;
          i++
        ) {
          nodes.push(createItemElement(segments[i], i));
          nodes.push(createSeparator());
        }
      } else {
        for (let i = 0; i < segments.length; i++) {
          nodes.push(createItemElement(segments[i], i));
          nodes.push(createSeparator());
        }
      }
    }

    container.replaceChildren(...nodes);
  }

  /**
   * Create a segment item element.
   */
  function createItemElement(
    segment: IBreadcrumbItem,
    position: number
  ): HTMLElement {
    const elem = document.createElement('span');
    elem.className = BREADCRUMB_ITEM_CLASS;
    elem.textContent = segment.label;
    elem.title = segment.title ?? segment.label;
    elem.dataset.id = segment.id;
    elem.dataset.position = String(position);
    elem.tabIndex = -1;
    return elem;
  }

  /**
   * Create a leading shortcut element.
   */
  function createShortcutElement(
    shortcut: IBreadcrumbLeadingShortcut
  ): HTMLElement {
    const className = shortcut.className
      ? `${BREADCRUMB_SHORTCUT_CLASS} ${shortcut.className}`
      : BREADCRUMB_SHORTCUT_CLASS;
    const elem = shortcut.icon.element({
      className,
      tag: 'span',
      title: shortcut.title ?? '',
      stylesheet: 'breadCrumb'
    });
    elem.dataset.id = shortcut.id;
    elem.tabIndex = -1;
    return elem;
  }

  /**
   * Create a path-separator element.
   */
  function createSeparator(): HTMLElement {
    const item = document.createElement('span');
    item.className = BREADCRUMB_SEPARATOR_CLASS;
    item.textContent = '/';
    return item;
  }
}
