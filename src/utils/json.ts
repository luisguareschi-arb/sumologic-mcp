export function safeStringify(obj: unknown): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(
    obj,
    (_key, value: unknown) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular Reference]';
        }
        seen.add(value);
      }
      return value;
    },
    2,
  );
}
