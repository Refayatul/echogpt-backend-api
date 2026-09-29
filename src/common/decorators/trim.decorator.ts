import { Transform } from 'class-transformer';

// Trims a string field before validation runs, so a value of only spaces is
// caught by MinLength instead of being stored as a whitespace name. Pair it
// with @IsOptional() so an absent field stays absent rather than becoming ''.
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}
