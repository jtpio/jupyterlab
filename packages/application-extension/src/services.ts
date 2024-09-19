/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  IServerSettings,
  IServiceManager,
  ServerConnection,
  ServiceManager
} from '@jupyterlab/services';

/**
 * Instantiate a new service manager.
 */
const serviceManagerPlugin: JupyterFrontEndPlugin<ServiceManager.IManager> = {
  id: '@jupyterlab/application-extension:service-manager',
  autoStart: true,
  provides: IServiceManager,
  optional: [IServerSettings],
  activate: (
    app: JupyterFrontEnd,
    serverSettings: ServerConnection.ISettings | null
  ): ServiceManager.IManager => {
    return new ServiceManager({ serverSettings: serverSettings ?? undefined });
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

export default [serviceManagerPlugin, serverSettingsPlugin];
