import { describe, expect, it } from 'vitest';
import { isPayPalCsv, matchPayPal, parsePayPalCsv } from './paypal';
import type { Transaction } from './types';

const CSV = `﻿"Date","Time","TimeZone","Name","Type","Status","Currency","Gross","Fee","Net","From Email Address","To Email Address","Transaction ID","Shipping Address","Address Status","Item Title","Item ID","Reference Txn ID","Balance","Subject","Note","Balance Impact"
"15/06/2026","10:01:02","AEST","Big Furniture Co","Express Checkout Payment","Completed","AUD","-6,176.40","0.00","-6,176.40","","","T1","","","Dining table and chairs","","","0.00","","","Debit"
"15/06/2026","10:01:02","AEST","","Bank Deposit to PP Account ","Completed","AUD","6,176.40","0.00","6,176.40","","","T2","","","","","T1","6,176.40","","","Credit"
"20/04/2026","08:00:00","AEST","Game Store","Express Checkout Payment","Completed","USD","-13.00","0.00","-13.00","","","T3","","","","","","0.00","","","Debit"
"20/04/2026","08:00:00","AEST","","General Currency Conversion","Completed","AUD","-20.41","0.00","-20.41","","","T4","","","","","T3","0.00","","","Debit"
"20/04/2026","08:00:00","AEST","","General Currency Conversion","Completed","USD","13.00","0.00","13.00","","","T5","","","","","T3","0.00","","","Credit"
"01/05/2026","08:00:00","AEST","Refund Shop","Payment Refund","Completed","AUD","12.00","0.00","12.00","","","T6","","","","","","0.00","","","Credit"
"02/05/2026","08:00:00","AEST","Paid From Balance","Express Checkout Payment","Completed","AUD","-9.99","0.00","-9.99","","","T7","","","","","","0.00","","","Debit"`;

const bank = (id: string, date: string, amount: number): Transaction => ({ id, date, account: 'g', description: 'Direct Debit 617704 PAYPAL AUSTRALIA', amount, category: 'other', kind: 'spend' });

describe('PayPal activity file', () => {
  it('is recognised and keeps only purchases, priced in Australian dollars', () => {
    expect(isPayPalCsv(CSV)).toBe(true);
    expect(isPayPalCsv('Date,Amount,Description\n')).toBe(false);
    const { purchases } = parsePayPalCsv(CSV);
    expect(purchases.map((p) => [p.merchant, p.aud])).toEqual([['Big Furniture Co', 6176.4], ['Game Store', 20.41], ['Paid From Balance', 9.99]]);
  });
  it('pairs each purchase with the bank payment of the same amount within six days', () => {
    const { purchases } = parsePayPalCsv(CSV);
    const r = matchPayPal(purchases, [bank('a', '2026-06-16', -6176.4), bank('b', '2026-04-20', -20.41), bank('c', '2026-02-23', -44.22)]);
    expect(r.matches.map((m) => [m.tx.id, m.description])).toEqual([['b', 'PayPal: Game Store (USD 13.00)'], ['a', 'PayPal: Big Furniture Co']]);
    expect(r.matches.find((m) => m.tx.id === 'a')!.purchase.item).toBe('Dining table and chairs');
    expect(r.unmatched.map((p) => p.merchant)).toEqual(['Paid From Balance']);
    expect(r.stillUnnamed.map((t) => t.id)).toEqual(['c']);
  });
});
