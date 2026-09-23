import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marks a route as reachable without a valid access token. The global
// JwtAuthGuard checks this metadata and skips authentication when present.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);