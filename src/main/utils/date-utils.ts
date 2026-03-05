import { addDays, addWeeks, addMonths, addQuarters, startOfDay, startOfWeek, startOfMonth, startOfQuarter } from 'date-fns';

/**
 * Get date range for a given interval type
 * - daily: yesterday
 * - weekly: last 7 days
 * - monthly: last 30 days
 * - quarterly: last 90 days
 */
export function getDateRange(
  interval: 'daily' | 'weekly' | 'monthly' | 'quarterly',
  endDate: Date = new Date()
): { startDate: Date; endDate: Date } {
  // Use yesterday as end date (not today)
  const end = startOfDay(addDays(endDate, -1));
  let start: Date;

  switch (interval) {
    case 'daily':
      // Yesterday only
      start = end;
      break;

    case 'weekly':
      // Last 7 days (including yesterday)
      start = addDays(end, -6);
      break;

    case 'monthly':
      // Last 30 days (including yesterday)
      start = addDays(end, -29);
      break;

    case 'quarterly':
      // Last 90 days (including yesterday)
      start = addDays(end, -89);
      break;

    default:
      throw new Error(`Invalid interval: ${interval}`);
  }

  return { startDate: start, endDate: end };
}

/**
 * Get previous period date range for comparison
 */
export function getPreviousDateRange(
  interval: 'daily' | 'weekly' | 'monthly' | 'quarterly',
  currentRange: { startDate: Date; endDate: Date }
): { startDate: Date; endDate: Date } {
  const duration = currentRange.endDate.getTime() - currentRange.startDate.getTime();
  const previousEnd = new Date(currentRange.startDate.getTime() - 86400000); // Day before current start
  const previousStart = new Date(previousEnd.getTime() - duration);

  return { startDate: previousStart, endDate: previousEnd };
}

/**
 * Format date for display
 */
export function formatDate(date: Date, format: 'short' | 'long' | 'time' = 'short'): string {
  const options: Intl.DateTimeFormatOptions = {
    short: { day: '2-digit', month: '2-digit', year: 'numeric' } as any,
    long: { day: 'numeric', month: 'long', year: 'numeric' } as any,
    time: { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } as any,
  }[format];

  return date.toLocaleDateString('de-DE', options);
}

/**
 * Format date for GA4 API (YYYY-MM-DD)
 */
export function formatDateForGA4(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse date string
 */
export function parseDate(dateString: string): Date {
  return new Date(dateString);
}

/**
 * Check if date is in the past
 */
export function isPast(date: Date): boolean {
  return date < new Date();
}

/**
 * Get difference in days between two dates
 */
export function getDaysDiff(date1: Date, date2: Date): number {
  const diffInMs = Math.abs(date2.getTime() - date1.getTime());
  return Math.floor(diffInMs / (1000 * 60 * 60 * 24));
}

/**
 * Add interval to date
 */
export function addInterval(
  date: Date,
  interval: 'daily' | 'weekly' | 'monthly' | 'quarterly',
  amount: number = 1
): Date {
  switch (interval) {
    case 'daily':
      return addDays(date, amount);
    case 'weekly':
      return addWeeks(date, amount);
    case 'monthly':
      return addMonths(date, amount);
    case 'quarterly':
      return addQuarters(date, amount);
  }
}

/**
 * Get next scheduled run date based on interval
 */
export function getNextRunDate(
  interval: 'daily' | 'weekly' | 'monthly' | 'quarterly',
  time: string, // HH:mm format
  referenceDate: Date = new Date()
): Date {
  const [hours, minutes] = time.split(':').map(Number);

  const now = referenceDate;
  let nextRun = new Date(now);
  nextRun.setHours(hours, minutes, 0, 0);

  // If the time has passed today, schedule for next interval
  if (nextRun <= now) {
    switch (interval) {
      case 'daily':
        nextRun.setDate(nextRun.getDate() + 1);
        break;
      case 'weekly':
        nextRun.setDate(nextRun.getDate() + 7);
        break;
      case 'monthly':
        nextRun.setMonth(nextRun.getMonth() + 1);
        break;
      case 'quarterly':
        nextRun.setMonth(nextRun.getMonth() + 3);
        break;
    }
  }

  return nextRun;
}

/**
 * Validate time format (HH:mm)
 */
export function isValidTime(time: string): boolean {
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return timeRegex.test(time);
}

/**
 * Convert interval to cron expression
 */
export function intervalToCron(
  interval: 'daily' | 'weekly' | 'monthly' | 'quarterly',
  time: string
): string {
  const [hours, minutes] = time.split(':').map(Number);

  switch (interval) {
    case 'daily':
      return `${minutes} ${hours} * * *`;
    case 'weekly':
      return `${minutes} ${hours} * * 1`; // Monday
    case 'monthly':
      return `${minutes} ${hours} 1 * *`;
    case 'quarterly':
      return `${minutes} ${hours} 1 1,4,7,10 *`;
  }
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
