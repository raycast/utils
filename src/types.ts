export type PromiseType<P extends Promise<any>> = P extends Promise<infer T> ? T : never;

export type FunctionReturningPromise<T extends any[] = any[]> = (...args: T) => Promise<any>;
