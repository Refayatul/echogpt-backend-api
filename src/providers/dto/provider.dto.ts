import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ProviderType } from '@prisma/client';

export class CreateProviderDto {
  @ApiProperty({ enum: ProviderType, example: ProviderType.GEMINI })
  @IsEnum(ProviderType)
  type: ProviderType;

  @ApiProperty({ example: 'My Gemini account' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  label: string;

  @ApiProperty({ example: 'gemini-2.5-flash', description: 'Model name passed to the provider' })
  @IsString()
  @MaxLength(80)
  model: string;

  @ApiProperty({ example: 'AIza...', description: 'Stored encrypted, never returned' })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  apiKey: string;

  @ApiProperty({ example: true, required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateProviderDto {
  @ApiProperty({ example: 'Renamed provider', required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  label?: string;

  @ApiProperty({ example: 'gemini-2.5-flash', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @ApiProperty({ example: 'AIza...new-key', required: false, description: 'Replaces the stored key' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  apiKey?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
