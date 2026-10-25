"use client";
import { toast as original } from "sonner";
import { getSelectedLocale, translate } from "./locale-provider";
function args(values: unknown[]) {
  return values.map((value, index) => {
    if (index === 0 && typeof value === "string")
      return translate(value, getSelectedLocale());
    if (
      index === 1 &&
      value &&
      typeof value === "object" &&
      "description" in value &&
      typeof value.description === "string"
    )
      return {
        ...value,
        description: translate(value.description, getSelectedLocale()),
      };
    return value;
  });
}
export const toast: typeof original = new Proxy(original, {
  apply(target, receiver, values) {
    return Reflect.apply(target, receiver, args(values));
  },
  get(target, key) {
    const value = Reflect.get(target, key);
    return typeof value === "function" &&
      ["success", "error", "info", "warning", "message", "loading"].includes(
        String(key),
      )
      ? (...values: unknown[]) => Reflect.apply(value, target, args(values))
      : value;
  },
});
