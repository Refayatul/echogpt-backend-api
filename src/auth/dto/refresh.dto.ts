import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'The refresh token issued at login or on the previous refresh' })
  @IsString()
  @MinLength(1)
  refreshToken: string;
}
