// utils/dateUtils.js

const KENYA_OFFSET_MINUTES = 180; // EAT = UTC+3, no DST

/**
 * Build a Date from a tip's date ("9/19/2026") and time ("21:45")
 * where those values are in Kenya local time (UTC+3).
 * The returned Date is the correct absolute instant regardless of the viewer.
 */
export function tipDateTimeToDate(dateStr, timeStr) {
  if (!dateStr) return null;

  const [m, d, y] = dateStr.split('/').map(Number);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);

  if (!m || !d || !y) return null;

  // 1. Build the wall-clock time as if it were UTC
  const asUtcMs = Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0);

  // 2. Kenya is UTC+3, so the real UTC instant is 3 hours earlier
  const utcMs = asUtcMs - KENYA_OFFSET_MINUTES * 60 * 1000;

  return new Date(utcMs);
}

export function formatInUserLocale(date, opts = {}) {
    if (!date) return '';
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...opts,
    }).format(date);
  }

//If you want to show "Sep 19, 21:45" or "Today, 21:45" in the badge, extend the formatter. For example, "Today / Tomorrow / Yesterday" labels:
  export function formatTipDateTime(dateStr, timeStr) {
    const d = tipDateTimeToDate(dateStr, timeStr);
    if (!d) return '';
  
    const time = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  
    const now = new Date();
    const dayMs = 86400000;
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfTip = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayDiff = Math.round((startOfTip - startOfToday) / dayMs);
  
    if (dayDiff === 0) return `Today, ${time}`;
    if (dayDiff === 1) return `Tomorrow, ${time}`;
    if (dayDiff === -1) return `Yesterday, ${time}`;
  
    const date = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(d);
  
    return `${date}, ${time}`;
  }