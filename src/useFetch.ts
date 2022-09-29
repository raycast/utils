import { useCallback, useRef } from "react";
import mediaTyper from "media-typer";
import contentType from "content-type";
import { useDeepMemo } from "./useDeepMemo";
import { useCachedPromise, CachedPromiseOptions } from "./useCachedPromise";
import { useLatest } from "./useLatest";
import { UseCachedPromiseReturnType } from "./types";

const { emitWarning } = process;

// to remove when we switch to Node 18
process.emitWarning = (warning, ...args) => {
  if (args[0] === "ExperimentalWarning") {
    return;
  }

  if (args[0] && typeof args[0] === "object" && args[0].type === "ExperimentalWarning") {
    return;
  }

  // @ts-expect-error too many different types but it's ok since we pass what was passed
  return emitWarning(warning, ...args);
};

import { fetch } from "cross-fetch";

function isJSON(contentTypeHeader: string | null | undefined): boolean {
  if (contentTypeHeader) {
    const ct = contentType.parse(contentTypeHeader);

    const mediaType = mediaTyper.parse(ct.type);

    if (mediaType.subtype === "json") {
      return true;
    }

    if (mediaType.suffix === "json") {
      return true;
    }

    if (mediaType.suffix && /\bjson\b/i.test(mediaType.suffix)) {
      return true;
    }

    if (mediaType.subtype && /\bjson\b/i.test(mediaType.subtype)) {
      return true;
    }
  }
  return false;
}

async function defaultParsing(response: Response) {
  if (!response.ok) {
    throw new Error(response.statusText);
  }

  const contentTypeHeader = response.headers.get("content-type");

  if (contentTypeHeader && isJSON(contentTypeHeader)) {
    return await response.json();
  }
  return await response.text();
}

/**
 * Fetch the URL and returns the {@link AsyncState} corresponding to the execution of the fetch. The last value will be kept between command runs.
 *
 * @example
 * ```
 * import { useFetch } from '@raycast/utils';
 *
 * const Demo = () => {
 *   const { isLoading, data, revalidate } = useFetch('https://api.example');
 *
 *   return (
 *     <Detail
 *       isLoading={isLoading}
 *       markdown={data}
 *       actions={
 *         <ActionPanel>
 *           <Action title="Reload" onAction={() => revalidate()} />
 *         </ActionPanel>
 *       }
 *     />
 *   );
 * };
 * ```
 */
export function useFetch<T = unknown, U = undefined>(
  url: RequestInfo,
  options?: RequestInit & { parseResponse?: (response: Response) => Promise<T> } & Omit<
      CachedPromiseOptions<(url: RequestInfo, options?: RequestInit) => Promise<T>, U>,
      "abortable"
    >
): UseCachedPromiseReturnType<T, U> {
  const { parseResponse, initialData, execute, keepPreviousData, onError, onData, onWillExecute, ...fetchOptions } =
    options || {};

  const useCachedPromiseOptions: CachedPromiseOptions<(url: RequestInfo, options?: RequestInit) => Promise<T>, U> = {
    initialData,
    execute,
    keepPreviousData,
    onError,
    onData,
    onWillExecute,
  };

  const parseResponseRef = useLatest(parseResponse || defaultParsing);
  const abortable = useRef<AbortController>();

  const fn = useCallback(
    async (url: RequestInfo, options?: RequestInit) => {
      const res = await fetch(url, { signal: abortable.current?.signal, ...options });
      return (await parseResponseRef.current(res)) as T;
    },
    [parseResponseRef]
  );

  const args = useDeepMemo<Parameters<typeof fetch>>([url, fetchOptions]) as [
    input: RequestInfo,
    init: RequestInit | undefined
  ];

  return useCachedPromise(fn, args, { ...useCachedPromiseOptions, abortable });
}
