import { ApiProperty } from '@nestjs/swagger';
import { ProviderType } from '@prisma/client';

// The public shape of a provider. The encrypted API key is never included, so
// there is no way to read a stored key back through the API.
export class ProviderDto {
  @ApiProperty({ example: 'a1b2c3d4-0000-4000-8000-000000000001' })
  id: string;

  @ApiProperty({ enum: ProviderType, example: ProviderType.GEMINI })
  type: ProviderType;

  @ApiProperty({ example: 'My Gemini account' })
  label: string;

  @ApiProperty({ example: 'gemini-2.5-flash' })
  model: string;

  @ApiProperty({ example: true })
  isEnabled: boolean;

  @ApiProperty({ example: false })
  isDefault: boolean;

  @ApiProperty({ example: true, description: 'Whether a usable API key is stored' })
  hasApiKey: boolean;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-01-02T00:00:00.000Z' })
  updatedAt: Date;
}

export class ProviderHealthDto {
  @ApiProperty({ example: 'a1b2c3d4-0000-4000-8000-000000000001' })
  id: string;

  @ApiProperty({ enum: ProviderType })
  type: ProviderType;

  @ApiProperty({ example: 'UP', enum: ['UP', 'DOWN', 'DISABLED', 'NO_KEY'] })
  status: string;

  @ApiProperty({ example: 142, nullable: true, description: 'Round-trip time in ms' })
  latencyMs: number | null;

  @ApiProperty({ example: null, nullable: true, description: 'Reason when status is not UP' })
  detail: string | null;
}
