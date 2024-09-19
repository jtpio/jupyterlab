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
  Event,
  EventManager,
  IContentsManager,
  IDefaultDrive,
  IEventManager,
  IKernelManager,
  IKernelSpecManager,
  INbConvertManager,
  IServerSettings,
  IServiceManager,
  ISessionManager,
  ISettingManager,
  ITerminalManager,
  IUserManager,
  IWorkspaceManager,
  Kernel,
  KernelManager,
  KernelSpec,
  KernelSpecManager,
  NbConvert,
  NbConvertManager,
  ServerConnection,
  ServiceManager,
  Session,
  SessionManager,
  Setting,
  SettingManager,
  Terminal,
  TerminalManager,
  User,
  UserManager,
  Workspace,
  WorkspaceManager
} from '@jupyterlab/services';

// TODO: move to a new `@jupyterlab/services-extension` package?

/**
 * The default contents manager plugin.
 */
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
 * The event manager plugin.
 */
const eventManagerPlugin: JupyterFrontEndPlugin<Event.IManager> = {
  id: '@jupyterlab/application-extension:event-manager',
  autoStart: true,
  provides: IEventManager,
  optional: [IServerSettings],
  activate: (
    app: JupyterFrontEnd,
    serverSettings: ServerConnection.ISettings | undefined
  ): Event.IManager => {
    return new EventManager({ serverSettings });
  }
};

/**
 * The kernel manager plugin.
 */
const kernelManagerPlugin: JupyterFrontEndPlugin<Kernel.IManager> = {
  id: '@jupyterlab/application-extension:kernel-manager',
  autoStart: true,
  provides: IKernelManager,
  optional: [IServerSettings],
  activate: (
    app: JupyterFrontEnd,
    serverSettings: ServerConnection.ISettings | undefined
  ): Kernel.IManager => {
    return new KernelManager({ serverSettings });
  }
};

/**
 * The kernel spec manager plugin.
 */
const kernelSpecManagerPlugin: JupyterFrontEndPlugin<KernelSpec.IManager> = {
  id: '@jupyterlab/application-extension:kernel-spec-manager',
  autoStart: true,
  provides: IKernelSpecManager,
  optional: [IServerSettings],
  activate: (
    app: JupyterFrontEnd,
    serverSettings: ServerConnection.ISettings | undefined
  ): KernelSpec.IManager => {
    return new KernelSpecManager({ serverSettings });
  }
};

/**
 * The nbconvert manager plugin.
 */
const nbConvertManagerPlugin: JupyterFrontEndPlugin<NbConvert.IManager> = {
  id: '@jupyterlab/application-extension:nbconvert-manager',
  autoStart: true,
  provides: INbConvertManager,
  optional: [IServerSettings],
  activate: (
    app: JupyterFrontEnd,
    serverSettings: ServerConnection.ISettings | undefined
  ): NbConvert.IManager => {
    return new NbConvertManager({ serverSettings });
  }
};

/**
 * The session manager plugin.
 */
const sessionManagerPlugin: JupyterFrontEndPlugin<Session.IManager> = {
  id: '@jupyterlab/application-extension:session-manager',
  autoStart: true,
  provides: ISessionManager,
  requires: [IKernelManager],
  optional: [IServerSettings],
  activate: (
    app: JupyterFrontEnd,
    kernelManager: Kernel.IManager,
    serverSettings: ServerConnection.ISettings | undefined
  ): Session.IManager => {
    return new SessionManager({ kernelManager, serverSettings });
  }
};

/**
 * The setting manager plugin.
 */
const settingManagerPlugin: JupyterFrontEndPlugin<Setting.IManager> = {
  id: '@jupyterlab/application-extension:setting-manager',
  autoStart: true,
  provides: ISettingManager,
  optional: [IServerSettings],
  activate: (
    app: JupyterFrontEnd,
    serverSettings: ServerConnection.ISettings | undefined
  ): Setting.IManager => {
    return new SettingManager({ serverSettings });
  }
};

/**
 * The terminal manager plugin.
 */
const terminalManagerPlugin: JupyterFrontEndPlugin<Terminal.IManager> = {
  id: '@jupyterlab/application-extension:terminal-manager',
  autoStart: true,
  provides: ITerminalManager,
  optional: [IServerSettings],
  activate: (
    app: JupyterFrontEnd,
    serverSettings: ServerConnection.ISettings | undefined
  ): Terminal.IManager => {
    return new TerminalManager({ serverSettings });
  }
};

/**
 * The user manager plugin.
 */
const userManagerPlugin: JupyterFrontEndPlugin<User.IManager> = {
  id: '@jupyterlab/application-extension:user-manager',
  autoStart: true,
  provides: IUserManager,
  optional: [IServerSettings],
  activate: (
    app: JupyterFrontEnd,
    serverSettings: ServerConnection.ISettings | undefined
  ): User.IManager => {
    return new UserManager({ serverSettings });
  }
};

/**
 * The workspace manager plugin.
 */
const workspaceManagerPlugin: JupyterFrontEndPlugin<Workspace.IManager> = {
  id: '@jupyterlab/application-extension:workspace-manager',
  autoStart: true,
  provides: IWorkspaceManager,
  optional: [IServerSettings],
  activate: (
    app: JupyterFrontEnd,
    serverSettings: ServerConnection.ISettings | undefined
  ): Workspace.IManager => {
    return new WorkspaceManager({ serverSettings });
  }
};

/**
 * Instantiate a new service manager.
 */
const serviceManagerPlugin: JupyterFrontEndPlugin<ServiceManager.IManager> = {
  id: '@jupyterlab/application-extension:service-manager',
  autoStart: true,
  provides: IServiceManager,
  // Builder is not exposed as a plugin since it is now deprecated.
  optional: [
    IContentsManager,
    IDefaultDrive,
    IServerSettings,
    IEventManager,
    IKernelManager,
    IKernelSpecManager,
    INbConvertManager,
    ISessionManager,
    ISettingManager,
    ITerminalManager,
    IUserManager,
    IWorkspaceManager
  ],
  activate: (
    app: JupyterFrontEnd,
    contents: Contents.IManager | undefined,
    defaultDrive: Contents.IDrive | undefined,
    serverSettings: ServerConnection.ISettings | undefined,
    events: Event.IManager | undefined,
    kernels: Kernel.IManager | undefined,
    kernelspecs: KernelSpec.IManager | undefined,
    nbconvert: NbConvert.IManager | undefined,
    sessions: Session.IManager | undefined,
    settings: Setting.IManager | undefined,
    terminals: Terminal.IManager | undefined,
    user: User.IManager | undefined,
    workspaces: Workspace.IManager | undefined
  ): ServiceManager.IManager => {
    return new ServiceManager({
      contents,
      defaultDrive,
      serverSettings,
      events,
      kernels,
      kernelspecs,
      nbconvert,
      sessions,
      settings,
      terminals,
      user,
      workspaces
    });
  }
};

/**
 * The default server settings plugin.
 */
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
  eventManagerPlugin,
  serverSettingsPlugin,
  serviceManagerPlugin,
  kernelManagerPlugin,
  kernelSpecManagerPlugin,
  nbConvertManagerPlugin,
  sessionManagerPlugin,
  settingManagerPlugin,
  terminalManagerPlugin,
  userManagerPlugin,
  workspaceManagerPlugin
];
