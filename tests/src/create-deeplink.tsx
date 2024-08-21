import { Action, ActionPanel, LaunchProps, List } from "@raycast/api";
import { createDeeplink, DeeplinkType } from "@raycast/utils";

export default function Command(
  props: LaunchProps<{ launchContext: { message: string }; arguments: Arguments.CreateDeeplink }>,
) {
  return (
    <List>
      {props.launchContext?.message ? (
        <List.Section title="Context from Deeplink">
          <List.Item title="Hello world!" />
        </List.Section>
      ) : null}

      {props.arguments.text ? (
        <List.Section title="Arguments from Deeplink">
          <List.Item title={props.arguments.text} />
        </List.Section>
      ) : null}

      <List.Section title="Extension Deeplinks">
        <List.Item
          title="Simple Deeplink"
          actions={
            <ActionPanel>
              <Action.CreateQuicklink
                title="Create Deeplink"
                quicklink={{
                  name: "Simple Deeplink",
                  link: createDeeplink({ command: "create-deeplink" }),
                }}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Deeplink with Context"
          actions={
            <ActionPanel>
              <Action.CreateQuicklink
                title="Create Deeplink"
                quicklink={{
                  name: "Deeplink with Context",
                  link: createDeeplink({
                    command: "create-deeplink",
                    context: {
                      message: "Hello, world!",
                    },
                  }),
                }}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Deeplink with Arguments"
          actions={
            <ActionPanel>
              <Action.CreateQuicklink
                title="Create Deeplink"
                quicklink={{
                  name: "Deeplink with Arguments",
                  link: createDeeplink({
                    command: "create-deeplink",
                    arguments: { text: "Hello, world!" },
                  }),
                }}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Deeplink to External Extension"
          actions={
            <ActionPanel>
              <Action.CreateQuicklink
                title="Create Deeplink"
                quicklink={{
                  name: "Deeplink to External Extension",
                  link: createDeeplink({
                    ownerOrAuthorName: "nhojb",
                    extensionName: "brew",
                    command: "search",
                  }),
                }}
              />
            </ActionPanel>
          }
        />
      </List.Section>
      <List.Section title="Script Command Deeplinks">
        <List.Item
          title="Simple Deeplink"
          actions={
            <ActionPanel>
              <Action.CreateQuicklink
                title="Create Deeplink"
                quicklink={{
                  name: "Deeplink with Arguments",
                  link: createDeeplink({
                    type: DeeplinkType.ScriptCommand,
                    command: "count-chars",
                    arguments: ["a b+c%20d"],
                  }),
                }}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
