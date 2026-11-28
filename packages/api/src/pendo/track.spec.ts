import axios from 'axios';
import { EventEmitter } from 'events';
import { logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import { trackEvent, trackOnSuccess, hasIssuedSession } from './track';

jest.mock('axios');
jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn() },
  getTenantId: jest.fn(() => undefined),
}));

const post = jest.mocked(axios.post);

beforeEach(() => {
  jest.clearAllMocks();
});

type FakeResponse = EventEmitter & {
  statusCode: number;
  cookies: string[];
  getHeader: (name: string) => string[] | undefined;
};

function createResponse(statusCode: number, cookies: string[] = []): FakeResponse {
  const res = new EventEmitter() as FakeResponse;
  res.statusCode = statusCode;
  res.cookies = cookies;
  res.getHeader = (name) => (name === 'Set-Cookie' ? res.cookies : undefined);
  return res;
}

describe('trackEvent', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env, PENDO_TRACK_EVENT_SECRET: 'test-key' };
    delete process.env.PENDO_DATA_HOST;
    post.mockResolvedValue({});
  });

  afterAll(() => {
    process.env = env;
  });

  it('does nothing until the integration key is set', () => {
    delete process.env.PENDO_TRACK_EVENT_SECRET;

    trackEvent('Signed in', { id: 'user-1' });

    expect(post).not.toHaveBeenCalled();
  });

  it('sends the event for the user and their tenant without empty properties', () => {
    trackEvent(
      'Signed in',
      { id: 'user-1', tenantId: 'tenant-1', role: 'USER' },
      { method: 'local', model: undefined },
    );

    expect(post).toHaveBeenCalledWith(
      'https://data.pendo-security.pendo-dev.com/data/track',
      expect.objectContaining({
        type: 'track',
        event: 'Signed in',
        visitorId: 'user-1',
        accountId: 'tenant-1',
        properties: { user_role: 'USER', method: 'local' },
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-pendo-integration-key': 'test-key' }),
      }),
    );
  });

  it('falls back to system ids when no user is known', () => {
    trackEvent('Signed in', null);

    expect(post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ visitorId: 'system', accountId: 'system' }),
      expect.any(Object),
    );
  });

  it('logs a failed delivery without the key', async () => {
    post.mockRejectedValue(new Error('network down'));

    trackEvent('Signed in', { id: 'user-1' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.warn).toHaveBeenCalledWith('[pendo] Failed to send "Signed in"', {
      type: 'Error',
    });
    expect(JSON.stringify(jest.mocked(logger.warn).mock.calls)).not.toContain('test-key');
  });
});

describe('trackOnSuccess', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env, PENDO_TRACK_EVENT_SECRET: 'test-key' };
    post.mockResolvedValue({});
  });

  afterAll(() => {
    process.env = env;
  });

  function run(statusCode: number, resolve?: () => Record<string, string> | null): void {
    const req = { user: { id: 'user-1' } } as unknown as Request;
    const res = createResponse(statusCode);
    const next = jest.fn();
    trackOnSuccess('Prompt created', resolve)(req, res as unknown as Response, next);
    expect(next).toHaveBeenCalled();
    res.emit('finish');
  }

  it('sends the event when the response succeeds', () => {
    run(201, () => ({ category: 'writing' }));

    expect(post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: 'Prompt created',
        visitorId: 'user-1',
        properties: { category: 'writing' },
      }),
      expect.any(Object),
    );
  });

  it('skips failed responses', () => {
    run(400);

    expect(post).not.toHaveBeenCalled();
  });

  it('skips a success the resolver does not count', () => {
    run(200, () => null);

    expect(post).not.toHaveBeenCalled();
  });
});

describe('hasIssuedSession', () => {
  it('is true only when a refresh token cookie was set', () => {
    const issued = createResponse(200, ['refreshToken=abc; Path=/; HttpOnly']);
    const cleared = createResponse(200, ['refreshToken=; Expires=Thu, 01 Jan 1970 00:00:00 GMT']);
    const none = createResponse(200);

    expect(hasIssuedSession(issued as unknown as Response)).toBe(true);
    expect(hasIssuedSession(cleared as unknown as Response)).toBe(false);
    expect(hasIssuedSession(none as unknown as Response)).toBe(false);
  });
});
