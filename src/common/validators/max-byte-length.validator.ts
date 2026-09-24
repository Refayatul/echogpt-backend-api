import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// bcrypt only looks at the first 72 BYTES of a password, so a longer one would
// be silently truncated. We reject anything over 72 bytes instead. The check is
// in bytes, not characters, because multi-byte characters count for more.
export function MaxByteLength(
  max: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'maxByteLength',
      target: object.constructor,
      propertyName,
      constraints: [max],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (typeof value !== 'string') {
            return false;
          }
          const [limit] = args.constraints as [number];
          return Buffer.byteLength(value, 'utf8') <= limit;
        },
        defaultMessage(args: ValidationArguments): string {
          const [limit] = args.constraints as [number];
          return `${args.property} must be at most ${limit} bytes (bcrypt limit)`;
        },
      },
    });
  };
}