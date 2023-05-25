import { useRef } from "react";

/**
 * Returns the latest state.
 *
 * This is mostly useful to get access to the latest value of some props or state inside an asynchronous callback, instead of that value at the time the callback was created from.
 */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
