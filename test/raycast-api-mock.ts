type Listener = () => void;

const stores = new Map<string, Map<string, string>>();
const listeners = new Map<string, Set<Listener>>();

export class Cache {
  private readonly namespace: string;

  constructor(options?: { namespace?: string }) {
    this.namespace = options?.namespace || "root";
  }

  get = (key: string) => stores.get(this.namespace)?.get(key);

  set = (key: string, value: string) => {
    let store = stores.get(this.namespace);
    if (!store) {
      store = new Map();
      stores.set(this.namespace, store);
    }
    store.set(key, value);
    listeners.get(this.namespace)?.forEach((listener) => listener());
  };

  subscribe = (listener: Listener) => {
    let namespaceListeners = listeners.get(this.namespace);
    if (!namespaceListeners) {
      namespaceListeners = new Set();
      listeners.set(this.namespace, namespaceListeners);
    }
    namespaceListeners.add(listener);
    return () => namespaceListeners.delete(listener);
  };
}

export function resetMockCache() {
  stores.clear();
  listeners.clear();
}

export function getMockCacheEntryCount() {
  return Array.from(stores.values()).reduce((count, store) => count + store.size, 0);
}

export const environment = {
  assetsPath: process.cwd(),
  commandMode: "view",
  isDevelopment: true,
  launchType: "background",
  supportPath: process.cwd(),
};

export const LaunchType = { Background: "background" };
export const Toast = { Style: { Failure: "failure" } };
export const Clipboard = { copy() {} };
export function open() {}
export async function showToast() {}

type PKCEClientOptions = {
  redirectMethod: string;
  providerName: string;
  providerIcon?: unknown;
  providerId?: string;
  description?: string;
};

class MockPKCEClient {
  options: PKCEClientOptions;

  constructor(options: PKCEClientOptions) {
    this.options = options;
  }
}

export const OAuth = {
  RedirectMethod: { Web: "web", App: "app", AppURI: "appURI" },
  PKCEClient: MockPKCEClient,
};

export const Color = { PrimaryText: "raycast-primary-text" };
