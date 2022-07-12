import { useCallback, useRef, useMemo } from "react";
import { fetch, RequestInfo, RequestInit, Response } from "undici";
import mediaTyper from "media-typer";
import contentType from "content-type";
import { useCachedPromise, CachedPromiseOptions } from "./useCachedPromise";
import { useLatest } from "./useLatest";

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

export function useFetch<T, U = undefined>(
  url: RequestInfo,
  options?: RequestInit & { parseResponse?: (response: Response) => Promise<T> } & Omit<
      CachedPromiseOptions<() => Promise<T>, U>,
      "abortable"
    >
) {
  const { parseResponse, initialData, execute, keepPreviousData, onError, ...fetchOptions } = options || {};

  const parseResponseRef = useLatest(parseResponse || defaultParsing);
  const abortable = useRef<AbortController>();

  const fn = useCallback(
    async (url: RequestInfo, options?: RequestInit) => {
      const res = await fetch(url, { signal: abortable.current?.signal, ...options });
      return (await parseResponseRef.current(res)) as T;
    },
    [parseResponseRef]
  );

  const args = useMemo<Parameters<typeof fetch>>(
    () => [url, fetchOptions],
    [url, ...Object.keys(fetchOptions), ...Object.values(fetchOptions)]
  );

  return useCachedPromise(fn, args, { initialData, abortable, execute, keepPreviousData, onError });
}
