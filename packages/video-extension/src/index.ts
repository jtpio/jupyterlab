/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/
/**
 * @packageDocumentation
 * @module video-extension
 */

import { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { Widget } from '@lumino/widgets';

/**
 * The CSS class to add to the Video widget.
 */
const VIDEO_CLASS = 'jp-RenderedVideo';

/**
 * The MIME types for video.
 */
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'];

/**
 * A widget for rendering video files.
 */
export class RenderedVideo extends Widget implements IRenderMime.IRenderer {
  /**
   * Create a new widget for rendering video.
   */
  constructor(options: IRenderMime.IRendererOptions) {
    super();
    this._mimeType = options.mimeType;
    this.addClass(VIDEO_CLASS);
    this._video = document.createElement('video');
    this._video.controls = true;
    this.node.appendChild(this._video);
  }

  /**
   * Render video into this widget's node.
   */
  async renderModel(model: IRenderMime.IMimeModel): Promise<void> {
    const data = model.data[this._mimeType] as string;
    if (!data) {
      return;
    }

    // Set the source using the base64 data
    this._video.src = `data:${this._mimeType};base64,${data}`;
  }

  private _video: HTMLVideoElement;
  private _mimeType: string;
}

/**
 * A mime renderer factory for video data.
 */
export const rendererFactory: IRenderMime.IRendererFactory = {
  safe: true,
  mimeTypes: VIDEO_MIME_TYPES,
  createRenderer: options => new RenderedVideo(options)
};

const extension: IRenderMime.IExtension = {
  id: '@jupyterlab/video-extension:plugin',
  rendererFactory,
  rank: 0,
  dataType: 'string',
  fileTypes: [
    {
      name: 'video',
      fileFormat: 'base64',
      mimeTypes: VIDEO_MIME_TYPES,
      extensions: ['.mp4', '.webm', '.ogv']
    }
    // TODO: icon
  ],
  documentWidgetFactoryOptions: {
    name: 'Video',
    primaryFileType: 'video',
    modelName: 'base64',
    fileTypes: ['video'],
    defaultFor: ['video']
  }
};

export default extension;
