import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

export class UpdateProfileDto {
  // name is optional so PATCH {} is a valid no-op, but when it IS supplied it
  // must carry at least one non-whitespace character. Trim runs before the
  // length checks, so {"name":"   "} is rejected with 400 rather than stored.
  @ApiProperty({ example: 'Ada', required: false })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;
}