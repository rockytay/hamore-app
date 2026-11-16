/** Date and time formats used across the app, in Hebrew. */

/** e.g. 18.11.2026 */
export function formatDate(date: Date) {
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

/** e.g. 14:30 */
export function formatTime(date: Date) {
  return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** e.g. "היום", "מחר" or "יום ד׳, 18.11" */
export function formatDay(date: Date, now = new Date()) {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  if (days === 0) return 'היום';
  if (days === 1) return 'מחר';
  return date.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

/** e.g. "מחר · 14:30–15:10" */
export function formatLessonTime(start: Date, end: Date) {
  return `${formatDay(start)} · ${formatTime(start)}–${formatTime(end)}`;
}
