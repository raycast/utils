import { List, ActionPanel, Action } from "@raycast/api";
import { useCachedState } from "@raycast/utils";

export default function Command() {
  const [showDetails, setShowDetails] = useCachedState("show-details", false);

  return (
    <List isShowingDetail={showDetails}>
      <List.Item
        title="title"
        detail={<List.Item.Detail markdown="some text" />}
        actions={
          <ActionPanel>
            <Action title={showDetails ? "Hide Details" : "Show Details"} onAction={() => setShowDetails((x) => !x)} />
          </ActionPanel>
        }
      />
    </List>
  );
}
