import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
  ICommandPalette,
  Licenses,
  MainAreaWidget,
  WidgetTracker
} from '@jupyterlab/apputils';
import { PageConfig, URLExt } from '@jupyterlab/coreutils';
import { IMainMenu } from '@jupyterlab/mainmenu';
import { ITranslator } from '@jupyterlab/translation';
import {
  CommandToolbarButton,
  copyrightIcon,
  refreshIcon,
  Toolbar
} from '@jupyterlab/ui-components';
import { ReadonlyJSONObject } from '@lumino/coreutils';

/**
 * The command IDs used by the licenses plugin.
 */
namespace CommandIDs {
  export const licenses = 'apputils:licenses';

  export const licenseReport = 'apputils:license-report';

  export const refreshLicenses = 'apputils:licenses-refresh';
}

/**
 * A plugin to add a licenses reporting tools.
 */
export const licenses: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/help-extension:licenses',
  description: 'Adds licenses used report tools.',
  autoStart: true,
  requires: [ITranslator],
  optional: [IMainMenu, ICommandPalette, ILayoutRestorer],
  activate: (
    app: JupyterFrontEnd,
    translator: ITranslator,
    menu: IMainMenu | null,
    palette: ICommandPalette | null,
    restorer: ILayoutRestorer | null
  ) => {
    // bail if no license API is available from the server
    if (!PageConfig.getOption('licensesUrl')) {
      return;
    }

    const { commands, shell } = app;
    const trans = translator.load('jupyterlab');

    // translation strings
    const category = trans.__('Help');
    const downloadAsText = trans.__('Download All Licenses as');
    const licensesText = trans.__('Licenses');
    const refreshLicenses = trans.__('Refresh Licenses');

    // an incrementer for license widget ids
    let counter = 0;

    const licensesUrl =
      URLExt.join(
        PageConfig.getBaseUrl(),
        PageConfig.getOption('licensesUrl')
      ) + '/';

    const licensesNamespace = 'help-licenses';
    const licensesTracker = new WidgetTracker<MainAreaWidget<Licenses>>({
      namespace: licensesNamespace
    });

    /**
     * Return a full license report format based on a format name
     */
    function formatOrDefault(format: string): Licenses.IReportFormat {
      return (
        Licenses.REPORT_FORMATS[format] ||
        Licenses.REPORT_FORMATS[Licenses.DEFAULT_FORMAT]
      );
    }

    /**
     * Create a MainAreaWidget for a license viewer
     */
    function createLicenseWidget(args: Licenses.ICreateArgs) {
      const licensesModel = new Licenses.Model({
        ...args,
        licensesUrl,
        trans,
        serverSettings: app.serviceManager.serverSettings
      });
      const content = new Licenses({ model: licensesModel });
      content.id = `${licensesNamespace}-${++counter}`;
      content.title.label = licensesText;
      content.title.icon = copyrightIcon;
      const main = new MainAreaWidget({
        content,
        reveal: licensesModel.licensesReady
      });

      main.toolbar.addItem(
        'refresh-licenses',
        new CommandToolbarButton({
          id: CommandIDs.refreshLicenses,
          args: { noLabel: 1 },
          commands
        })
      );

      main.toolbar.addItem('spacer', Toolbar.createSpacerItem());

      for (const format of Object.keys(Licenses.REPORT_FORMATS)) {
        const button = new CommandToolbarButton({
          id: CommandIDs.licenseReport,
          args: { format, noLabel: 1 },
          commands
        });
        main.toolbar.addItem(`download-${format}`, button);
      }

      return main;
    }

    // register license-related commands
    commands.addCommand(CommandIDs.licenses, {
      label: licensesText,
      execute: (args: any) => {
        const licenseMain = createLicenseWidget(args as Licenses.ICreateArgs);
        shell.add(licenseMain, 'main', { type: 'Licenses' });

        // add to tracker so it can be restored, and update when choices change
        void licensesTracker.add(licenseMain);
        licenseMain.content.model.trackerDataChanged.connect(() => {
          void licensesTracker.save(licenseMain);
        });
        return licenseMain;
      }
    });

    commands.addCommand(CommandIDs.refreshLicenses, {
      label: args => (args.noLabel ? '' : refreshLicenses),
      caption: refreshLicenses,
      icon: refreshIcon,
      execute: async () => {
        return licensesTracker.currentWidget?.content.model.initLicenses();
      }
    });

    commands.addCommand(CommandIDs.licenseReport, {
      label: args => {
        if (args.noLabel) {
          return '';
        }
        const format = formatOrDefault(`${args.format}`);
        return `${downloadAsText} ${format.title}`;
      },
      caption: args => {
        const format = formatOrDefault(`${args.format}`);
        return `${downloadAsText} ${format.title}`;
      },
      icon: args => {
        const format = formatOrDefault(`${args.format}`);
        return format.icon;
      },
      execute: async args => {
        const format = formatOrDefault(`${args.format}`);
        return await licensesTracker.currentWidget?.content.model.download({
          format: format.id
        });
      }
    });

    // handle optional integrations
    if (palette) {
      palette.addItem({ command: CommandIDs.licenses, category });
    }

    if (menu) {
      const helpMenu = menu.helpMenu;
      helpMenu.addGroup([{ command: CommandIDs.licenses }], 0);
    }

    if (restorer) {
      void restorer.restore(licensesTracker, {
        command: CommandIDs.licenses,
        name: widget => 'licenses',
        args: widget => {
          const { currentBundleName, currentPackageIndex, packageFilter } =
            widget.content.model;

          const args: Licenses.ICreateArgs = {
            currentBundleName,
            currentPackageIndex,
            packageFilter
          };
          return args as ReadonlyJSONObject;
        }
      });
    }
  }
};
