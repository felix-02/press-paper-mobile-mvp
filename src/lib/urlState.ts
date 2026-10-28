export function searchParamValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function optionFromSearchParam<T extends readonly string[]>(
  options: T,
  value: string | null,
  fallback: T[number]
): T[number] {
  const normalized = searchParamValue(value ?? "");
  return options.find((option) => searchParamValue(option) === normalized) ?? fallback;
}
