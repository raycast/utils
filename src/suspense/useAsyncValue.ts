import assert from "assert/strict";
import { FunctionReturningPromise, PromiseType } from "../types";

interface PromiseCache {
  promise?: Promise<void>;
  args: Array<any>;
  error?: any;
  response?: any;
}

const promiseCaches: PromiseCache[] = [];

export function useAsyncValue<T extends FunctionReturningPromise>(
  fn: T,
  args: Parameters<T>,
  lifespan = 0
): PromiseType<ReturnType<T>> {
  for (const promiseCache of promiseCaches) {
    let found: boolean;
    try {
      assert.deepStrictEqual(args, promiseCache.args);
      found = true;
    } catch (err) {
      found = false;
    }
    if (found) {
      if (Object.prototype.hasOwnProperty.call(promiseCache, "error")) {
        // If an error occurred,
        throw promiseCache.error;
      }

      // If a response was successful,
      if (Object.prototype.hasOwnProperty.call(promiseCache, "response")) {
        return promiseCache.response;
      }
      throw promiseCache.promise;
    }
  }

  // The request is new or has changed.
  const promiseCache: PromiseCache = {
    promise:
      // Make the promise request.
      fn(...args)
        .then((response: any) => {
          promiseCache.response = response;
        })
        .catch((e: any) => {
          promiseCache.error = e;
        })
        .then(() => {
          if (lifespan > 0) {
            setTimeout(() => {
              const index = promiseCaches.indexOf(promiseCache);
              if (index !== -1) {
                promiseCaches.splice(index, 1);
              }
            }, lifespan);
          }
        }),
    args,
  };
  promiseCaches.push(promiseCache);
  throw promiseCache.promise;
}
