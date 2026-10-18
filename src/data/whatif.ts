/** How long until the home loan is effectively gone, with savings building up in a 100% offset.
 *  Interest is charged on the loan minus the offset; the loan is gone when the offset matches it.
 *  Same idea as the Loan Planner, kept simple: fixed rate, fixed repayment, a fixed amount added to the offset each month. */
export function payoff(loan: number, ratePct: number, repayment: number, offsetStart: number, extraPerMonth: number) {
  const r = ratePct / 100 / 12;
  let balance = loan, offset = offsetStart, interest = 0, months = 0;
  while (balance > 0 && offset < balance && months < 600) {
    const i = Math.max(0, balance - offset) * r;
    interest += i;
    balance = balance + i - repayment;
    offset += extraPerMonth;
    months++;
  }
  return { months, interest, finished: months < 600 };
}

export const yearsMonths = (n: number) => {
  const y = Math.floor(n / 12), m = n % 12;
  return [y ? `${y} year${y > 1 ? 's' : ''}` : '', m ? `${m} month${m > 1 ? 's' : ''}` : ''].filter(Boolean).join(' ') || '0 months';
};
