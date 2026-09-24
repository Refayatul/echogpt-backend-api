import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { MaxByteLength } from '../../common/validators/max-byte-length.validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'old-password' })
  @IsString()
  @MinLength(1)
  @MaxByteLength(72)
  currentPassword: string;

  @ApiProperty({ example: 'new-strong-password', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxByteLength(72)
  newPassword: string;
}