export type PromiseType<P extends Promise<any>> = P extends Promise<infer T> ? T : never;

export type FunctionReturningPromise<T extends any[] = any[]> = (...args: T) => Promise<any>;

export type AsyncState<T> =
  | {
      isLoading: boolean;
      error?: undefined;
      data?: undefined;
    }
  | {
      isLoading: true;
      error?: Error | undefined;
      data?: T;
    }
  | {
      isLoading: false;
      error: Error;
      data?: undefined;
    }
  | {
      isLoading: false;
      error?: undefined;
      data: T;
    };

export type AsyncStateFromFunctionReturningPromise<T extends FunctionReturningPromise> = AsyncState<
  PromiseType<ReturnType<T>>
>;

/**
 * Function to wrap an asynchronous update and gives some control about how the
 * hook's data should be updated while the update is going through.
 *
 * By default, the data will be revalidated (eg. the function will be called again)
 * after the update is done.
 *
 * **Optimistic Update**
 *
 * In an optimistic update, the UI behaves as though a change was successfully
 * completed before receiving confirmation from the server that it actually was -
 * it is being optimistic that it will eventually get the confirmation rather than an error.
 * This allows for a more responsive user experience.
 *
 * You can specify an `optimisticUpdate` function to mutate the data in order to reflect
 * the change introduced by the asynchronous update.
 *
 * When doing so, you can specify a `rollbackOnError` function to mutate back the
 * data if the asynchronous update fails. If not specified, the data will be automatically
 * rolled back to its previous value (before the optimistic update).
 */
export type MutatePromise<T> = (
  asyncUpdate?: Promise<any>,
  options?: {
    optimisticUpdate?: (data: T) => T;
    rollbackOnError?: boolean | ((data: T) => T);
    shouldRevalidateAfter?: boolean;
  }
) => Promise<any>;
