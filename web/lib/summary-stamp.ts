/** ISO timestamp for summary_updated_at columns after a summary is written. */
export function summaryUpdatedAtNow(): string {
  return new Date().toISOString();
}

/** SQL fragment for raw sqlite prepares */
export const SUMMARY_UPDATED_AT_SQL = "CURRENT_TIMESTAMP";
