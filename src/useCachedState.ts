import {
  useCallback,
  Dispatch,
  SetStateAction,
  useSyncExternalStore,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Cache } from "@raycast/api";
import { useLatest } from "./useLatest";
import { replacer, reviver } from "./helpers";

const rootCache = /* #__PURE__ */ Symbol("cache without namespace");
const cacheMap = /* #__PURE__ */ new Map<string | symbol, Cache>();
const noOptimisticValue = /* #__PURE__ */ Symbol("no optimistic value");

type OptimisticState<T> = { key: string; value: T } | typeof noOptimisticValue;
type PendingWrite<T> = { cache: Cache; key: string; serializedValue: string; value: T; debounce: number };

function serializeCachedValue(value: unknown) {
  if (typeof value === "undefined") {
    return "undefined";
  }

  const serializedValue = JSON.stringify(value, replacer);
  if (typeof serializedValue === "undefined") {
    throw new Error("Cached state values must be JSON serializable");
  }
  return serializedValue;
}

function deserializeCachedValue<T>(serializedValue: string | undefined, fallback: T): T {
  if (typeof serializedValue === "undefined") {
    return fallback;
  }
  if (serializedValue === "undefined") {
    return undefined as T;
  }
  try {
    return JSON.parse(serializedValue, reviver);
  } catch (error) {
    console.warn("The cached data is corrupted", error);
    return fallback;
  }
}

/**
 * Returns a stateful value, and a function to update it. The value will be kept between command runs.
 *
 * @remark The value needs to be JSON serializable.
 *
 * @param key - The unique identifier of the state. This can be used to share the state across components and/or commands.
 * @param initialState - The initial value of the state if there aren't any in the Cache yet.
 * @param config - Optional configuration.
 * @param config.cacheNamespace - The namespace of the cache. This can be used to share the state across components and/or commands.
 * @param config.cacheWriteDebounce - The debounce time in milliseconds for writing to the cache.
 */
export function useCachedState<T>(
  key: string,
  initialState: T,
  config?: { cacheNamespace?: string; cacheWriteDebounce?: number },
): [T, Dispatch<SetStateAction<T>>];
export function useCachedState<T = undefined>(key: string): [T | undefined, Dispatch<SetStateAction<T | undefined>>];
export function useCachedState<T>(
  key: string,
  initialState?: T,
  config?: { cacheNamespace?: string; cacheWriteDebounce?: number },
): [T, Dispatch<SetStateAction<T>>] {
  const cacheKey = config?.cacheNamespace || rootCache;
  const cache =
    cacheMap.get(cacheKey) || cacheMap.set(cacheKey, new Cache({ namespace: config?.cacheNamespace })).get(cacheKey);

  if (!cache) {
    throw new Error("Missing cache");
  }

  const keyRef = useLatest(key);
  const initialValueRef = useLatest(initialState);
  const [optimisticState, setOptimisticState] = useState<OptimisticState<T>>(noOptimisticValue);
  const pendingWriteRef = useRef<PendingWrite<T> | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const flushPendingWrite = useCallback((resetOptimisticState = true) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const pendingWrite = pendingWriteRef.current;
    pendingWriteRef.current = null;
    if (pendingWrite) {
      pendingWrite.cache.set(pendingWrite.key, pendingWrite.serializedValue);
    }
    if (resetOptimisticState) {
      setOptimisticState(noOptimisticValue);
    }
  }, []);

  useEffect(() => {
    const pendingWrite = pendingWriteRef.current;
    if (
      pendingWrite &&
      (pendingWrite.cache !== cache || pendingWrite.key !== key || pendingWrite.debounce !== config?.cacheWriteDebounce)
    ) {
      flushPendingWrite();
    }
    setOptimisticState((state) => (state !== noOptimisticValue && state.key !== key ? noOptimisticValue : state));
  }, [cache, config?.cacheWriteDebounce, flushPendingWrite, key]);

  useEffect(() => {
    return () => flushPendingWrite(false);
  }, [flushPendingWrite]);

  const cachedState = useSyncExternalStore(cache.subscribe, () => {
    try {
      return cache.get(keyRef.current);
    } catch (error) {
      console.error("Could not get Cache data:", error);
      return undefined;
    }
  });

  const state = useMemo<T>(() => {
    if (optimisticState !== noOptimisticValue && optimisticState.key === key) {
      return optimisticState.value;
    }
    return deserializeCachedValue(cachedState, initialValueRef.current as T);
  }, [cachedState, initialValueRef, key, optimisticState]);

  const setStateAndCache = useCallback(
    (updater: SetStateAction<T>) => {
      // Capture the key from the render that created this setter. This is important for
      // asynchronous updates (for example mutation rollbacks) that finish after the key changes.
      const currentKey = key;
      const pendingWrite = pendingWriteRef.current;
      let currentValue: T;
      if (pendingWrite && pendingWrite.cache === cache && pendingWrite.key === currentKey) {
        currentValue = pendingWrite.value;
      } else {
        try {
          currentValue = deserializeCachedValue(cache.get(currentKey), initialState as T);
        } catch (error) {
          console.error("Could not get Cache data:", error);
          currentValue = initialState as T;
        }
      }
      // @ts-expect-error TS struggles to infer the types as T could potentially be a function
      const newValue = typeof updater === "function" ? updater(currentValue) : updater;
      const serializedValue = serializeCachedValue(newValue);

      if (pendingWrite && (pendingWrite.cache !== cache || pendingWrite.key !== currentKey)) {
        flushPendingWrite(false);
      } else if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        pendingWriteRef.current = null;
      }

      const debounce = config?.cacheWriteDebounce;
      if (typeof debounce === "undefined" || debounce === null || debounce < 0) {
        cache.set(currentKey, serializedValue);
        setOptimisticState(noOptimisticValue);
      } else {
        const newPendingWrite = { cache, key: currentKey, serializedValue, value: newValue, debounce };
        pendingWriteRef.current = newPendingWrite;
        setOptimisticState({ key: currentKey, value: newValue });
        timeoutRef.current = setTimeout(() => {
          if (pendingWriteRef.current !== newPendingWrite) {
            return;
          }
          pendingWriteRef.current = null;
          timeoutRef.current = null;
          cache.set(newPendingWrite.key, newPendingWrite.serializedValue);
          setOptimisticState((state) =>
            state !== noOptimisticValue && state.key === newPendingWrite.key ? noOptimisticValue : state,
          );
        }, debounce);
      }

      return newValue;
    },
    [cache, config?.cacheWriteDebounce, flushPendingWrite, initialState, key],
  );

  return [state, setStateAndCache];
}
