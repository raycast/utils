import { Action, ActionPanel, List, openCommandPreferences } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";

export default function Command() {
  return (
    <List>
      <List.Item
        title="Default Failure Toast"
        actions={
          <ActionPanel>
            <Action title="Show Toast" onAction={() => showFailureToast(new Error("Some Error"))} />
          </ActionPanel>
        }
      />
      <List.Item
        title="Failure Toast with Title"
        actions={
          <ActionPanel>
            <Action
              title="Show Toast"
              onAction={() =>
                showFailureToast(new Error("Some Error"), {
                  title: "Custom Title",
                })
              }
            />
          </ActionPanel>
        }
      />
      <List.Item
        title="Failure Toast with Custom Action"
        actions={
          <ActionPanel>
            <Action
              title="Show Toast"
              onAction={() =>
                showFailureToast(new Error("Some Error"), {
                  primaryAction: {
                    title: "Open Command Preferences",
                    onAction: () => {
                      openCommandPreferences();
                    },
                  },
                })
              }
            />
          </ActionPanel>
        }
      />
      <List.Item
        title="Failure Toast with Custom Message"
        actions={
          <ActionPanel>
            <Action
              title="Show Toast"
              onAction={() =>
                showFailureToast(new Error("Some Error"), {
                  message: "Custom Message",
                })
              }
            />
          </ActionPanel>
        }
      />
    </List>
  );
}
