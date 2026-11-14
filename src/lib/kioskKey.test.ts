import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forget, getOrCreateRecord, INSECURE_MESSAGE, kioskCryptoAvailable, loadRecord, sign, updateRecord } from './kioskKey';

/** A tiny in-memory IndexedDB: just enough for open / get / put / delete on one store. */
function fakeIndexedDB() {
  const data = new Map<string, unknown>();
  const request = <T,>(run: () => T) => {
    const r: { result?: T; error?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
    queueMicrotask(() => {
      r.result = run();
      r.onsuccess?.();
    });
    return r;
  };
  const store = {
    get: (k: string) => request(() => data.get(k)),
    put: (v: unknown, k: string) => request(() => (data.set(k, v), k)),
    delete: (k: string) => request(() => data.delete(k)),
  };
  const db = { objectStoreNames: { contains: () => true }, transaction: () => ({ objectStore: () => store }), close: () => undefined };
  return {
    data,
    open: () => {
      const r: { result: typeof db; onsuccess?: () => void; onupgradeneeded?: () => void } = { result: db };
      queueMicrotask(() => r.onsuccess?.());
      return r;
    },
  };
}

let idb: ReturnType<typeof fakeIndexedDB>;
beforeEach(() => {
  idb = fakeIndexedDB();
  vi.stubGlobal('indexedDB', idb);
});
afterEach(() => vi.unstubAllGlobals());

describe('kiosk key store', () => {
  it('creates a non-extractable key pair once and exports only the public JWK', async () => {
    const a = await getOrCreateRecord();
    expect(a.device_id).toBeNull();
    expect(a.keys.privateKey.extractable).toBe(false);
    expect(a.public_jwk).toMatchObject({ kty: 'EC', crv: 'P-256' });
    expect(a.public_jwk.x).toHaveLength(43);
    expect(a.public_jwk).not.toHaveProperty('d');
    const b = await getOrCreateRecord();
    expect(b.public_jwk).toEqual(a.public_jwk);
  });

  it('signs with the stored key as raw r||s (64 bytes) that verifies', async () => {
    const rec = await getOrCreateRecord();
    const msg = new TextEncoder().encode('nibm-kiosk-v1\ndev\nnonce');
    const sig = await sign(msg);
    expect(sig).toBeInstanceOf(Uint8Array);
    expect(sig.length).toBe(64);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, rec.keys.publicKey, sig as BufferSource, msg as BufferSource);
    expect(ok).toBe(true);
  });

  it('keeps device / pairing ids and forgets everything', async () => {
    await getOrCreateRecord();
    expect((await updateRecord({ pairing_id: 'p1' })).pairing_id).toBe('p1');
    expect((await loadRecord())?.pairing_id).toBe('p1');
    await updateRecord({ device_id: 'd1', pairing_id: null });
    expect((await loadRecord())?.device_id).toBe('d1');
    await forget();
    expect(await loadRecord()).toBeNull();
  });

  it('reports when WebCrypto / IndexedDB are missing (insecure origin)', () => {
    expect(kioskCryptoAvailable()).toBe(true);
    vi.stubGlobal('indexedDB', undefined);
    expect(kioskCryptoAvailable()).toBe(false);
    expect(INSECURE_MESSAGE).toBe('The kiosk needs a secure page (https or localhost).');
  });
});
