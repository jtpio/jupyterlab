// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Contents, ServerConnection } from '.';
import { ServiceManager } from './manager';

import { Token } from '@lumino/coreutils';

/**
 * The default drive token.
 */
export const IDefaultDrive = new Token<Contents.IDrive>(
  '@jupyterlab/services:IDefaultDrive',
  'The default drive for the contents manager.'
);

/**
 * The default service manager token.
 */
export const IServiceManager = new Token<ServiceManager.IManager>(
  '@jupyterlab/services:IServiceManager',
  'The service manager for the application.'
);

/**
 * The default server settings token.
 */
export const IServerSettings = new Token<ServerConnection.ISettings>(
  '@jupyterlab/services:IServerSettings',
  'The server settings for the application.'
);
