/**
 * Trust-on-first-use record of contacts' encryption keys (per signed-in user,
 * stored locally). Lets the UI warn when a contact's key changes and remember
 * which contacts were verified with a safety number.
 */
interface KnownKey {
  fingerprint: string;
  verified: boolean;
}

const storageKey = (myUserId: string) => `aljo_chat_known_keys:${myUserId}`;

const read = (myUserId: string): Record<string, KnownKey> => {
  try {
    return JSON.parse(localStorage.getItem(storageKey(myUserId)) || "{}");
  } catch {
    return {};
  }
};

const write = (myUserId: string, data: Record<string, KnownKey>) => {
  try {
    localStorage.setItem(storageKey(myUserId), JSON.stringify(data));
  } catch {
    /* storage unavailable: warnings simply won't persist */
  }
};

export type KeyTrust = "new" | "same" | "verified" | "changed";

/** Compare a contact's current key with what we saw before. First sighting is remembered. */
export function checkContactKey(myUserId: string, contactId: string, fingerprint: string): KeyTrust {
  const data = read(myUserId);
  const known = data[contactId];
  if (!known) {
    data[contactId] = { fingerprint, verified: false };
    write(myUserId, data);
    return "new";
  }
  if (known.fingerprint !== fingerprint) return "changed";
  return known.verified ? "verified" : "same";
}

/** Accept the contact's current key (optionally as verified via safety number). */
export function trustContactKey(myUserId: string, contactId: string, fingerprint: string, verified: boolean) {
  const data = read(myUserId);
  data[contactId] = { fingerprint, verified };
  write(myUserId, data);
}
