// Usage is bucketed per UTC calendar day so the limit resets at a predictable
// moment regardless of the caller's timezone. The stored value is always
// midnight UTC, which makes the (userId, date) unique index meaningful.
export function startOfUtcDay(date: Date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
