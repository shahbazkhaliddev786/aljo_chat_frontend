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

/** Whether we have ever seen an encryption key for this contact (used to refuse a silent downgrade). */
export function wasKeyKnown(myUserId: string, contactId: string): boolean {
  return !!read(myUserId)[contactId];
}

/** Remember the first key seen for a contact (trust on first use), without changing a known one. */
export function rememberContactKey(myUserId: string, contactId: string, fingerprint: string) {
  const data = read(myUserId);
  if (data[contactId]) return;
  data[contactId] = { fingerprint, verified: false };
  write(myUserId, data);
}
