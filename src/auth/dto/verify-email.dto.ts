import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ description: 'The verification token returned by register' })
  @IsString()
  @MinLength(1)
  token: string;
}