// Generates downloadable iCalendar (.ics) files for repair-café events so
// visitors can add an upcoming session to their own calendar.
//
// Event times are treated as local wall-clock time (floating, no timezone) to
// match how the rest of the app stores/displays them — this avoids any UTC
// conversion shifting a "10:00" session by the visitor's offset.

export interface CalEvent {
  id?: string;
  name: string;
  description?: string | null;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM or HH:MM:SS
  endTime: string; // HH:MM or HH:MM:SS
  venue?: { name?: string | null; address?: string | null; postcode?: string | null } | null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// "2026-06-13" + "10:00:00" -> "20260613T100000" (floating local time).
function formatLocal(date: string, time: string): string {
  const [y, m, d] = date.split('-');
  const [hh = '0', mm = '0', ss = '0'] = time.split(':');
  return `${y}${m}${d}T${pad(+hh)}${pad(+mm)}${pad(+ss)}`;
}

// Escape per RFC 5545 TEXT rules: backslash, semicolon, comma and newlines.
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Fold long content lines to ~75 octets (CRLF + single leading space).
function fold(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let i = 0;
  while (i < line.length) {
    parts.push((i === 0 ? '' : ' ') + line.slice(i, i + 73));
    i += 73;
  }
  return parts.join('\r\n');
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'event'
  );
}

export function buildICS(event: CalEvent): string {
  const dtStart = formatLocal(event.date, event.startTime);
  const dtEnd = formatLocal(event.date, event.endTime);
  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const uid = `${event.id ?? Math.random().toString(36).slice(2)}-${dtStart}@repair-cafe-hub`;
  const location = [event.venue?.name, event.venue?.address, event.venue?.postcode]
    .filter(Boolean)
    .join(', ');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Repair Cafe Hub//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeText(event.name)}`,
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(location ? [`LOCATION:${escapeText(location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(fold).join('\r\n');
}

// Build and download the .ics for an event. Browser-only (uses a Blob URL).
export function downloadICS(event: CalEvent, filename?: string): void {
  const blob = new Blob([buildICS(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `${slug(event.name)}-${event.date}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
