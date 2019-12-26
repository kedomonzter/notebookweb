// An interface used by the Desktop app to interact with SN
import _ from 'lodash';
import { isDesktopApplication } from '@/utils';
import { protocolManager, SFModelManager } from 'snjs';

export class DesktopManager {
  /* @ngInject */
  constructor(
    $rootScope,
    $timeout,
    modelManager,
    syncManager,
    authManager,
    passcodeManager,
    keyManager
  ) {
    this.passcodeManager = passcodeManager;
    this.modelManager = modelManager;
    this.authManager = authManager;
    this.syncManager = syncManager;
    this.keyManager = keyManager;
    this.$rootScope = $rootScope;
    this.timeout = $timeout;
    this.updateObservers = [];
    this.componentActivationObservers = [];

    this.isDesktop = isDesktopApplication();

    $rootScope.$on("initial-data-loaded", () => {
      this.dataLoaded = true;
      if(this.dataLoadHandler) {
        this.dataLoadHandler();
      }
    });

    $rootScope.$on("major-data-change", () => {
      if(this.majorDataChangeHandler) {
        this.majorDataChangeHandler();
      }
    })
  }

  saveBackup() {
    this.majorDataChangeHandler && this.majorDataChangeHandler();
  }

  getExtServerHost() {
    console.assert(this.extServerHost, "extServerHost is null");
    return this.extServerHost;
  }

  /*
    Sending a component in its raw state is really slow for the desktop app
    Keys are not passed into ItemParams, so the result is not encrypted
   */
  async convertComponentForTransmission(component) {
    const itemParams = await protocolManager.generateExportParameters({
      item: component,
      exportType: SNProtocolOperator.ExportTypeFile,
      includeDeleted: true
    });
    return itemParams;
  }

  // All `components` should be installed
  syncComponentsInstallation(components) {
    if(!this.isDesktop) return;

    Promise.all(components.map((component) => {
      return this.convertComponentForTransmission(component);
    })).then((data) => {
      this.installationSyncHandler(data);
    })
  }

  async installComponent(component) {
    this.installComponentHandler(await this.convertComponentForTransmission(component));
  }

  registerUpdateObserver(callback) {
    var observer = {id: Math.random, callback: callback};
    this.updateObservers.push(observer);
    return observer;
  }

  searchText(text) {
    if(!this.isDesktop) {
      return;
    }
    this.lastSearchedText = text;
    this.searchHandler && this.searchHandler(text);
  }

  redoSearch()  {
    if(this.lastSearchedText) {
      this.searchText(this.lastSearchedText);
    }
  }


  deregisterUpdateObserver(observer) {
    _.pull(this.updateObservers, observer);
  }

  // Pass null to cancel search
  desktop_setSearchHandler(handler) {
    this.searchHandler = handler;
  }

  desktop_windowGainedFocus() {
    this.$rootScope.$broadcast("window-gained-focus");
  }

  desktop_windowLostFocus() {
    this.$rootScope.$broadcast("window-lost-focus");
  }

  desktop_onComponentInstallationComplete(componentData, error) {
    // console.log("Web|Component Installation/Update Complete", componentData, error);

    // Desktop is only allowed to change these keys:
    let permissableKeys = ["package_info", "local_url"];
    var component = this.modelManager.findItem(componentData.uuid);

    if(!component) {
      console.error("desktop_onComponentInstallationComplete component is null for uuid", componentData.uuid);
      return;
    }

    if(error) {
      component.setAppDataItem("installError", error);
    } else {
      for(var key of permissableKeys) {
        component[key] = componentData.content[key];
      }
      this.modelManager.notifySyncObserversOfModels([component], SFModelManager.MappingSourceDesktopInstalled);
      component.setAppDataItem("installError", null);
    }

    this.modelManager.setItemDirty(component, true);
    this.syncManager.sync();

    this.timeout(() => {
      for(var observer of this.updateObservers) {
        observer.callback(component);
      }
    });
  }

  desktop_registerComponentActivationObserver(callback) {
    var observer = {id: Math.random, callback: callback};
    this.componentActivationObservers.push(observer);
    return observer;
  }

  desktop_deregisterComponentActivationObserver(observer) {
    _.pull(this.componentActivationObservers, observer);
  }

  /* Notify observers that a component has been registered/activated */
  async notifyComponentActivation(component) {
    var serializedComponent = await this.convertComponentForTransmission(component);

    this.timeout(() => {
      for(var observer of this.componentActivationObservers) {
        observer.callback(serializedComponent);
      }
    });
  }

  /* Used to resolve "sn://" */
  desktop_setExtServerHost(host) {
    this.extServerHost = host;
    this.$rootScope.$broadcast("desktop-did-set-ext-server-host");
  }

  desktop_setComponentInstallationSyncHandler(handler) {
    this.installationSyncHandler = handler;
  }

  desktop_setInstallComponentHandler(handler) {
    this.installComponentHandler = handler;
  }

  desktop_setInitialDataLoadHandler(handler) {
    this.dataLoadHandler = handler;
    if(this.dataLoaded) {
      this.dataLoadHandler();
    }
  }

  async desktop_requestBackupFile(callback) {
    const keyParams = await this.keyManager.getRootKeyKeyParams();
    const returnNullOnEmpty = true;
    this.modelManager.getAllItemsJSONData(
      keyParams,
      returnNullOnEmpty
    ).then((data) => {
      callback(data);
    })
  }

  desktop_setMajorDataChangeHandler(handler) {
    this.majorDataChangeHandler = handler;
  }

  desktop_didBeginBackup() {
    this.$rootScope.$broadcast("did-begin-local-backup");
  }

  desktop_didFinishBackup(success) {
    this.$rootScope.$broadcast("did-finish-local-backup", {success: success});
  }
}
