import { MARK, RATING_STATES, ratingClass, ratingLabel, type MarkRating } from '../_data/mark';

/** The mark's rating as a bold, capitalised, colour-coded pill. */
export function RatingPill({ rating, title }: { rating: MarkRating; title?: string }) {
  const tip =
    title ??
    (rating.status === 'rated'
      ? `${MARK.label} rating: ${rating.stars} star${rating.stars > 1 ? 's' : ''}${rating.ratedOn ? `, rated ${rating.ratedOn}` : ''}`
      : rating.status === 'in_review'
        ? `${MARK.label} rating in review${rating.since ? ` since ${rating.since}` : ''}`
        : `No ${MARK.label} rating on file`);
  return (
    <span className={`farm-rating ${ratingClass(rating)}`} title={tip}>
      {ratingLabel(rating)}
    </span>
  );
}

/** Column header text for rating columns. */
export function ratingHeader(): string {
  return `${MARK.label} rating`;
}

/** Legend of every rating state, for page footers. */
export function RatingLegend() {
  return (
    <div className="farm-rating-legend">
      <span className="farm-rating-legend-title">{MARK.label} rating</span>
      {RATING_STATES.map((r) => (
        <RatingPill key={ratingLabel(r)} rating={r} />
      ))}
      <span className="farm-rating-legend-note">{MARK.scope} A rating is assigned only when one is on file.</span>
    </div>
  );
}
