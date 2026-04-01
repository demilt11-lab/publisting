export function readStorageItem(keys: readonly string[]): string | null {
  if (typeof window === "undefined") return null;

  try {
    const primaryKey = keys[0];

    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value === null) continue;

      if (key !== primaryKey) {
        localStorage.setItem(primaryKey, value);
      }

      return value;
    }
  } catch {
    return null;
  }

  return null;
}

export function writeStorageItem(key: string, value: string) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures.
  }
}

export function removeStorageItems(keys: readonly string[]) {
  if (typeof window === "undefined") return;

  try {
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore storage removal failures.
  }
}