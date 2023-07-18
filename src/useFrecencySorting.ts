import { useMemo, useCallback } from "react";
import { useLatest } from "./useLatest";
import { useCachedState } from "./useCachedState";

// The algorithm below is inspired by the one used by Firefox:
// https://wiki.mozilla.org/User:Jesse/NewFrecency

type Frecency = {
  lastVisited: number;
  frecency: number;
};

const HALF_LIFE_DAYS = 10;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DECAY_RATE_CONSTANT = Math.log(2) / (HALF_LIFE_DAYS * MS_PER_DAY);

const VISIT_TYPE_POINTS = {
  Default: 100,
  Embed: 0,
  Bookmark: 140,
};

function getNewFrecency(item?: Frecency): Frecency {
  const now = Date.now();
  const lastVisited = item ? item.lastVisited : 0;
  const frecency = item ? item.frecency : 0;

  const visitAgeInDays = (now - lastVisited) / MS_PER_DAY;
  const currentVisitValue = VISIT_TYPE_POINTS.Default * Math.exp(-DECAY_RATE_CONSTANT * visitAgeInDays);
  const totalVisitValue = frecency + currentVisitValue;

  return {
    lastVisited: now,
    frecency: totalVisitValue,
  };
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
  options?: { namespace?: string; key?: (item: T) => string }
): {
  data: T[];
  visitItem: (item: T) => Promise<void>;
  resetRanking: (item: T) => Promise<void>;
};
export function useFrecencySorting<T>(
  data: T[] | undefined,
  options: { namespace?: string; key: (item: T) => string }
): {
  data: T[];
  visitItem: (item: T) => Promise<void>;
  resetRanking: (item: T) => Promise<void>;
};
export function useFrecencySorting<T>(
  data?: T[],
  options?: { namespace?: string; key?: (item: T) => string }
): {
  data: T[];
  visitItem: (item: T) => Promise<void>;
  resetRanking: (item: T) => Promise<void>;
} {
  const keyRef = useLatest(options?.key || defaultKey);

  const [storedFrecencies, setStoredFrecencies] = useCachedState<Record<string, Frecency | undefined>>(
    `raycast_frecency_${options?.namespace}`,
    {}
  );

  const visitItem = useCallback(
    async function updateFrecency(item: T) {
      const itemKey = keyRef.current(item);

      setStoredFrecencies((storedFrecencies) => {
        const frecency = storedFrecencies[itemKey];
        const newFrecency = getNewFrecency(frecency);

        return {
          ...storedFrecencies,
          [itemKey]: newFrecency,
        };
      });
    },
    [keyRef, setStoredFrecencies]
  );

  const resetRanking = useCallback(
    async function removeFrecency(item: T) {
      const itemKey = keyRef.current(item);

      setStoredFrecencies((storedFrecencies) => {
        const newFrencencies = { ...storedFrecencies };
        delete newFrencencies[itemKey];

        return newFrencencies;
      });
    },
    [keyRef, setStoredFrecencies]
  );

  const sortedData = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.sort((a, b) => {
      const frecencyA = storedFrecencies[keyRef.current(a)];
      const frecencyB = storedFrecencies[keyRef.current(b)];

      // If a has a frecency, but b doesn't, a should come first
      if (frecencyA && !frecencyB) {
        return -1;
      }

      // If b has a frecency, but a doesn't, b should come first
      if (!frecencyA && frecencyB) {
        return 1;
      }

      // If both frecencies are defined,put the one with the higher frecency first
      if (frecencyA && frecencyB) {
        return frecencyB.frecency - frecencyA.frecency;
      }

      // If both frecencies are undefined, keep the original order
      return 0;
    });
  }, [storedFrecencies, data, keyRef]);

  return { data: sortedData, visitItem, resetRanking };
}
