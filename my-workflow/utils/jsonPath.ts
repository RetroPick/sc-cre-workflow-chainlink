export function getValueByPath(input: unknown, path: string): unknown {
  if (!path) return input;
  const segments = path.split(".").filter(Boolean);
  let current: any = input;

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    const index = Number(segment);
    if (!Number.isNaN(index) && Array.isArray(current)) {
      current = current[index];
      continue;
    }
    current = current[segment];
  }

  return current;
}
