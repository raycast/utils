import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { useLocalStorage } from "@raycast/utils";

const exampleTodos = [
  { id: "1", title: "Buy milk", done: false },
  { id: "2", title: "Walk the dog", done: false },
  { id: "3", title: "Call mom", done: false },
];

function ListItem({ id, title, done }: { id: string; title: string; done: boolean }) {
  const { value: todos, setValue: setTodos } = useLocalStorage("todos", exampleTodos);

  async function toggleTodo(id: string) {
    const newTodos = todos?.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo)) ?? [];
    await setTodos(newTodos);
  }

  return (
    <List.Item
      icon={done ? { source: Icon.Checkmark, tintColor: Color.Green } : Icon.Circle}
      id={id}
      title={title}
      actions={
        <ActionPanel>
          <Action title={done ? "Uncomplete" : "Complete"} onAction={() => toggleTodo(id)} />
          <Action title="Delete" style={Action.Style.Destructive} onAction={() => toggleTodo(id)} />
        </ActionPanel>
      }
    />
  );
}

export default function Command() {
  const { value: todos, isLoading } = useLocalStorage("todos", exampleTodos);

  return <List isLoading={isLoading}>{todos?.map((todo) => <ListItem key={todo.id} {...todo} />)}</List>;
}
