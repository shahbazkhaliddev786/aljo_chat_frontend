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

// ---------------------------------------------------------------------------
// Group messages: per-message key, wrapped for every member
//
// Each group message is encrypted with a fresh random AES-256-GCM key. That key
// is then wrapped (encrypted) once per member with the pairwise ECDH key
// between the sender and that member. Membership changes need no key
// rotation: new members simply receive no envelope for older messages.
// ---------------------------------------------------------------------------

export interface KeyEnvelope {
  key: string;
  iv: string;
}

async function importRawAesKey(raw: Uint8Array<ArrayBuffer>, usages: KeyUsage[]): Promise<CryptoKey> {
  return window.crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, usages);
}

async function aesEncrypt(key: CryptoKey, data: Uint8Array<ArrayBuffer>) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  return { ciphertext, iv };
}

export async function encryptGroupMessage(
  plainText: string,
  members: Array<{ id: string; publicKey: string }>,
  senderPrivateKey: CryptoKey
): Promise<{ ciphertext: string; iv: string; keyEnvelopes: string }> {
  const rawKey = window.crypto.getRandomValues(new Uint8Array(32));
  const contentKey = await importRawAesKey(rawKey, ["encrypt"]);
  const { ciphertext, iv } = await aesEncrypt(contentKey, new TextEncoder().encode(plainText));

  const envelopes: Record<string, KeyEnvelope> = {};
  for (const member of members) {
    const wrappingKey = await deriveSharedAesKey(senderPrivateKey, await importPublicKey(member.publicKey));
    const wrapped = await aesEncrypt(wrappingKey, rawKey);
    envelopes[member.id] = { key: toBase64(wrapped.ciphertext), iv: toBase64(wrapped.iv) };
  }

  return { ciphertext: toBase64(ciphertext), iv: toBase64(iv), keyEnvelopes: JSON.stringify(envelopes) };
}

export async function decryptGroupMessage(
  ciphertextBase64: string,
  ivBase64: string,
  keyEnvelopesJson: string,
  myUserId: string,
  myPrivateKey: CryptoKey,
  senderPublicKeyJwk: string
): Promise<string> {
  const envelope = (JSON.parse(keyEnvelopesJson) as Record<string, KeyEnvelope>)[myUserId];
  if (!envelope) throw new Error("This message was not encrypted for you");

  const wrappingKey = await deriveSharedAesKey(myPrivateKey, await importPublicKey(senderPublicKeyJwk));
  const rawKey = new Uint8Array(
    await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(envelope.iv) },
      wrappingKey,
      fromBase64(envelope.key)
    )
  );
  const contentKey = await importRawAesKey(rawKey, ["decrypt"]);
  const plain = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivBase64) },
    contentKey,
    fromBase64(ciphertextBase64)
  );
  return new TextDecoder().decode(plain);
}

// ---------------------------------------------------------------------------
// Attachments: the file is encrypted with its own random key before upload.
// The key travels inside the (end-to-end encrypted) message text.
// ---------------------------------------------------------------------------

export async function encryptFile(file: Blob): Promise<{ blob: Blob; key: string; iv: string }> {
  const rawKey = window.crypto.getRandomValues(new Uint8Array(32));
  const key = await importRawAesKey(rawKey, ["encrypt"]);
  const { ciphertext, iv } = await aesEncrypt(key, new Uint8Array(await file.arrayBuffer()));
  return { blob: new Blob([ciphertext], { type: "application/octet-stream" }), key: toBase64(rawKey), iv: toBase64(iv) };
}

export async function decryptFile(data: ArrayBuffer, keyBase64: string, ivBase64: string): Promise<ArrayBuffer> {
  const key = await importRawAesKey(fromBase64(keyBase64), ["decrypt"]);
  return window.crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(ivBase64) }, key, data);
}

// ---------------------------------------------------------------------------
// Safety numbers: both people see the same 60 digits iff they have each
// other's real keys (detects a server swapping keys in the middle).
// ---------------------------------------------------------------------------

const keyMaterial = (jwkString: string) => {
  const { x, y, crv } = JSON.parse(jwkString) as { x: string; y: string; crv: string };
  return `${crv}:${x}:${y}`;
};

export async function computeSafetyNumber(publicKeyA: string, publicKeyB: string): Promise<string> {
  const [first, second] = [keyMaterial(publicKeyA), keyMaterial(publicKeyB)].sort();
  const digest = new Uint8Array(
    await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(`aljo-safety-v1|${first}|${second}`))
  );
  // 12 groups of 5 digits from the first 30 bytes.
  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    const chunk = (digest[i * 2] << 16) | (digest[i * 2 + 1] << 8) | digest[24 + (i % 8)];
    groups.push(String(chunk % 100000).padStart(5, "0"));
  }
  return groups.join(" ");
}

/** Short, stable identifier of one public key (used to notice key changes). */
export async function keyFingerprint(publicKey: string): Promise<string> {
  const digest = new Uint8Array(
    await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(keyMaterial(publicKey)))
  );
  return toBase64(digest).slice(0, 22);
}
