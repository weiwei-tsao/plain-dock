import { describe, it, expect } from 'vitest';
import { findMatchRanges } from './find-matches';

describe('findMatchRanges', () => {
  it('returns no ranges for an empty query', () => {
    expect(findMatchRanges('hello world', '')).toEqual([]);
  });

  it('finds a single case-insensitive match', () => {
    expect(findMatchRanges('Hello World', 'world')).toEqual([{ from: 6, to: 11 }]);
  });

  it('finds multiple non-overlapping matches', () => {
    expect(findMatchRanges('cat cat cat', 'cat')).toEqual([
      { from: 0, to: 3 },
      { from: 4, to: 7 },
      { from: 8, to: 11 },
    ]);
  });

  it('returns no ranges when the query is not found', () => {
    expect(findMatchRanges('hello world', 'xyz')).toEqual([]);
  });
});
