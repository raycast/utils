import objectHash from "object-hash";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function replacer(this: any, key: string, _value: unknown) {
  const value = this[key];
  if (value instanceof Date) {
    return `__raycast_cached_date__${value.toString()}`;
  }
  if (Buffer.isBuffer(value)) {
    return `__raycast_cached_buffer__${value.toString("base64")}`;
  }
  return _value;
}

export function reviver(_key: string, value: unknown) {
  if (typeof value === "string" && value.startsWith("__raycast_cached_date__")) {
    return new Date(value.replace("__raycast_cached_date__", ""));
  }
  if (typeof value === "string" && value.startsWith("__raycast_cached_buffer__")) {
    return Buffer.from(value.replace("__raycast_cached_buffer__", ""), "base64");
  }
  return value;
}

export function hash(object: objectHash.NotUndefined, options?: objectHash.NormalOption): string {
  return objectHash(object, {
    replacer: (value): string => {
      if (value instanceof URLSearchParams) {
        return value.toString();
      }
      return value;
    },
    ...options,
  });
}
