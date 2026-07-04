import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchApi, ApiError } from './client';

function stubFetch(res: { ok: boolean; status: number; statusText?: string; json?: () => Promise<unknown> }) {
  const fn = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () => res as unknown as Response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchApi', () => {
  it('returns undefined for 204 without reading the body', async () => {
    const json = vi.fn();
    stubFetch({ ok: true, status: 204, json });
    await expect(fetchApi('/x')).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it('parses the JSON body on a 200', async () => {
    stubFetch({ ok: true, status: 200, json: async () => ({ a: 1 }) });
    await expect(fetchApi('/x')).resolves.toEqual({ a: 1 });
  });

  it('throws an ApiError built from the {error:{message,code}} envelope', async () => {
    stubFetch({ ok: false, status: 409, statusText: 'Conflict', json: async () => ({ error: { code: 'DUP', message: 'already there' } }) });
    const err = await fetchApi('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'DUP', message: 'already there' });
  });

  it('falls back to statusText when the error body is not JSON', async () => {
    stubFetch({ ok: false, status: 500, statusText: 'Server Error', json: async () => { throw new Error('not json'); } });
    await expect(fetchApi('/x')).rejects.toMatchObject({ status: 500, code: 'ERROR', message: 'Server Error' });
  });

  it('sends credentials + X-Requested-With, and Content-Type only when there is a body', async () => {
    const fn = stubFetch({ ok: true, status: 200, json: async () => ({}) });

    await fetchApi('/x');
    expect(fn).toHaveBeenLastCalledWith('/x', expect.objectContaining({ credentials: 'include' }));
    const getHeaders = (fn.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(getHeaders['X-Requested-With']).toBe('XMLHttpRequest');
    expect(getHeaders['Content-Type']).toBeUndefined();

    await fetchApi('/y', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    const postHeaders = (fn.mock.calls[1]![1] as RequestInit).headers as Record<string, string>;
    expect(postHeaders['Content-Type']).toBe('application/json');
  });
});
