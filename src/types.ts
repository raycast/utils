export type PromiseType<P extends Promise<any>> = P extends Promise<infer T> ? T : never;

export type FunctionReturningPromise<T extends any[] = any[]> = (...args: T) => Promise<any>;

export type AsyncState<T> =
  | {
      isLoading: boolean;
      error?: undefined;
      value?: undefined;
    }
  | {
      isLoading: true;
      error?: Error | undefined;
      value?: T;
    }
  | {
      isLoading: false;
      error: Error;
      value?: undefined;
    }
  | {
      isLoading: false;
      error?: undefined;
      value: T;
    };

export type AsyncStateFromFunctionReturningPromise<T extends FunctionReturningPromise> = AsyncState<
  PromiseType<ReturnType<T>>
>;

export type AsyncFnReturn<T extends FunctionReturningPromise = FunctionReturningPromise> = [
  AsyncStateFromFunctionReturningPromise<T>,
  T
];
