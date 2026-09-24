import { ApiProperty } from '@nestjs/swagger';

// The shape returned by the profile endpoints. Password hashes and token
// hashes are never part of it.
export class ProfileDto {
  @ApiProperty({ example: '3f6b2c1a-4d5e-4f7a-8b9c-0d1e2f3a4b5c' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'Ada' })
  name: string;

  @ApiProperty({ example: 'USER', enum: ['USER', 'ADMIN'] })
  role: string;

  @ApiProperty({ example: false })
  emailVerified: boolean;

  @ApiProperty({ example: true })
  isDisabled: boolean;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: Date;
}