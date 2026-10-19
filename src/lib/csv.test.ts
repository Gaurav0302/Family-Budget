import { expect, it } from 'vitest';
import { toCsv } from './csv';

it('writes text safely for spreadsheets', () => {
  expect(toCsv(['A', 'B'], [['=HYPERLINK("x")', -5.5], ['say "hi"', 3]])).toBe('"A","B"\r\n"\'=HYPERLINK(""x"")",-5.50\r\n"say ""hi""",3\r\n');
});
