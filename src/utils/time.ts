/**
 * Time utility functions for formatting dates and timestamps.
 */

/**
 * Formats a date to PST (Pacific Standard Time) / Los Angeles timezone.
 * Returns the date in ISO format but adjusted for PST timezone.
 *
 * @param date - The date to format (Date object or ISO string)
 * @returns ISO string formatted in PST timezone
 */
export function formatPST(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  // Create a formatter for PST timezone
  const pstFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });

  // Format the date in PST
  const pstParts = pstFormatter.formatToParts(dateObj);

  // Extract parts and construct ISO-like string
  const year = pstParts.find(p => p.type === 'year')?.value;
  const month = pstParts.find(p => p.type === 'month')?.value;
  const day = pstParts.find(p => p.type === 'day')?.value;
  const hour = pstParts.find(p => p.type === 'hour')?.value;
  const minute = pstParts.find(p => p.type === 'minute')?.value;
  const second = pstParts.find(p => p.type === 'second')?.value;
  const fractionalSecond = pstParts.find(p => p.type === 'fractionalSecond')?.value;

  // Construct ISO string in PST timezone
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${fractionalSecond}Z`;
}

/**
 * Gets the current timestamp formatted in PST timezone.
 * @returns ISO string of current time in PST timezone
 */
export function nowPST(): string {
  return formatPST(new Date());
}

/**
 * Formats an ISO date string to PST timezone.
 * @param isoString - ISO date string
 * @returns ISO string formatted in PST timezone
 */
export function isoToPST(isoString: string): string {
  return formatPST(isoString);
}
