import { describe, expect, it } from 'vitest';
import { calendarFile, nthWeekday } from './calendar';
import { DEFAULT_SETTINGS } from './defaults';
import type { ListedBill } from './billList';

describe('calendar reminders', () => {
  it('finds the nth weekday of a month', () => {
    expect(nthWeekday('2026-11', 1, 'SU')).toBe('2026-11-01');
    expect(nthWeekday('2026-11', 2, 'SU')).toBe('2026-11-08');
    expect(nthWeekday('2026-12', 1, 'MO')).toBe('2026-12-07');
    expect(nthWeekday('2026-11', -1, 'FR')).toBe('2026-11-27');
    expect(nthWeekday('2027-02', -1, 'SU')).toBe('2027-02-28');
  });
  it('writes a calendar file with statements, the meeting and bills', () => {
    const bills: ListedBill[] = [
      { key: 'telstra|month', name: 'Telstra, phone', category: 'phone-internet', every: 'month', amount: 79.09, varies: false, last: '2026-09-29', next: '2026-10-29', yearly: 949 },
      { key: 'rent|month', name: 'Rent', category: 'rent', every: 'month', amount: 2781, varies: false, last: '2026-10-07', next: '2026-11-07', yearly: 16686, stopsAfter: '2027-03' },
      { key: 'gym', name: 'Gym; family', category: 'gym', every: 'month', amount: 40, varies: false, last: '2026-10-31', next: '2026-10-31', yearly: 480 },
      { key: 'old', name: 'Gone', category: 'other', every: 'month', amount: 5, varies: false, last: '', next: '2026-10-01', yearly: 60 },
    ];
    const data = { budgets: [], transactions: [], settings: { ...DEFAULT_SETTINGS, meetingWhen: { nth: 1, day: 'SU' as const, time: '19:30' } } };
    const ics = calendarFile(data, bills, '2026-10-20', { statements: true, meeting: true, bills: true, big: true }, 'https://example.org/app/', 'Australia/Sydney');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261101');                       // statements from 1 November
    expect(ics).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=1');
    expect(ics).toContain('DTSTART;TZID=Australia/Sydney:20261101T193000');     // first Sunday of November, 7:30pm
    expect(ics).toContain('RRULE:FREQ=MONTHLY;BYDAY=1SU');
    expect(ics).toContain('SUMMARY:Telstra\\, phone: $79');                    // commas escaped
    expect(ics).toContain('RRULE:FREQ=MONTHLY;UNTIL=20270331');                // rent stops after March
    expect(ics).not.toContain('Gone');                                         // already past
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true);
    // Unfolding gives back the original text exactly (nothing repeated or lost at the folds).
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain("DESCRIPTION:Download last month's statements for every account and add them on Statements → Add statements.\\nhttps://example.org/app/");
    expect(unfolded).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=-1');          // a bill on the 31st
    expect(unfolded).toContain('SUMMARY:Gym\\; family: $40');
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(5);
  });
});
