import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  RequestTimeoutException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { UpstreamFailure } from './adapter.interface';

// Every outbound provider call is given a hard timeout so one slow upstream
// cannot hold an HTTP worker open indefinitely.
export const UPSTREAM_TIMEOUT_MS = 30_000;

// Upstream bodies can echo back the request (including the API key in rare
// misconfiguration cases), so the message shown to the caller is always a
// fixed string derived from the status code and never the raw body.
export function translateUpstreamError(
  status: number,
  provider: string,
): HttpException {
  const failure = classifyStatus(status);
  switch (failure) {
    case 'unauthorized':
      return new UnauthorizedException(`${provider} rejected the API key`);
    case 'forbidden':
      return new ForbiddenException(`${provider} denied access for this key`);
    case 'rate_limited':
      return new HttpException(
        `${provider} rate limit reached, please retry later`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    case 'bad_request':
      return new BadRequestException(`${provider} rejected the request`);
    case 'unavailable':
      return new ServiceUnavailableException(`${provider} is currently unavailable`);
    default:
      return new BadGatewayException(`${provider} returned an unexpected response`);
  }
}

function classifyStatus(status: number): UpstreamFailure {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate_limited';
  if (status === 400 || (status >= 400 && status < 500)) return 'bad_request';
  if (status >= 500) return 'unavailable';
  return 'unknown';
}

// Wraps fetch so a network failure, a timeout or a non-2xx status all surface
// as a clean Nest exception. No URL, header or body is ever logged, because all
// three can contain the provider API key.
export async function fetchUpstream(
  url: string,
  init: RequestInit,
  provider: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new RequestTimeoutException(`${provider} did not respond in time`);
    }
    throw new BadGatewayException(`Could not reach ${provider}`);
  }

  if (!response.ok) {
    throw translateUpstreamError(response.status, provider);
  }

  try {
    return await response.json();
  } catch {
    throw new BadGatewayException(`${provider} returned a malformed response`);
  }
}
