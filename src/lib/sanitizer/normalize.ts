/**
 * Tag normalization rules for Layer 2 (Consistency).
 * Maps non-semantic tags to their semantic equivalents.
 */
export const TAG_NORMALIZE_MAP: Record<string, string> = {
  b: 'strong',
  i: 'em',
  div: 'p',
};
