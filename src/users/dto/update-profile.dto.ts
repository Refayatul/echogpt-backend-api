import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ example: 'Ada', required: false })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;
}