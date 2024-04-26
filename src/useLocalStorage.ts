import { LocalStorage } from "@raycast/api";
import { showFailureToast } from "./showFailureToast";
import { replacer, reviver } from "./helpers";
import { usePromise } from "./usePromise";

/**
 * A hook to manage a value in the local storage.
 *
 * @remark The value is stored as a JSON string in the local storage.
 *
 * @param key - The key to use for the value in the local storage.
 * @param initialValue - The initial value to use if the key doesn't exist in the local storage.
 * @returns An object with the following properties:
 * - `value`: The value from the local storage or the initial value if the key doesn't exist.
 * - `setValue`: A function to update the value in the local storage.
 * - `removeValue`: A function to remove the value from the local storage.
 * - `isLoading`: A boolean indicating if the value is loading.
 *
 * @example
 * ```
 * const { value, setValue } = useLocalStorage<string>("my-key");
 * const { value, setValue } = useLocalStorage<string>("my-key", "default value");
 * ```
 */
export function useLocalStorage<T>(key: string) {
  const {
    data: value,
    isLoading,
    mutate,
  } = usePromise(
    async (storageKey: string) => {
      const item = await LocalStorage.getItem<string>(storageKey);

      if (item) {
        return JSON.parse(item, reviver) as T;
      }
    },
    [key],
  );

  async function setValue(value: T) {
    try {
      await mutate(LocalStorage.setItem(key, JSON.stringify(value, replacer)), {
        optimisticUpdate(value) {
          return value;
        },
      });
    } catch (error) {
      await showFailureToast(error, { title: "Failed to set value in local storage" });
    }
  }

  async function removeValue() {
    try {
      await mutate(LocalStorage.removeItem(key), {
        optimisticUpdate() {
          return undefined;
        },
      });
    } catch (error) {
      await showFailureToast(error, { title: "Failed to remove value from local storage" });
    }
  }

  return { value, setValue, removeValue, isLoading };
}
