import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { useLocalStorage } from "@raycast/utils";
import { randomUUID } from "crypto";

type Todo = {
  id: string;
  title: string;
  done: boolean;
  doneAt: Date | null;
};

export default function Command() {
  const { value: todos, isLoading, setValue: setTodos } = useLocalStorage<Todo[]>("todos");

  async function createTodo() {
    const id = randomUUID();
    const newTodo: Todo = { id, title: id, done: false, doneAt: null };
    const newTodos = [...(todos ?? []), newTodo];
    await setTodos(newTodos);
  }

  async function toggleTodo(id: string) {
    const newTodos =
      todos?.map((todo) => (todo.id === id ? { ...todo, done: !todo.done, doneAt: new Date() } : todo)) ?? [];
    await setTodos(newTodos);
  }

  async function removeTodo(id: string) {
    const newTodos = todos?.filter((todo) => todo.id !== id) ?? [];
    await setTodos(newTodos);
  }

  return (
    <List isLoading={isLoading}>
      {todos?.map((todo) => {
        return (
          <List.Item
            icon={todo.done ? { source: Icon.Checkmark, tintColor: Color.Green } : Icon.Circle}
            key={todo.id}
            title={todo.title}
            actions={
              <ActionPanel>
                <Action
                  icon={todo.done ? Icon.Circle : Icon.Check}
                  title={todo.done ? "Uncomplete" : "Complete"}
                  onAction={() => toggleTodo(todo.id)}
                />
                <Action title="Create New Todo" icon={Icon.Plus} onAction={createTodo} />
                <Action
                  title="Delete"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  shortcut={{ modifiers: ["ctrl"], key: "x" }}
                  onAction={() => removeTodo(todo.id)}
                />
              </ActionPanel>
            }
            accessories={[{ date: todo.doneAt ? todo.doneAt : undefined }]}
          />
        );
      })}

      <List.EmptyView
        title="No Todos"
        actions={
          <ActionPanel>
            <Action title="Create New Todo" icon={Icon.Plus} onAction={createTodo} />
          </ActionPanel>
        }
      />
    </List>
  );
}
