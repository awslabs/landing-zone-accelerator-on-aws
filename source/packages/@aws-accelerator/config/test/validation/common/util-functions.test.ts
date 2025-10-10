import { hasDuplicates } from '../../../validator/utils/common-validator-functions';

describe('hasDuplicates', () => {
  test('should return false for empty array', () => {
    expect(hasDuplicates([])).toBe(false);
  });

  test('should return false for array with no duplicates', () => {
    expect(hasDuplicates(['a', 'b', 'c'])).toBe(false);
  });

  test('should return true for array with duplicates', () => {
    expect(hasDuplicates(['a', 'b', 'a'])).toBe(true);
  });

  test('should return true for array with multiple duplicates', () => {
    expect(hasDuplicates(['a', 'b', 'a', 'b'])).toBe(true);
  });

  test('should handle case-sensitive strings', () => {
    expect(hasDuplicates(['A', 'a'])).toBe(false);
  });

  test('should handle special characters', () => {
    expect(hasDuplicates(['!@#', '$%^', '!@#'])).toBe(true);
  });

  test('should handle numbers as strings', () => {
    expect(hasDuplicates(['1', '2', '1'])).toBe(true);
  });

  test('should handle whitespace strings', () => {
    expect(hasDuplicates(['', ' ', ''])).toBe(true);
  });
});
