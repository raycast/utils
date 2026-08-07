import { List } from "@raycast/api";
import { getAvatarIcon } from "@raycast/utils";

export default function Command() {
  return (
    <List>
      <List.Item icon={getAvatarIcon("John Doe")} title="John Doe" />
      <List.Item icon={getAvatarIcon("Mary Jane")} title="Mary Jane" />
    </List>
  );
}
