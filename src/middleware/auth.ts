import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

function unauthorized(res: Response): void {
  res.status(401).json({
    jsonrpc: '2.0',
    error: {
      code: -32001,
      message: 'Unauthorized: invalid or missing Bearer token',
    },
    id: null,
  });
}

function tokensMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function createBearerAuthMiddleware(apiKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      unauthorized(res);
      return;
    }

    const token = authHeader.slice('Bearer '.length).trim();

    if (!token || !tokensMatch(token, apiKey)) {
      unauthorized(res);
      return;
    }

    next();
  };
}
