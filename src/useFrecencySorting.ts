import { useMemo, useCallback } from "react";
import { useLatest } from "./useLatest";
import { useCachedState } from "./useCachedState";

// The algorithm below is based on Mozilla's exponential-decay frecency proposal:
// https://wiki.mozilla.org/User:Jesse/NewFrecency

type LegacyFrecency = {
  lastVisited: number;
  frecency: number;
};

type StoredFrecency = number | LegacyFrecency;

const HALF_LIFE_DAYS = 10;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HALF_LIFE_MS = HALF_LIFE_DAYS * MS_PER_DAY;

const VISIT_TYPE_POINTS = {
  Default: 100,
  Embed: 0,
  Bookmark: 140,
};

// Store the timestamp at which the decaying score reaches 1. Later timestamps
// mean higher scores, so ranking only requires comparing the stored numbers.
function getNewFrecency(rankTimestamp?: number): number {
  const now = Date.now();
  const currentScore = rankTimestamp === undefined ? 0 : 2 ** ((rankTimestamp - now) / HALF_LIFE_MS);
  return now + HALF_LIFE_MS * Math.log2(currentScore + VISIT_TYPE_POINTS.Default);
}

function normalizeFrecencies(
  storedFrecencies: Record<string, StoredFrecency | undefined>,
): Record<string, number | undefined> {
  return Object.fromEntries(
    Object.entries(storedFrecencies).map(([key, value]) => [
      key,
      typeof value === "number" || value === undefined
        ? value
        : value.lastVisited + HALF_LIFE_MS * Math.log2(value.frecency),
    ]),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const defaultKey = (item: any): string => {
  if (
    process.env.NODE_ENV !== "production" &&
    (typeof item !== "object" || !item || !("id" in item) || typeof item.id != "string")
  ) {
    throw new Error("Specify a key function or make sure your items have an 'id' property");
  }
  return item.id;
};

/**
 * Sort an array by its frecency and provide methods to update the frecency of its items.
 * Frecency is a measure that combines frequency and recency. The more often an item is visited/used, and the more recently an item is visited/used, the higher it will rank.
 *
 * @example
 * ```
 * import { List, ActionPanel, Action, Icon } from "@raycast/api";
 * import { useFetch, useFrecencySorting } from "@raycast/utils";
 *
 * export default function Command() {
 *   const { isLoading, data } = useFetch("https://api.example");
 *   const { data: sortedData, visitItem, resetRanking } = useFrecencySorting(data);
 *
 *   return (
 *     <List isLoading={isLoading}>
 *       {sortedData.map((item) => (
 *         <List.Item
 *           key={item.id}
 *           title={item.title}
 *           actions={
 *             <ActionPanel>
 *               <Action.OpenInBrowser url={item.url} onOpen={() => visitItem(item)} />
 *               <Action.CopyToClipboard title="Copy Link" content={item.url} onCopy={() => visitItem(item)} />
 *               <Action title="Reset Ranking" icon={Icon.ArrowCounterClockwise} onAction={() => resetRanking(item)} />
 *             </ActionPanel>
 *           }
 *         />
 *       ))}
 *     </List>
 *   );
 * };
 * ```
 */
export function useFrecencySorting<T extends { id: string }>(
  data?: T[],
  options?: { namespace?: string; key?: (item: T) => string; sortUnvisited?: (a: T, b: T) => number },
): {
  data: T[];
  visitItem: (item: T) => Promise<void>;
  resetRanking: (item: T) => Promise<void>;
};
export function useFrecencySorting<T>(
  data: T[] | undefined,
  options: { namespace?: string; key: (item: T) => string; sortUnvisited?: (a: T, b: T) => number },
): {
  data: T[];
  visitItem: (item: T) => Promise<void>;
  resetRanking: (item: T) => Promise<void>;
};
export function useFrecencySorting<T>(
  data?: T[],
  options?: { namespace?: string; key?: (item: T) => string; sortUnvisited?: (a: T, b: T) => number },
): {
  data: T[];
  visitItem: (item: T) => Promise<void>;
  resetRanking: (item: T) => Promise<void>;
} {
  const keyRef = useLatest(options?.key || defaultKey);
  const sortUnvisitedRef = useLatest(options?.sortUnvisited);

  const [storedFrecencies, setStoredFrecencies] = useCachedState<Record<string, StoredFrecency | undefined>>(
    `raycast_frecency_${options?.namespace}`,
    {},
  );

  // Read legacy entries without writing on mount. The next visit or reset persists
  // the normalized map using the latest cached state inside the updater.
  const frecencies = useMemo(() => normalizeFrecencies(storedFrecencies), [storedFrecencies]);

  const visitItem = useCallback(
    async function updateFrecency(item: T) {
      const itemKey = keyRef.current(item);

      setStoredFrecencies((storedFrecencies) => {
        const frecencies = normalizeFrecencies(storedFrecencies);
        frecencies[itemKey] = getNewFrecency(frecencies[itemKey]);

        return frecencies;
      });
    },
    [keyRef, setStoredFrecencies],
  );

  const resetRanking = useCallback(
    async function removeFrecency(item: T) {
      const itemKey = keyRef.current(item);

      setStoredFrecencies((storedFrecencies) => {
        const frecencies = normalizeFrecencies(storedFrecencies);
        delete frecencies[itemKey];

        return frecencies;
      });
    },
    [keyRef, setStoredFrecencies],
  );

  const sortedData = useMemo(() => {
    if (!data) {
      return [];
    }

    return [...data].sort((a, b) => {
      const frecencyA = frecencies[keyRef.current(a)];
      const frecencyB = frecencies[keyRef.current(b)];

      // If a has a frecency, but b doesn't, a should come first
      if (frecencyA !== undefined && frecencyB === undefined) {
        return -1;
      }

      // If b has a frecency, but a doesn't, b should come first
      if (frecencyA === undefined && frecencyB !== undefined) {
        return 1;
      }

      // If both frecencies are defined, put the one with the higher frecency first
      if (frecencyA !== undefined && frecencyB !== undefined) {
        return frecencyB - frecencyA;
      }

      // If both frecencies are undefined, keep the original order
      return sortUnvisitedRef.current ? sortUnvisitedRef.current(a, b) : 0;
    });
  }, [frecencies, data, keyRef, sortUnvisitedRef]);

  return { data: sortedData, visitItem, resetRanking };
}
