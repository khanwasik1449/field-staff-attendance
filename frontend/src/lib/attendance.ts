import type { DailyReportRecord } from '../types';

/**
 * An assistant is "on duty" when they have checked in and not yet checked out.
 * Prefers the server-computed flag and falls back to the raw time strings so
 * the dashboard and the roster never disagree.
 */
export const isOnDuty = (r: DailyReportRecord): boolean => {
  if (typeof r.is_on_duty === 'boolean') {
    return r.is_on_duty;
  }
  return Boolean(r.check_in && r.check_in !== '--' && (!r.check_out || r.check_out === '--'));
};
