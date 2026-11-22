import { create } from "zustand";
import {
  generateECDHKeyPair,
  exportPublicKey,
  exportPrivateKey,
  importPrivateKey,
  wrapPrivateKey,
  unwrapPrivateKey,
} from "@/shared/lib/crypto";
import { api } from "@/shared/lib/api-client";

/**
 * E2EE key management.
 *
 * - One ECDH key pair per *user* (not per browser). The private key is backed
 *   up on the server wrapped with the user's password, so logging out, clearing
 *   storage or signing in on another device restores the same key pair and
 *   message history stays decryptable.
 * - The unwrapped key is cached in localStorage per user id for page reloads
 *   and removed on logout.
 */

interface StoredKeys {
  publicKeyJwk: string;
  privateKeyJwk: string;
}

const storageKey = (userId: string) => `aljo_chat_e2ee:${userId}`;
// Keys written by older versions of the app (not scoped to a user).
const LEGACY_PRIVATE_KEY = "aljo_chat_private_key";
const LEGACY_PUBLIC_KEY = "aljo_chat_public_key";

const readStoredKeys = (userId: string): StoredKeys | null => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as StoredKeys) : null;
  } catch {
    return null;
  }
};

const readLegacyKeys = (): StoredKeys | null => {
  const privateKeyJwk = localStorage.getItem(LEGACY_PRIVATE_KEY);
  const publicKeyJwk = localStorage.getItem(LEGACY_PUBLIC_KEY);
  return privateKeyJwk && publicKeyJwk ? { privateKeyJwk, publicKeyJwk } : null;
};

const writeStoredKeys = (userId: string, keys: StoredKeys) => {
  localStorage.setItem(storageKey(userId), JSON.stringify(keys));
  localStorage.removeItem(LEGACY_PRIVATE_KEY);
  localStorage.removeItem(LEGACY_PUBLIC_KEY);
};

export const clearAllStoredKeys = () => {
  if (typeof window === "undefined") return;
  Object.keys(localStorage)
    .filter((k) => k.startsWith("aljo_chat_e2ee:"))
    .forEach((k) => localStorage.removeItem(k));
  localStorage.removeItem(LEGACY_PRIVATE_KEY);
  localStorage.removeItem(LEGACY_PUBLIC_KEY);
};

/** Compare two public key JWK strings by their key material, ignoring field order. */
const samePublicKey = (a?: string | null, b?: string | null) => {
  if (!a || !b) return false;
  try {
    const ja = JSON.parse(a);
    const jb = JSON.parse(b);
    return ja.x === jb.x && ja.y === jb.y && ja.crv === jb.crv;
  } catch {
    return a === b;
  }
};

interface CryptoState {
  userId: string | null;
  publicKeyJwk: string | null;
  privateKey: CryptoKey | null;
  isInitialized: boolean;
  /** Load this user's keys from local storage (page reload). Returns false if none are available. */
  loadKeys: (userId: string) => Promise<boolean>;
  /** Restore or create this user's key pair at login/registration and sync the server backup. */
  setupKeys: (userId: string, password: string) => Promise<void>;
  reset: () => void;
}

export const useCryptoStore = create<CryptoState>((set, get) => ({
  userId: null,
  publicKeyJwk: null,
  privateKey: null,
  isInitialized: false,

  loadKeys: async (userId) => {
    if (get().isInitialized && get().userId === userId) return true;

    const keys = readStoredKeys(userId);
    if (!keys) return false;

    const privateKey = await importPrivateKey(keys.privateKeyJwk);
    set({ userId, publicKeyJwk: keys.publicKeyJwk, privateKey, isInitialized: true });
    return true;
  },

  setupKeys: async (userId, password) => {
    const res = await api.get("/users/me/key-backup");
    const { publicKey: serverPublicKey, keyBackup } = res.data.data as {
      publicKey: string | null;
      keyBackup: string | null;
    };

    let keys: StoredKeys | null = null;
    let needsUpload = false;

    // 1. Restore the existing key pair from the server backup.
    if (keyBackup && serverPublicKey) {
      try {
        keys = { privateKeyJwk: await unwrapPrivateKey(keyBackup, password), publicKeyJwk: serverPublicKey };
      } catch (err) {
        console.error("Failed to unlock E2EE key backup", err);
      }
    }

    // 2. No backup yet: keep a local key that matches the published public key
    //    (users from before key backups existed), so their history survives.
    if (!keys) {
      const local = readStoredKeys(userId) || readLegacyKeys();
      if (local && (!serverPublicKey || samePublicKey(local.publicKeyJwk, serverPublicKey))) {
        keys = local;
        needsUpload = true;
      }
    }

    // 3. Nothing to restore: create a fresh key pair.
    if (!keys) {
      if (keyBackup && serverPublicKey) {
        // A backup exists but could not be unlocked. Refuse to silently replace
        // the key, which would make the whole history unreadable.
        throw new Error("Could not unlock your encryption keys");
      }
      const pair = await generateECDHKeyPair();
      keys = {
        publicKeyJwk: await exportPublicKey(pair.publicKey),
        privateKeyJwk: await exportPrivateKey(pair.privateKey),
      };
      needsUpload = true;
    }

    if (needsUpload) {
      await api.patch("/users/public-key", {
        publicKey: keys.publicKeyJwk,
        keyBackup: await wrapPrivateKey(keys.privateKeyJwk, password),
      });
    }

    writeStoredKeys(userId, keys);
    set({
      userId,
      publicKeyJwk: keys.publicKeyJwk,
      privateKey: await importPrivateKey(keys.privateKeyJwk),
      isInitialized: true,
    });
  },

  reset: () => {
    clearAllStoredKeys();
    set({ userId: null, publicKeyJwk: null, privateKey: null, isInitialized: false });
  },
}));
