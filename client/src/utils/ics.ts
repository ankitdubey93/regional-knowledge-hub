import type { Obligation } from '@chub/shared/utils/deadlines';

function esc(s: string): string { return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
function compact(iso: string): string { return iso.replace(/-/g, ''); }

/** stamp is a UTC instant like '20261028T000000Z'. */
export function toIcs(entityName: string, obligations: Obligation[], stamp: string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Compliance Hub//Calendar//EN', 'CALSCALE:GREGORIAN'];
  for (const o of obligations) {
    lines.push('BEGIN:VEVENT', `UID:${o.id}@compliance-hub`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(o.dueDate)}`, `SUMMARY:${esc(`${entityName}: ${o.label}`)}`,
      ...(o.caveat ? [`DESCRIPTION:${esc(o.caveat)}`] : []), 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
