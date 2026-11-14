/**
 * Kiosk device key store (CONTRACT §S21). IndexedDB `nibm-kiosk` / store `device`, one record:
 * `{ device_id | null, pairing_id | null, keys: CryptoKeyPair, public_jwk }`.
 * The private key is generated non-extractable, so it can sign but never be read out.
 */

export interface KioskRecord {
  device_id: string | null;
  pairing_id: string | null;
  keys: CryptoKeyPair;
  public_jwk: JsonWebKey;
}

const DB = 'nibm-kiosk';
const STORE = 'device';
const KEY = 'device';
const ALGO = { name: 'ECDSA', namedCurve: 'P-256' } as const;

/** WebCrypto + IndexedDB are only available on https or localhost. */
export const kioskCryptoAvailable = (): boolean =>
  typeof crypto !== 'undefined' && !!crypto.subtle && typeof indexedDB !== 'undefined';

export const INSECURE_MESSAGE = 'The kiosk needs a secure page (https or localhost).';

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('indexeddb'));
  });

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('indexeddb'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await req(run(db.transaction(STORE, mode).objectStore(STORE)));
  } finally {
    db.close();
  }
}

export async function loadRecord(): Promise<KioskRecord | null> {
  return ((await withStore('readonly', (s) => s.get(KEY))) as KioskRecord | undefined) ?? null;
}

export async function saveRecord(rec: KioskRecord): Promise<void> {
  await withStore('readwrite', (s) => s.put(rec, KEY));
}

/** Stored record, or a fresh one with a new non-extractable key pair. */
export async function getOrCreateRecord(): Promise<KioskRecord> {
  const found = await loadRecord();
  if (found) return found;
  const keys = (await crypto.subtle.generateKey(ALGO, false, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
  const rec: KioskRecord = {
    device_id: null,
    pairing_id: null,
    keys,
    public_jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
  };
  await saveRecord(rec);
  return rec;
}

export async function updateRecord(patch: Partial<Pick<KioskRecord, 'device_id' | 'pairing_id'>>): Promise<KioskRecord> {
  const rec = { ...(await getOrCreateRecord()), ...patch };
  await saveRecord(rec);
  return rec;
}

/** Sign with the stored private key. ECDSA P-256 / SHA-256, raw 64-byte r‖s. */
export async function sign(message: Uint8Array): Promise<Uint8Array> {
  const rec = await getOrCreateRecord();
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, rec.keys.privateKey, message as BufferSource);
  return new Uint8Array(sig);
}

/** Drop the key and the device id (back to pairing). */
export async function forget(): Promise<void> {
  await withStore('readwrite', (s) => s.delete(KEY));
}
