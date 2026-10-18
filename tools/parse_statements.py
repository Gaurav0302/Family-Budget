"""Turn bank statement PDFs (already converted with `pdftotext -layout`) into one transaction list.

Formats handled:
  cba_summary   CommBank "Transaction Summary" letters (Date | details | Amount | Balance), incl. credit card (no balance)
  cba_statement CommBank formal statements (Date | Transaction | Debit | Credit | Balance)
  macquarie     Macquarie transaction listing reports
  paypal        PayPal transaction history (used to name the merchant behind "PAYPAL AUSTRALIA" bank debits)

Amounts: negative = money out, positive = money in. Account numbers are never kept.
Usage: python3 parse_statements.py OUT.json ACCOUNT_KEY:FORMAT:FILE.txt [...]
"""
import json, re, sys

MONTHS = {m: i + 1 for i, m in enumerate('Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split())}
SKIP = ('Card xx', 'Value Date', 'Account Number', 'Page ', 'Date ', 'Created', 'While this', 'we’re not', "we're not",
        'Statement ', 'Any pending', '##', 'Transaction Summary')
MONEY = r'-?\$?[\d,]+\.\d{2}'

def num(s):
    return float(s.replace('$', '').replace(',', ''))

def iso(d, m, y):
    return f'{int(y):04d}-{MONTHS[m[:3]]:02d}-{int(d):02d}'

def clean(s):
    s = re.sub(r'\s{2,}', ' ', s).strip(' |')
    return s

def cba_summary(text):
    rows, cur = [], None
    pat = re.compile(r'^\s*(\d{2}) (\w{3}) (\d{4})\s+(.*?)\s+(' + MONEY + r')(?:\s+(' + MONEY + r'))?\s*$')
    for line in text.splitlines():
        m = pat.match(line)
        if m:
            desc = m[4].strip()
            if desc.startswith('$ ') or 'FEE SAVED' in desc:
                cur = None; continue
            cur = {'date': iso(m[1], m[2], m[3]), 'desc': desc, 'amount': num(m[5]),
                   'balance': num(m[6]) if m[6] else None}
            rows.append(cur); continue
        s = line.strip()
        if s.startswith(('Account Number', 'Any pending')):
            cur = None; continue
        if cur and s and not s.startswith(SKIP) and len(s) < 70 and not re.match(r'^[\d.]+ (US|GBR) DOLLAR', s):
            cur['desc'] += ' | ' + s
    return rows

def cba_statement(text, year):
    rows, cur, prev_bal = [], None, None
    start = re.compile(r'^\s*(\d{2}) (\w{3})(?: (\d{4}))? (.*)$')
    tail = re.compile(r'^(.*?)\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2}) CR\s*$')
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        m = start.match(s)
        if m and m[2][:3] in MONTHS:
            body = m[4]
            if 'OPENING BALANCE' in body or 'CLOSING BALANCE' in body:
                b = re.search(r'([\d,]+\.\d{2}) CR', body)
                if b and 'OPENING' in body:
                    prev_bal = num(b[1])
                cur = None; continue
            cur = {'date': iso(m[1], m[2], m[3] or year), 'desc': '', 'amount': None, 'balance': None}
            s = body
        if cur is None:
            continue
        t = tail.match(s)
        if t:
            cur['desc'] = clean(cur['desc'] + ' | ' + t[1])
            bal = num(t[3])
            cur['balance'] = bal
            cur['amount'] = round(bal - prev_bal, 2) if prev_bal is not None else -num(t[2])
            prev_bal = bal
            rows.append(cur); cur = None
        elif not s.startswith(SKIP) and not re.match(r'^[\d.* ]+[A-Z0-9 .]+V\d', s) and len(s) < 90:
            if not re.match(r'^(Statement|Account Number|Date Transaction)', s):
                cur['desc'] = clean(cur['desc'] + ' | ' + s)
    return rows

def macquarie(text, year):
    rows, prev_bal = [], None
    for line in text.splitlines():
        if 'Opening balance' in line:
            b = re.search(r'([\d,]+\.\d{2}) CR', line)
            if b: prev_bal = num(b[1])
            continue
        m = re.match(r'^\s*(\w{3}) (\d{1,2})\s{2,}(\S.*?)\s{2,}(\S.*?)\s{2,}([\d,]+\.\d{2})\s+([\d,]+\.\d{2}) CR\s*$', line)
        if m and m[1] in MONTHS:
            bal = num(m[6])
            rows.append({'date': iso(m[2], m[1], year), 'desc': clean(m[3] + ' | ' + m[4]),
                         'amount': round(bal - prev_bal, 2), 'balance': bal})
            prev_bal = bal
    return rows

def paypal(text):
    """Returns merchant purchases with the AUD amount actually drawn from the bank."""
    lines = [l for l in text.splitlines() if l.strip()]
    out, pending_merchant = [], None
    for i, l in enumerate(lines):
        m = re.match(r'^\s*(\d{2})/(\d{2})/(\d{4})\s+(.*?)\s{2,}(Completed|Pending)\s+(AUD|USD)\s+(-?[\d,]+\.\d{2})', l)
        desc_above = lines[i - 1].strip() if i else ''
        if not m:
            continue
        d, mo, y, rest, status, cur, gross = m.groups()
        desc = clean((desc_above if not re.match(r'^\d{2}/', desc_above) and 'ID:' not in desc_above else '') + ' ' + rest)
        date = f'{y}-{mo}-{d}'
        if re.search(r'(Subscription Payment|Bill User Payment|Express Checkout Payment)', desc) and status == 'Completed':
            merchant = re.sub(r'^.*?(Payment|Bill User Payment):\s*', '', desc)
            pending_merchant = {'date': date, 'merchant': merchant, 'currency': cur, 'gross': num(gross)}
        elif 'Transfer to PayPal account' in desc and pending_merchant:
            out.append({**pending_merchant, 'aud': num(gross)}); pending_merchant = None
    return out

def tid(account, r, n):
    # Must match assignIds() in src/data/importers.ts: account:date:amount:nth-on-that-day
    return f"{account}:{r['date']}:{r['amount']:.2f}:{n}"

def main():
    out_path, specs = sys.argv[1], sys.argv[2:]
    txs, paypal_rows = [], []
    for spec in specs:
        account, fmt, path = spec.split(':', 2)
        text = open(path, encoding='utf-8', errors='ignore').read()
        if fmt == 'paypal':
            paypal_rows += paypal(text); continue
        rows = {'cba_summary': lambda: cba_summary(text), 'cba_statement': lambda: cba_statement(text, 2026),
                'macquarie': lambda: macquarie(text, 2026)}[fmt]()
        for r in rows:
            r['account'] = account
            r['desc'] = clean(r['desc'])
        txs += rows
    # De-duplicate overlapping statements: same account, date, amount and running balance.
    seen, uniq = {}, []
    for r in txs:
        k = (r['account'], r['date'], r['amount'], r.get('balance') if r.get('balance') is not None else r['desc'][:25])
        if k in seen:
            continue
        seen[k] = True; uniq.append(r)
    # Name the merchant behind PayPal debits.
    used = set()
    for r in uniq:
        if 'PAYPAL AUSTRALIA' in r['desc'] and r['amount'] < 0:
            for j, p in enumerate(paypal_rows):
                if j in used: continue
                if abs(p['aud'] + r['amount']) < 0.01 and abs(int(p['date'].replace('-', '')) - int(r['date'].replace('-', ''))) <= 6:
                    r['desc'] = f"PayPal: {p['merchant']}" + (f" (US${p['gross']*-1:.2f})" if p['currency'] == 'USD' else '')
                    used.add(j); break
    # PayPal debits from before the PayPal history: name them by an exact amount seen later (e.g. $38.45 = Pizza Pan).
    by_amount = {}
    for r in uniq:
        if r['desc'].startswith('PayPal: '):
            by_amount.setdefault(r['amount'], r['desc'].split(' (US$')[0])
    for r in uniq:
        if 'PAYPAL AUSTRALIA' in r['desc'] and r['amount'] in by_amount:
            r['desc'] = by_amount[r['amount']] + ' (matched by amount)'
    counts = {}
    for r in uniq:
        base = (r['account'], r['date'], r['amount'])
        counts[base] = counts.get(base, 0) + 1
        r['id'] = tid(r['account'], r, counts[base])
        r.pop('balance', None)
    uniq.sort(key=lambda r: (r['date'], r['account']))
    json.dump(uniq, open(out_path, 'w'), indent=1)
    print(f'{len(uniq)} transactions, {len(used)} PayPal debits named, {len(paypal_rows)-len(used)} PayPal rows unmatched')

if __name__ == '__main__':
    main()
