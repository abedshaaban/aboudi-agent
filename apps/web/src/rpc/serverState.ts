import { useAtomSubscribe, useAtomValue } from "@effect/atom-react";
import {
  DEFAULT_SERVER_SETTINGS,
  type EditorId,
  type ServerConfig,
  type ServerConfigStreamEvent,
  type ServerConfigUpdatedPayload,
  type ServerLifecycleWelcomePayload,
  type ServerProvider,
  type ServerProviderUpdatedPayload,
  type ServerSettings,
} from "@t3tools/contracts";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { Atom } from "effect/unstable/reactivity";
import { useCallback, useRef } from "react";

import type { WsRpcClient } from "@t3tools/client-runtime";
import { appAtomRegistry, resetAppAtomRegistryForTests } from "./atomRegistry";

export type ServerConfigUpdateSource = ServerConfigStreamEvent["type"];

export interface ServerConfigUpdatedNotification {
  readonly id: number;
  readonly payload: ServerConfigUpdatedPayload;
  readonly source: ServerConfigUpdateSource;
}

type ServerStateClient = Pick<
  WsRpcClient["server"],
  "getConfig" | "subscribeConfig" | "subscribeLifecycle"
>;

export const SERVER_STATE_BACKGROUND_SYNC_INTERVAL_MS = 60_000;

export interface ServerStateSyncStatus {
  readonly isRefreshing: boolean;
  readonly lastSyncedAt: number | null;
  readonly lastErrorAt: number | null;
}

function makeStateAtom<A>(label: string, initialValue: A) {
  return Atom.make(initialValue).pipe(Atom.keepAlive, Atom.withLabel(label));
}

function toServerConfigUpdatedPayload(config: ServerConfig): ServerConfigUpdatedPayload {
  return {
    issues: config.issues,
    providers: config.providers,
    settings: config.settings,
  };
}

const EMPTY_AVAILABLE_EDITORS: ReadonlyArray<EditorId> = [];
const EMPTY_SERVER_PROVIDERS: ReadonlyArray<ServerProvider> = [];

const selectAvailableEditors = (config: ServerConfig | null): ReadonlyArray<EditorId> =>
  config?.availableEditors ?? EMPTY_AVAILABLE_EDITORS;
const selectKeybindings = (config: ServerConfig | null) =>
  config?.keybindings ?? DEFAULT_RESOLVED_KEYBINDINGS;
const selectKeybindingsConfigPath = (config: ServerConfig | null) =>
  config?.keybindingsConfigPath ?? null;
const selectObservability = (config: ServerConfig | null) => config?.observability ?? null;
const selectProviders = (config: ServerConfig | null) =>
  config?.providers ?? EMPTY_SERVER_PROVIDERS;
const selectSettings = (config: ServerConfig | null): ServerSettings =>
  config?.settings ?? DEFAULT_SERVER_SETTINGS;

export const welcomeAtom = makeStateAtom<ServerLifecycleWelcomePayload | null>(
  "server-welcome",
  null,
);
export const serverConfigAtom = makeStateAtom<ServerConfig | null>("server-config", null);
export const serverConfigUpdatedAtom = makeStateAtom<ServerConfigUpdatedNotification | null>(
  "server-config-updated",
  null,
);
export const providersUpdatedAtom = makeStateAtom<ServerProviderUpdatedPayload | null>(
  "server-providers-updated",
  null,
);
export const serverStateSyncStatusAtom = makeStateAtom<ServerStateSyncStatus>(
  "server-state-sync-status",
  {
    isRefreshing: false,
    lastSyncedAt: null,
    lastErrorAt: null,
  },
);

export function getServerConfig(): ServerConfig | null {
  return appAtomRegistry.get(serverConfigAtom);
}

export function getServerKeybindings(): ServerConfig["keybindings"] {
  return selectKeybindings(getServerConfig());
}

export function getServerConfigUpdatedNotification(): ServerConfigUpdatedNotification | null {
  return appAtomRegistry.get(serverConfigUpdatedAtom);
}

export function setServerConfigSnapshot(config: ServerConfig): void {
  resolveServerConfig(config);
  emitProvidersUpdated({ providers: config.providers });
  emitServerConfigUpdated(toServerConfigUpdatedPayload(config), "snapshot");
}

export function getServerStateSyncStatus(): ServerStateSyncStatus {
  return appAtomRegistry.get(serverStateSyncStatusAtom);
}

export function applyServerConfigEvent(event: ServerConfigStreamEvent): void {
  switch (event.type) {
    case "snapshot": {
      setServerConfigSnapshot(event.config);
      return;
    }
    case "keybindingsUpdated": {
      const latestServerConfig = getServerConfig();
      if (!latestServerConfig) {
        return;
      }
      const nextConfig = {
        ...latestServerConfig,
        keybindings: event.payload.keybindings,
        issues: event.payload.issues,
      } satisfies ServerConfig;
      resolveServerConfig(nextConfig);
      emitServerConfigUpdated(toServerConfigUpdatedPayload(nextConfig), event.type);
      return;
    }
    case "providerStatuses": {
      applyProvidersUpdated(event.payload);
      return;
    }
    case "settingsUpdated": {
      applySettingsUpdated(event.payload.settings);
      return;
    }
  }
}

export function applyProvidersUpdated(payload: ServerProviderUpdatedPayload): void {
  const latestServerConfig = getServerConfig();
  emitProvidersUpdated(payload);

  if (!latestServerConfig) {
    return;
  }

  const nextConfig = {
    ...latestServerConfig,
    providers: payload.providers,
  } satisfies ServerConfig;
  resolveServerConfig(nextConfig);
  emitServerConfigUpdated(toServerConfigUpdatedPayload(nextConfig), "providerStatuses");
}

export function applySettingsUpdated(settings: ServerSettings): void {
  const latestServerConfig = getServerConfig();
  if (!latestServerConfig) {
    return;
  }

  const nextConfig = {
    ...latestServerConfig,
    settings,
  } satisfies ServerConfig;
  resolveServerConfig(nextConfig);
  emitServerConfigUpdated(toServerConfigUpdatedPayload(nextConfig), "settingsUpdated");
}

export function emitWelcome(payload: ServerLifecycleWelcomePayload): void {
  appAtomRegistry.set(welcomeAtom, payload);
}

export function onWelcome(listener: (payload: ServerLifecycleWelcomePayload) => void): () => void {
  return subscribeLatest(welcomeAtom, listener);
}

export function onServerConfigUpdated(
  listener: (payload: ServerConfigUpdatedPayload, source: ServerConfigUpdateSource) => void,
): () => void {
  return subscribeLatest(serverConfigUpdatedAtom, (notification) => {
    listener(notification.payload, notification.source);
  });
}

export function onProvidersUpdated(
  listener: (payload: ServerProviderUpdatedPayload) => void,
): () => void {
  return subscribeLatest(providersUpdatedAtom, listener);
}

export function startServerStateSync(client: ServerStateClient): () => void {
  let disposed = false;
  activeServerStateClient = client;
  const cleanups = [
    client.subscribeLifecycle((event) => {
      if (event.type === "welcome") {
        emitWelcome(event.payload);
      }
    }),
    client.subscribeConfig((event) => {
      applyServerConfigEvent(event);
    }),
  ];

  if (getServerConfig() === null) {
    void refreshServerState(client, {
      applyIfConfigExists: false,
      shouldApply: () => !disposed,
      trackStatus: false,
    }).catch(() => undefined);
  }

  const syncTimer = globalThis.setInterval(() => {
    if (disposed || isDocumentHidden()) {
      return;
    }

    void refreshServerState(client, { shouldApply: () => !disposed }).catch(() => undefined);
  }, SERVER_STATE_BACKGROUND_SYNC_INTERVAL_MS);

  return () => {
    disposed = true;
    globalThis.clearInterval(syncTimer);
    if (activeServerStateClient === client) {
      activeServerStateClient = null;
    }
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}

export function resetServerStateForTests() {
  resetAppAtomRegistryForTests();
  nextServerConfigUpdatedNotificationId = 1;
  activeServerStateClient = null;
  activeServerStateRefresh = null;
}

let nextServerConfigUpdatedNotificationId = 1;
let activeServerStateClient: ServerStateClient | null = null;
let activeServerStateRefresh: Promise<ServerConfig | null> | null = null;

export function refreshServerState(
  client: ServerStateClient | null = activeServerStateClient,
  options: {
    readonly applyIfConfigExists?: boolean;
    readonly shouldApply?: () => boolean;
    readonly trackStatus?: boolean;
  } = {},
): Promise<ServerConfig | null> {
  if (!client) {
    return Promise.resolve(null);
  }

  if (activeServerStateRefresh) {
    if (options.trackStatus ?? true) {
      updateServerStateSyncStatus({ isRefreshing: true });
    }
    return activeServerStateRefresh;
  }

  const applyIfConfigExists = options.applyIfConfigExists ?? true;
  const shouldApply = options.shouldApply ?? (() => true);
  const trackStatus = options.trackStatus ?? true;
  if (trackStatus) {
    updateServerStateSyncStatus({ isRefreshing: true });
  }

  activeServerStateRefresh = client
    .getConfig()
    .then((config) => {
      if (shouldApply() && (applyIfConfigExists || getServerConfig() === null)) {
        setServerConfigSnapshot(config);
      }
      updateServerStateSyncStatus({
        isRefreshing: false,
        lastSyncedAt: Date.now(),
        lastErrorAt: null,
      });
      return config;
    })
    .catch((error: unknown) => {
      updateServerStateSyncStatus({
        isRefreshing: false,
        lastErrorAt: Date.now(),
      });
      throw error;
    })
    .finally(() => {
      activeServerStateRefresh = null;
    });

  return activeServerStateRefresh;
}

function resolveServerConfig(config: ServerConfig): void {
  appAtomRegistry.set(serverConfigAtom, config);
}

function emitProvidersUpdated(payload: ServerProviderUpdatedPayload): void {
  appAtomRegistry.set(providersUpdatedAtom, payload);
}

function emitServerConfigUpdated(
  payload: ServerConfigUpdatedPayload,
  source: ServerConfigUpdateSource,
): void {
  appAtomRegistry.set(serverConfigUpdatedAtom, {
    id: nextServerConfigUpdatedNotificationId++,
    payload,
    source,
  });
}

function updateServerStateSyncStatus(patch: Partial<ServerStateSyncStatus>): void {
  appAtomRegistry.set(serverStateSyncStatusAtom, {
    ...getServerStateSyncStatus(),
    ...patch,
  });
}

function isDocumentHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function subscribeLatest<A>(
  atom: Atom.Atom<A | null>,
  listener: (value: NonNullable<A>) => void,
): () => void {
  return appAtomRegistry.subscribe(
    atom,
    (value) => {
      if (value === null) {
        return;
      }
      listener(value as NonNullable<A>);
    },
    { immediate: true },
  );
}

function useLatestAtomSubscription<A>(
  atom: Atom.Atom<A | null>,
  listener: (value: NonNullable<A>) => void,
): void {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  const stableListener = useCallback((value: A | null) => {
    if (value === null) {
      return;
    }
    listenerRef.current(value as NonNullable<A>);
  }, []);

  useAtomSubscribe(atom, stableListener, { immediate: true });
}

export function useServerConfig(): ServerConfig | null {
  return useAtomValue(serverConfigAtom);
}

export function useServerSettings(): ServerSettings {
  return useAtomValue(serverConfigAtom, selectSettings);
}

export function useServerProviders(): ReadonlyArray<ServerProvider> {
  return useAtomValue(serverConfigAtom, selectProviders);
}

export function useServerKeybindings(): ServerConfig["keybindings"] {
  return useAtomValue(serverConfigAtom, selectKeybindings);
}

export function useServerAvailableEditors(): ReadonlyArray<EditorId> {
  return useAtomValue(serverConfigAtom, selectAvailableEditors);
}

export function useServerKeybindingsConfigPath(): string | null {
  return useAtomValue(serverConfigAtom, selectKeybindingsConfigPath);
}

export function useServerObservability(): ServerConfig["observability"] | null {
  return useAtomValue(serverConfigAtom, selectObservability);
}

export function useServerStateSyncStatus(): ServerStateSyncStatus {
  return useAtomValue(serverStateSyncStatusAtom);
}

export function useServerWelcomeSubscription(
  listener: (payload: ServerLifecycleWelcomePayload) => void,
): void {
  useLatestAtomSubscription(welcomeAtom, listener);
}

export function useServerConfigUpdatedSubscription(
  listener: (notification: ServerConfigUpdatedNotification) => void,
): void {
  useLatestAtomSubscription(serverConfigUpdatedAtom, listener);
}
