/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  Contents,
  ContentsManager,
  Drive,
  IContentsManager,
  IDefaultDrive,
  IServerSettings,
  IServiceManager,
  ServerConnection,
  ServiceManager
} from '@jupyterlab/services';

// TODO: move to a new `@jupyterlab/services-extension` package?

const contentsManagerPlugin: JupyterFrontEndPlugin<Contents.IManager> = {
  id: '@jupyterlab/application-extension:contents-manager',
  autoStart: true,
  provides: IContentsManager,
  requires: [IDefaultDrive, IServerSettings],
  activate: (
    app: JupyterFrontEnd,
    defaultDrive: Contents.IDrive,
    serverSettings: ServerConnection.ISettings
  ): Contents.IManager => {
    return new ContentsManager({
      defaultDrive,
      serverSettings
    });
  }
};

/**
 * The default drive plugin.
 */
const defaultDrivePlugin: JupyterFrontEndPlugin<Contents.IDrive> = {
  id: '@jupyterlab/application-extension:default-drive',
  autoStart: true,
  provides: IDefaultDrive,
  optional: [IServerSettings],
  activate: (
    app: JupyterFrontEnd,
    serverSettings: ServerConnection.ISettings | null
  ): Contents.IDrive => {
    console.log('Using the default drive plugin');
    return new Drive({ serverSettings: serverSettings ?? undefined });
  }
};

/**
 * Instantiate a new service manager.
 */
const serviceManagerPlugin: JupyterFrontEndPlugin<ServiceManager.IManager> = {
  id: '@jupyterlab/application-extension:service-manager',
  autoStart: true,
  provides: IServiceManager,
  optional: [IContentsManager, IDefaultDrive, IServerSettings],
  activate: (
    app: JupyterFrontEnd,
    contents: Contents.IManager | undefined,
    defaultDrive: Contents.IDrive | undefined,
    serverSettings: ServerConnection.ISettings | undefined
  ): ServiceManager.IManager => {
    return new ServiceManager({
      contents,
      defaultDrive,
      serverSettings
    });
  }
};

const serverSettingsPlugin: JupyterFrontEndPlugin<ServerConnection.ISettings> =
  {
    id: '@jupyterlab/application-extension:server-settings',
    autoStart: true,
    provides: IServerSettings,
    activate: (app: JupyterFrontEnd): ServerConnection.ISettings => {
      console.log('Using the default server settings plugin');
      console.log('app: ', app);
      return ServerConnection.makeSettings();
    }
  };

export default [
  contentsManagerPlugin,
  defaultDrivePlugin,
  serviceManagerPlugin,
  serverSettingsPlugin
];
