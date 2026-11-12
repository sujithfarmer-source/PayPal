/** Contact directory + phone-number helpers (safe on server and client). */

export interface Contact {
  name: string;
  /** Stored in national 10-digit form; displayed grouped. */
  phone: string;
}

/** Demo address book. Each entry is payable by name or by number. */
export const CONTACTS: Contact[] = [
  { name: "Nina Patel", phone: "9876543210" },
  { name: "Marcus Lee", phone: "9812345678" },
  { name: "Acme Corp", phone: "8800112233" },
  { name: "Jane Cooper", phone: "9123456789" },
  { name: "Ravi Kumar", phone: "9900887766" },
];

/** Keep only digits, dropping +91 / 0 trunk prefixes. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/** True when the text is meant as a phone number rather than a name.
 *  Any letter-free string containing digits counts, so a too-short number
 *  ("98765") is reported as an invalid number instead of being accepted as
 *  a name. */
export function looksLikePhone(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  // Digits, spaces, dashes, parens and a leading + only.
  if (!/^\+?[\d\s()-]+$/.test(trimmed)) return false;
  return normalizePhone(trimmed).length > 0;
}

/** Valid Indian mobile: 10 digits starting 6-9. */
export function isValidPhone(input: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizePhone(input));
}

/** "9876543210" -> "+91 98765 43210" */
export function formatPhone(input: string): string {
  const d = normalizePhone(input);
  if (d.length !== 10) return input.trim();
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
}

export function findContactByPhone(input: string): Contact | undefined {
  const d = normalizePhone(input);
  return CONTACTS.find((c) => c.phone === d);
}

export function findContactByName(name: string): Contact | undefined {
  const n = name.trim().toLowerCase();
  return CONTACTS.find((c) => c.name.toLowerCase() === n);
}

/** Fuzzy search across names and numbers for the recipient combobox. */
export function searchContacts(query: string): Contact[] {
  const q = query.trim().toLowerCase();
  if (!q) return CONTACTS;
  const digits = q.replace(/\D/g, "");
  return CONTACTS.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (digits.length > 0 && c.phone.includes(digits)),
  );
}

export interface ResolvedRecipient {
  /** Display name: contact name, or the formatted number for unknown payees. */
  name: string;
  /** National-format digits when paying a number, else null. */
  phone: string | null;
}

/**
 * Turn whatever the user typed into a display name + phone.
 * Accepts: a known contact's name, a known number (resolves to its name),
 * or an unknown number (becomes a number-only payee).
 */
export function resolveRecipient(input: string): ResolvedRecipient | null {
  const raw = input.trim();
  if (!raw) return null;

  if (looksLikePhone(raw)) {
    if (!isValidPhone(raw)) return null;
    const phone = normalizePhone(raw);
    const known = findContactByPhone(phone);
    return { name: known?.name ?? formatPhone(phone), phone };
  }

  if (raw.length < 2) return null;
  const known = findContactByName(raw);
  return { name: known?.name ?? raw, phone: known?.phone ?? null };
}
