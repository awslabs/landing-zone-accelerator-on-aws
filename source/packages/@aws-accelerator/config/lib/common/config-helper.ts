// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function removeDuplicates<T>(array: T[], keySelector: keyof T | ((item: T) => any)): T[] {
  const seen = new Map();
  return array.filter(item => {
    const keyValue = typeof keySelector === 'function' ? keySelector(item) : item[keySelector];

    if (seen.has(keyValue)) {
      return false;
    }
    seen.set(keyValue, true);
    return true;
  });
} /**
 * Safely parses a JSON property from a DynamoDB item, returning empty object if property is missing or invalid
 * @param item DynamoDB item that may contain the JSON property
 * @param propertyName Name of the property to parse
 * @returns Parsed object or empty object if parsing fails
 */
export function safeParseJsonProperty<T = Record<string, unknown>>(
  item: Record<string, unknown>,
  propertyName: string,
): T {
  try {
    if (!item || typeof item !== 'object' || !(propertyName in item) || typeof item[propertyName] !== 'string') {
      return {} as T;
    }
    return JSON.parse(item[propertyName] as string) as T;
  } catch {
    return {} as T;
  }
}
