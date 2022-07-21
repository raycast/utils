import { useRef, useMemo } from "react";
import { dequal } from "dequal/lite";

/**
 * @param value the value to be memoized (usually a dependency list)
 * @returns a memoized version of the value as long as it remains deeply equal
 */
export function useDeepMemo<T>(value: T) {
  const ref = useRef<T>(value);
  const signalRef = useRef<number>(0);

  if (!dequal(value, ref.current)) {
    ref.current = value;
    signalRef.current += 1;
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ref.current, [signalRef.current]);
}
