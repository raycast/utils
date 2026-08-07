import { List, ActionPanel, Action } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import { useMemo } from "react";

type CacheWriteDebounceOption = "none" | "0" | "100" | "2000";

export default function Command() {
  const [cacheWriteDebounceOption, setCacheWriteDebounceOption] = useCachedState<CacheWriteDebounceOption>(
    "cache-write-debounce",
    "none",
  );

  const cacheWriteDebounce = useMemo(() => {
    switch (cacheWriteDebounceOption) {
      case "0":
        return 0;
      case "100":
        return 100;
      case "2000":
        return 2000;
      case "none":
      default:
        return undefined;
    }
  }, [cacheWriteDebounceOption]);

  const [showDetails, setShowDetails] = useCachedState("show-details", false, { cacheWriteDebounce });

  return (
    <List
      isShowingDetail={showDetails}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Cache Write Debounce"
          value={cacheWriteDebounceOption}
          onChange={(newValue) => setCacheWriteDebounceOption(newValue as CacheWriteDebounceOption)}
        >
          <List.Dropdown.Item title="None" value="none" />
          <List.Dropdown.Item title="0ms" value="0" />
          <List.Dropdown.Item title="100ms" value="100" />
          <List.Dropdown.Item title="2s" value="2000" />
        </List.Dropdown>
      }
    >
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
