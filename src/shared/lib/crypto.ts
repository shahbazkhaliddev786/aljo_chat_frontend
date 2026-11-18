// Web Crypto API Engine for End-to-End Encryption (E2EE) using ECDH (P-256) & AES-GCM (256-bit)

export async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return window.crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveKey", "deriveBits"]
  );
}

export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey("jwk", publicKey);
  return JSON.stringify(exported);
}

export async function importPublicKey(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return window.crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    []
  );
}

export async function exportPrivateKey(privateKey: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey("jwk", privateKey);
  return JSON.stringify(exported);
}

export async function importPrivateKey(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return window.crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveKey", "deriveBits"]
  );
}

async function deriveSharedAesKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<CryptoKey> {
  return window.crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: publicKey,
    },
    privateKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptE2EEMessage(
  plainText: string,
  recipientPublicKeyJwk: string,
  senderPrivateKey: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const recipientPublicKey = await importPublicKey(recipientPublicKeyJwk);
  const sharedKey = await deriveSharedAesKey(senderPrivateKey, recipientPublicKey);

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encodedText = encoder.encode(plainText);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    sharedKey,
    encodedText
  );

  const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
  const ivBase64 = btoa(String.fromCharCode(...iv));

  return {
    ciphertext: ciphertextBase64,
    iv: ivBase64,
  };
}

export async function decryptE2EEMessage(
  ciphertextBase64: string,
  ivBase64: string,
  senderPublicKeyJwk: string,
  recipientPrivateKey: CryptoKey
): Promise<string> {
  const senderPublicKey = await importPublicKey(senderPublicKeyJwk);
  const sharedKey = await deriveSharedAesKey(recipientPrivateKey, senderPublicKey);

  const ciphertextUint8 = Uint8Array.from(atob(ciphertextBase64), (c) => c.charCodeAt(0));
  const ivUint8 = Uint8Array.from(atob(ivBase64), (c) => c.charCodeAt(0));

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: ivUint8,
    },
    sharedKey,
    ciphertextUint8
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

// ---------------------------------------------------------------------------
// Password-wrapped private key backup
//
// The private key is encrypted in the browser with a key derived from the
// user's password (PBKDF2-SHA256 → AES-GCM) and only the wrapped blob is
// stored on the server. This lets the same key pair be restored after logout
// or on another device, so message history stays decryptable.
// ---------------------------------------------------------------------------

const BACKUP_VERSION = 1;
const PBKDF2_ITERATIONS = 310_000;

interface KeyBackupV1 {
  v: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

async function deriveBackupKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Encrypt a private key JWK with the password. Returns a JSON string safe to store server-side. */
export async function wrapPrivateKey(privateKeyJwk: string, password: string): Promise<string> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(password, salt, PBKDF2_ITERATIONS);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(privateKeyJwk)
  );

  const backup: KeyBackupV1 = {
    v: BACKUP_VERSION,
    kdf: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(backup);
}

/** Decrypt a backup produced by wrapPrivateKey. Throws if the password is wrong or the blob is invalid. */
export async function unwrapPrivateKey(backupJson: string, password: string): Promise<string> {
  const backup = JSON.parse(backupJson) as KeyBackupV1;
  if (backup.v !== BACKUP_VERSION) throw new Error("Unsupported key backup version");

  const key = await deriveBackupKey(password, fromBase64(backup.salt), backup.iterations);
  const plaintext = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(backup.iv) },
    key,
    fromBase64(backup.ciphertext)
  );
  return new TextDecoder().decode(plaintext);
}
