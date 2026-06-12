import type { DesktopBridge } from "@t3tools/contracts";
import { contextBridge, ipcRenderer } from "electron";

import * as IpcChannels from "./ipc/channels.ts";

function unwrapEnsureSshEnvironmentResult(result: unknown) {
  if (
    typeof result === "object" &&
    result !== null &&
    "type" in result &&
    result.type === IpcChannels.SSH_PASSWORD_PROMPT_CANCELLED_RESULT
  ) {
    const message =
      "message" in result && typeof result.message === "string"
        ? result.message
        : "SSH authentication cancelled.";
    throw new Error(message);
  }
  return result as Awaited<ReturnType<DesktopBridge["ensureSshEnvironment"]>>;
}

contextBridge.exposeInMainWorld("desktopBridge", {
  getAppBranding: () => {
    const result = ipcRenderer.sendSync(IpcChannels.GET_APP_BRANDING_CHANNEL);
    if (typeof result !== "object" || result === null) {
      return null;
    }
    return result as ReturnType<DesktopBridge["getAppBranding"]>;
  },
  getLocalEnvironmentBootstrap: () => {
    const result = ipcRenderer.sendSync(IpcChannels.GET_LOCAL_ENVIRONMENT_BOOTSTRAP_CHANNEL);
    if (typeof result !== "object" || result === null) {
      return null;
    }
    return result as ReturnType<DesktopBridge["getLocalEnvironmentBootstrap"]>;
  },
  getClientSettings: () => ipcRenderer.invoke(IpcChannels.GET_CLIENT_SETTINGS_CHANNEL),
  setClientSettings: (settings) =>
    ipcRenderer.invoke(IpcChannels.SET_CLIENT_SETTINGS_CHANNEL, settings),
  getSavedEnvironmentRegistry: () =>
    ipcRenderer.invoke(IpcChannels.GET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL),
  setSavedEnvironmentRegistry: (records) =>
    ipcRenderer.invoke(IpcChannels.SET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL, records),
  getSavedEnvironmentSecret: (environmentId) =>
    ipcRenderer.invoke(IpcChannels.GET_SAVED_ENVIRONMENT_SECRET_CHANNEL, environmentId),
  setSavedEnvironmentSecret: (environmentId, secret) =>
    ipcRenderer.invoke(IpcChannels.SET_SAVED_ENVIRONMENT_SECRET_CHANNEL, { environmentId, secret }),
  removeSavedEnvironmentSecret: (environmentId) =>
    ipcRenderer.invoke(IpcChannels.REMOVE_SAVED_ENVIRONMENT_SECRET_CHANNEL, environmentId),
  discoverSshHosts: () => ipcRenderer.invoke(IpcChannels.DISCOVER_SSH_HOSTS_CHANNEL),
  ensureSshEnvironment: async (target, options) =>
    unwrapEnsureSshEnvironmentResult(
      await ipcRenderer.invoke(IpcChannels.ENSURE_SSH_ENVIRONMENT_CHANNEL, {
        target,
        ...(options === undefined ? {} : { options }),
      }),
    ),
  disconnectSshEnvironment: (target) =>
    ipcRenderer.invoke(IpcChannels.DISCONNECT_SSH_ENVIRONMENT_CHANNEL, target),
  fetchSshEnvironmentDescriptor: (httpBaseUrl) =>
    ipcRenderer.invoke(IpcChannels.FETCH_SSH_ENVIRONMENT_DESCRIPTOR_CHANNEL, { httpBaseUrl }),
  bootstrapSshBearerSession: (httpBaseUrl, credential) =>
    ipcRenderer.invoke(IpcChannels.BOOTSTRAP_SSH_BEARER_SESSION_CHANNEL, {
      httpBaseUrl,
      credential,
    }),
  fetchSshSessionState: (httpBaseUrl, bearerToken) =>
    ipcRenderer.invoke(IpcChannels.FETCH_SSH_SESSION_STATE_CHANNEL, { httpBaseUrl, bearerToken }),
  issueSshWebSocketTicket: (httpBaseUrl, bearerToken) =>
    ipcRenderer.invoke(IpcChannels.ISSUE_SSH_WEBSOCKET_TOKEN_CHANNEL, { httpBaseUrl, bearerToken }),
  onSshPasswordPrompt: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, request: unknown) => {
      if (typeof request !== "object" || request === null) return;
      listener(request as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(IpcChannels.SSH_PASSWORD_PROMPT_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.SSH_PASSWORD_PROMPT_CHANNEL, wrappedListener);
    };
  },
  resolveSshPasswordPrompt: (requestId, password) =>
    ipcRenderer.invoke(IpcChannels.RESOLVE_SSH_PASSWORD_PROMPT_CHANNEL, { requestId, password }),
  getServerExposureState: () => ipcRenderer.invoke(IpcChannels.GET_SERVER_EXPOSURE_STATE_CHANNEL),
  setServerExposureMode: (mode) =>
    ipcRenderer.invoke(IpcChannels.SET_SERVER_EXPOSURE_MODE_CHANNEL, mode),
  setTailscaleServeEnabled: (input) =>
    ipcRenderer.invoke(IpcChannels.SET_TAILSCALE_SERVE_ENABLED_CHANNEL, input),
  getAdvertisedEndpoints: () => ipcRenderer.invoke(IpcChannels.GET_ADVERTISED_ENDPOINTS_CHANNEL),
  pickFolder: (options) => ipcRenderer.invoke(IpcChannels.PICK_FOLDER_CHANNEL, options),
  confirm: (message) => ipcRenderer.invoke(IpcChannels.CONFIRM_CHANNEL, message),
  setTheme: (theme) => ipcRenderer.invoke(IpcChannels.SET_THEME_CHANNEL, theme),
  showContextMenu: (items, position) =>
    ipcRenderer.invoke(IpcChannels.CONTEXT_MENU_CHANNEL, {
      items,
      ...(position === undefined ? {} : { position }),
    }),
  openExternal: (url: string) => ipcRenderer.invoke(IpcChannels.OPEN_EXTERNAL_CHANNEL, url),
  createCloudAuthRequest: () => ipcRenderer.invoke(IpcChannels.CREATE_CLOUD_AUTH_REQUEST_CHANNEL),
  getCloudAuthToken: () => ipcRenderer.invoke(IpcChannels.GET_CLOUD_AUTH_TOKEN_CHANNEL),
  setCloudAuthToken: (token: string) =>
    ipcRenderer.invoke(IpcChannels.SET_CLOUD_AUTH_TOKEN_CHANNEL, token),
  clearCloudAuthToken: () => ipcRenderer.invoke(IpcChannels.CLEAR_CLOUD_AUTH_TOKEN_CHANNEL),
  fetchCloudAuth: (input) => ipcRenderer.invoke(IpcChannels.FETCH_CLOUD_AUTH_CHANNEL, input),
  trelloGetSnapshot: () => ipcRenderer.invoke(IpcChannels.TRELLO_GET_SNAPSHOT_CHANNEL),
  trelloUpdateSettings: (input) =>
    ipcRenderer.invoke(IpcChannels.TRELLO_UPDATE_SETTINGS_CHANNEL, input),
  trelloListBoards: () => ipcRenderer.invoke(IpcChannels.TRELLO_LIST_BOARDS_CHANNEL),
  trelloSelectBoard: (input) => ipcRenderer.invoke(IpcChannels.TRELLO_SELECT_BOARD_CHANNEL, input),
  trelloTestConnection: () => ipcRenderer.invoke(IpcChannels.TRELLO_TEST_CONNECTION_CHANNEL),
  trelloSyncBoard: (input) => ipcRenderer.invoke(IpcChannels.TRELLO_SYNC_BOARD_CHANNEL, input),
  trelloAddToStack: (input) => ipcRenderer.invoke(IpcChannels.TRELLO_ADD_TO_STACK_CHANNEL, input),
  trelloRemoveFromStack: (input) =>
    ipcRenderer.invoke(IpcChannels.TRELLO_REMOVE_FROM_STACK_CHANNEL, input),
  trelloUpdateStackItem: (input) =>
    ipcRenderer.invoke(IpcChannels.TRELLO_UPDATE_STACK_ITEM_CHANNEL, input),
  trelloMoveToQueue: (input) => ipcRenderer.invoke(IpcChannels.TRELLO_MOVE_TO_QUEUE_CHANNEL, input),
  trelloReorderStack: (input) =>
    ipcRenderer.invoke(IpcChannels.TRELLO_REORDER_STACK_CHANNEL, input),
  trelloBulkMoveReadyToQueue: () =>
    ipcRenderer.invoke(IpcChannels.TRELLO_BULK_MOVE_READY_TO_QUEUE_CHANNEL),
  trelloStartQueue: (input) => ipcRenderer.invoke(IpcChannels.TRELLO_START_QUEUE_CHANNEL, input),
  trelloStopQueue: (input) => ipcRenderer.invoke(IpcChannels.TRELLO_STOP_QUEUE_CHANNEL, input),
  trelloPauseQueue: (input) => ipcRenderer.invoke(IpcChannels.TRELLO_PAUSE_QUEUE_CHANNEL, input),
  trelloRetryJob: (input) => ipcRenderer.invoke(IpcChannels.TRELLO_RETRY_JOB_CHANNEL, input),
  trelloRemoveJob: (input) => ipcRenderer.invoke(IpcChannels.TRELLO_REMOVE_JOB_CHANNEL, input),
  trelloCleanupJob: (input) => ipcRenderer.invoke(IpcChannels.TRELLO_CLEANUP_JOB_CHANNEL, input),
  onCloudAuthCallback: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, rawUrl: unknown) => {
      if (typeof rawUrl !== "string") return;
      listener(rawUrl);
    };

    ipcRenderer.on(IpcChannels.CLOUD_AUTH_CALLBACK_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.CLOUD_AUTH_CALLBACK_CHANNEL, wrappedListener);
    };
  },
  onMenuAction: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, action: unknown) => {
      if (typeof action !== "string") return;
      listener(action);
    };

    ipcRenderer.on(IpcChannels.MENU_ACTION_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.MENU_ACTION_CHANNEL, wrappedListener);
    };
  },
  getUpdateState: () => ipcRenderer.invoke(IpcChannels.UPDATE_GET_STATE_CHANNEL),
  setUpdateChannel: (channel) =>
    ipcRenderer.invoke(IpcChannels.UPDATE_SET_CHANNEL_CHANNEL, channel),
  checkForUpdate: () => ipcRenderer.invoke(IpcChannels.UPDATE_CHECK_CHANNEL),
  downloadUpdate: () => ipcRenderer.invoke(IpcChannels.UPDATE_DOWNLOAD_CHANNEL),
  installUpdate: () => ipcRenderer.invoke(IpcChannels.UPDATE_INSTALL_CHANNEL),
  onUpdateState: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, state: unknown) => {
      if (typeof state !== "object" || state === null) return;
      listener(state as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(IpcChannels.UPDATE_STATE_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.UPDATE_STATE_CHANNEL, wrappedListener);
    };
  },
} satisfies DesktopBridge);
