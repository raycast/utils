import { useCallback, Dispatch, SetStateAction, useSyncExternalStore, useMemo } from "react";
import { Cache } from "@raycast/api";
import { useLatest } from "./useLatest";

export function useCachedState<T>(
  key: string,
  initialValue: T,
  config?: { cacheNamespace?: string }
): [T, Dispatch<SetStateAction<T>>] {
  const cache = useMemo(() => new Cache({ namespace: config?.cacheNamespace }), [config?.cacheNamespace]);

  const keyRef = useLatest(key);
  const initialValueRef = useLatest(initialValue);

  const cachedState = useSyncExternalStore(cache.subscribe, () => {
    try {
      return cache.get(keyRef.current);
    } catch (error) {
      console.error("Could not get Cache data:", error);
      return undefined;
    }
  });

  const state = useMemo(() => {
    if (typeof cachedState !== "undefined") {
      return JSON.parse(cachedState);
    } else {
      return initialValueRef.current;
    }
  }, [cachedState, initialValueRef]);

  const stateRef = useLatest(state);

  const setStateAndCache = useCallback(
    (updater: SetStateAction<T>) => {
      // @ts-expect-error TS struggles to infer the types as T could potentially be a function
      const newValue = typeof updater === "function" ? updater(stateRef.current) : updater;
      cache.set(keyRef.current, JSON.stringify(newValue));
      return newValue;
    },
    [cache, keyRef, stateRef]
  );

  return [state, setStateAndCache];
}
