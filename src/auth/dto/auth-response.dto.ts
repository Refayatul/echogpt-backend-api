import { ApiProperty } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty({ example: '3f6b2c1a-4d5e-4f7a-8b9c-0d1e2f3a4b5c' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'Ada' })
  name: string;

  @ApiProperty({ example: 'USER', enum: ['USER', 'ADMIN'] })
  role: string;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'Short-lived JWT for the Authorization header' })
  accessToken: string;

  @ApiProperty({ description: 'Long-lived token used only with /auth/refresh' })
  refreshToken: string;

  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;

  @ApiProperty({
    required: false,
    description:
      'Email verification token. Returned only because no mailer is wired up; a real system would email it.',
  })
  emailVerificationToken?: string;
}

export class TokensResponseDto {
  @ApiProperty({ description: 'Short-lived JWT for the Authorization header' })
  accessToken: string;

  @ApiProperty({ description: 'Long-lived token used only with /auth/refresh' })
  refreshToken: string;
}