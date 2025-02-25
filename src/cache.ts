import { Cache } from "@raycast/api";
import { hash, replacer, reviver } from "./helpers";

/**
 * Wraps a function with caching functionality using Raycast's Cache API.
 * Allows for caching of expensive functions like paginated API calls.
 *
 * @param fn - The async function to cache results from
 * @param options - Optional configuration for the cache behavior
 * @param options.key - Custom cache key (defaults to stringified function)
 * @param options.validate - Optional validation function for cached data
 * @param options.maxAge - Maximum age of cached data in milliseconds
 * @param options.namespace - Optional namespace for the cache
 * @returns The result of the function, either from cache or fresh execution
 *
 * @example
 * ```ts
 * const data = await withCache(
 *   async () => fetchExpensiveData(),
 *   { maxAge: 5 * 60 * 1000 } // Cache for 5 minutes
 * );
 * ```
 */
export async function withCache<T>(
  fn: () => Promise<T>,
  options?: { key?: string; validate?: (data: T) => boolean; maxAge?: number; namespace?: string },
): Promise<T> {
  const cache = new Cache({ namespace: options?.namespace });

  const key = options?.key ?? hash(fn);
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
}
