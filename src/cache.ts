import { Cache } from "@raycast/api";
import { hash, replacer, reviver } from "./helpers";

/**
 * Wraps a function with caching functionality using Raycast's Cache API.
 * Allows for caching of expensive functions like paginated API calls that rarely change.
 *
 * @param fn - The async function to cache results from
 * @param options - Optional configuration for the cache behavior
 * @param options.validate - Optional validation function for cached data
 * @param options.maxAge - Maximum age of cached data in milliseconds
 * @returns An async function that returns the result of the function, either from cache or fresh execution
 *
 * @example
 * ```ts
 * const cachedFunction = withCache(fetchExpensiveData, {
 *   maxAge: 5 * 60 * 1000 // Cache for 5 minutes
 * });
 *
 * const result = await cachedFunction(query);
 * ```
 */
export function withCache<Fn extends (...args: any) => Promise<any>>(
  fn: Fn,
  options?: {
    /** function that receives the cached data and returns a boolean depending on whether the data is still valid or not. */
    validate?: (data: Awaited<ReturnType<Fn>>) => boolean;
    /** Maximum age of cached data in milliseconds after which the data will be considered invalid */
    maxAge?: number;
  },
): Fn & { clearCache: () => void } {
  const cache = new Cache({ namespace: hash(fn) });

  const wrappedFn = async (...args: Parameters<Fn>) => {
    const key =
      hash(args || []) + (options as unknown as { internal_cacheKeySuffix?: string })?.internal_cacheKeySuffix;
    const cached = cache.get(key);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached, reviver);
      const isExpired = options?.maxAge && Date.now() - timestamp > options.maxAge;
      if (!isExpired && (!options?.validate || options.validate(data))) {
        return data;
      }
    }

    const result = await fn();
    cache.set(
      key,
      JSON.stringify(
        {
          data: result,
          timestamp: Date.now(),
        },
        replacer,
      ),
    );
    return result;
  };

  wrappedFn.clearCache = () => {
    cache.clear();
  };

  // @ts-expect-error too complex for TS
  return wrappedFn;
}
