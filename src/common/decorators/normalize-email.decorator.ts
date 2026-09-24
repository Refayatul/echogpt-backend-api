import { Transform } from 'class-transformer';

// Emails are stored and looked up in lowercase with no surrounding spaces, so
// "A@x.com" and "a@x.com" are the same account.
export function NormalizeEmail(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
}