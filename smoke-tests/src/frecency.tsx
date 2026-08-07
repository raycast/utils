import { List, ActionPanel, Action, Icon } from "@raycast/api";
import { useFetch, useFrecencySorting } from "@raycast/utils";

export default function Command() {
  const { isLoading, data } = useFetch<{ id: number; title: string }[]>("https://jsonplaceholder.typicode.com/todos");

  const {
    data: sortedData,
    visitItem,
    resetRanking,
  } = useFrecencySorting(data, {
    key(item) {
      return `item-${item.id}`;
    },
  });

  return (
    <List isLoading={isLoading}>
      {sortedData.map((item) => (
        <List.Item
          key={item.id}
          title={item.title}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser
                url={`https://jsonplaceholder.typicode.com/posts/${item.id}`}
                onOpen={() => visitItem(item)}
              />
              <Action.CopyToClipboard
                title="Copy Link"
                content={`https://jsonplaceholder.typicode.com/posts/${item.id}`}
                onCopy={() => visitItem(item)}
              />
              <Action title="Reset Ranking" icon={Icon.ArrowCounterClockwise} onAction={() => resetRanking(item)} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
