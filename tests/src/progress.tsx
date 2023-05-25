import { List } from "@raycast/api";
import { getProgressIcon } from "@raycast/utils";

export default function Command() {
  return (
    <List>
      {Array.from({ length: 11 }, (_, i) => i / 10).map((i) => (
        <List.Item icon={getProgressIcon(i)} title="Project" />
      ))}
    </List>
  );
}
