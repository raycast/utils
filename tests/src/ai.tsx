import { Detail, LaunchProps, AI, ActionPanel, Action } from "@raycast/api";
import { useAI } from "@raycast/utils";
import { useState } from "react";

export default function Command(props: LaunchProps<{ arguments: Arguments.Ai }>) {
  const [creativity, setCreativity] = useState<AI.Creativity | undefined>(undefined);
  const [execute, setExecute] = useState<boolean>(false);
  const { isLoading, data } = useAI(props.arguments.prompt, { creativity, execute });

  const handleSetCreativity = (creativity: AI.Creativity | undefined) => {
    setCreativity(creativity);
    setExecute(true);
  };

  return (
    <Detail
      isLoading={isLoading}
      markdown={execute ? data : "Execute is set to false. Choose a creativity to toggle it to true."}
      actions={
        <ActionPanel>
          <ActionPanel.Submenu title="Set Creativity…">
            <Action title="None" onAction={() => handleSetCreativity("none")} />
            <Action title="Low" onAction={() => handleSetCreativity("low")} />
            <Action title="Medium" onAction={() => handleSetCreativity("medium")} />
            <Action title="High" onAction={() => handleSetCreativity("high")} />
            <Action title="Maximum" onAction={() => handleSetCreativity("maximum")} />
            <Action title="-1" onAction={() => handleSetCreativity(-1)} />
            <Action title="0" onAction={() => handleSetCreativity(0)} />
            <Action title="2" onAction={() => handleSetCreativity(2)} />
            <Action title="3" onAction={() => handleSetCreativity(3)} />
            <Action title="undefined" onAction={() => handleSetCreativity(undefined)} />
          </ActionPanel.Submenu>
        </ActionPanel>
      }
    />
  );
}
