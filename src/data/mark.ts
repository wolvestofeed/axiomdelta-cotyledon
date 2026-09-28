/**
 * Cotyledon — the certification mark's supplier rating.
 *
 * The mark combines regenerative and organic standards across the whole food
 * supply, including people and workplaces. Its rating is the main credential a
 * supplier carries on this platform: one, two or three stars, or one of two
 * statuses while no rating is on file.
 *
 * NAMING: the mark's name lives ONLY in `MARK.label` below. The operator
 * confirmed on 2026-09-12 that the mark may be named in the platform where
 * ratings are concerned; that exception is limited to the rating mark
 * (docs/farm/CLAUDE.md §1). Every header, legend and tooltip reads this one
 * string.
 *
 * RULE: a rating is a credential, not a placeholder. No real producer or
 * input supplier is ever assigned stars here without a rating on file.
 * Every real operation therefore resolves to NOT YET RATED by default.
 */

export const MARK = {
  /** Display name of the mark. */
  label: 'RATING',
  /** What the rating covers, for legends and tooltips. */
  scope: 'Regenerative and organic standards across the food supply, including people and workplaces.',
} as const;

export type MarkStars = 1 | 2 | 3;

export type MarkRating =
  | { status: 'rated'; stars: MarkStars; ratedOn?: string; note?: string }
  | { status: 'in_review'; since?: string; note?: string }
  | { status: 'not_rated' };

export const NOT_RATED: MarkRating = { status: 'not_rated' };

/** Ratings on file for suppliers, keyed by supplier operation id. Empty: none on file. */
export const supplierRatings: Record<string, MarkRating> = {};

/** Ratings on file for grow plan input supply, keyed by input name. Empty: none on file. */
export const inputRatings: Record<string, MarkRating> = {};

export function ratingFor(table: Record<string, MarkRating>, key: string): MarkRating {
  return table[key] ?? NOT_RATED;
}

/** Short, capitalised label for a rating, used inside the pill. */
export function ratingLabel(r: MarkRating): string {
  switch (r.status) {
    case 'rated':
      return `${'★'.repeat(r.stars)} ${r.stars}-STAR`;
    case 'in_review':
      return 'IN REVIEW';
    case 'not_rated':
      return 'NOT YET RATED';
  }
}

/** CSS modifier for a rating. */
export function ratingClass(r: MarkRating): string {
  switch (r.status) {
    case 'rated':
      return `r${r.stars}`;
    case 'in_review':
      return 'review';
    case 'not_rated':
      return 'none';
  }
}

/** Every rating state, for legends. */
export const RATING_STATES: MarkRating[] = [
  { status: 'rated', stars: 3 },
  { status: 'rated', stars: 2 },
  { status: 'rated', stars: 1 },
  { status: 'in_review' },
  { status: 'not_rated' },
];
