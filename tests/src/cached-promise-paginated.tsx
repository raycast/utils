import { List, ActionPanel, Action } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { setTimeout } from "timers/promises";

export default function Command() {
  const [searchText, setSearchText] = useState<string>("");

  const { isLoading, data, mutate, pagination, revalidate } = useCachedPromise(
    (text: string) => async (options) => {
      await setTimeout(500);
      const data = items(text, options.page);
      return { data, hasMore: options.page < 20 };
    },
    [searchText],
    {
      initialData: [],
      keepPreviousData: false,
    },
  );

  return (
    <List isLoading={isLoading} onSearchTextChange={setSearchText} pagination={pagination}>
      {data.map((item) => (
        <List.Item
          key={item}
          title={item}
          actions={
            <ActionPanel>
              <Action title="Reload" onAction={() => revalidate()} />
              <Action
                title="Delete All Items But This One"
                onAction={async () => {
                  mutate(setTimeout(1000), {
                    optimisticUpdate: () => {
                      return [item];
                    },
                  });
                }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

const items = (searchText: string, page: number) => {
  const result = [];
  for (let i = 0; i < 50; i++) {
    result.push(`result: ${searchText} - ${i} - ${page}`);
  }

  if (page === 5) {
    return result.slice(0, 10);
  }
  return result;
};
