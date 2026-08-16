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
