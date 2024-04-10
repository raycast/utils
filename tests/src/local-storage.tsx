import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { useLocalStorage } from "@raycast/utils";

type Todo = {
  id: string;
  title: string;
  done: boolean;
  doneAt: Date | null;
};

const exampleTodos: Todo[] = [
  { id: "1", title: "Buy milk", done: false, doneAt: null },
  { id: "2", title: "Walk the dog", done: false, doneAt: null },
  { id: "3", title: "Call mom", done: false, doneAt: null },
];

export default function Command() {
  const { value: todos, setValue: setTodos } = useLocalStorage("todos", exampleTodos);

  async function toggleTodo(id: string) {
    const newTodos = todos.map((todo) => (todo.id === id ? { ...todo, done: !todo.done, doneAt: new Date() } : todo));
    await setTodos(newTodos);
  }

  return (
    <List>
      {todos.map((todo) => {
        return (
          <List.Item
            icon={todo.done ? { source: Icon.Checkmark, tintColor: Color.Green } : Icon.Circle}
            key={todo.id}
            title={todo.title}
            actions={
              <ActionPanel>
                <Action title={todo.done ? "Uncomplete" : "Complete"} onAction={() => toggleTodo(todo.id)} />
                <Action title="Delete" onAction={() => toggleTodo(todo.id)} />
              </ActionPanel>
            }
            accessories={[{ date: todo.doneAt ? todo.doneAt : undefined }]}
          />
        );
      })}
    </List>
  );
}
