import { create } from "zustand";
import {
  generateECDHKeyPair,
  exportPublicKey,
  exportPrivateKey,
  importPrivateKey,
} from "@/shared/lib/crypto";

interface CryptoState {
  keyPair: CryptoKeyPair | null;
  publicKeyJwk: string | null;
  privateKey: CryptoKey | null;
  isInitialized: boolean;
  initializeCrypto: () => Promise<string>;
}

export const useCryptoStore = create<CryptoState>((set, get) => ({
  keyPair: null,
  publicKeyJwk: null,
  privateKey: null,
  isInitialized: false,

  initializeCrypto: async () => {
    if (get().isInitialized && get().publicKeyJwk) {
      return get().publicKeyJwk!;
    }

    try {
      const storedPrivKey = localStorage.getItem("aljo_chat_private_key");
      const storedPubKey = localStorage.getItem("aljo_chat_public_key");

      if (storedPrivKey && storedPubKey) {
        const privateKey = await importPrivateKey(storedPrivKey);
        set({
          publicKeyJwk: storedPubKey,
          privateKey,
          isInitialized: true,
        });
        return storedPubKey;
      }

      // Generate new ECDH P-256 Keypair
      const keyPair = await generateECDHKeyPair();
      const pubKeyJwk = await exportPublicKey(keyPair.publicKey);
      const privKeyJwk = await exportPrivateKey(keyPair.privateKey);

      localStorage.setItem("aljo_chat_public_key", pubKeyJwk);
      localStorage.setItem("aljo_chat_private_key", privKeyJwk);

      set({
        keyPair,
        publicKeyJwk: pubKeyJwk,
        privateKey: keyPair.privateKey,
        isInitialized: true,
      });

      return pubKeyJwk;
    } catch (err) {
      console.error("Failed to initialize E2EE Crypto Engine", err);
      throw err;
    }
  },
}));
