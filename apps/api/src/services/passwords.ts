import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Account passwords (for Triagedesk itself, never a mailbox password). Stored only as a salted scrypt hash.
const scrypt = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))));

const N = 16384;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: 8, p: 1 });
  return `scrypt$${N}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: 8, p: 1 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** What a new password must be: long enough, not trivially guessable. */
export function passwordProblem(password: string, email = ""): string | null {
  if (password.length < 8) return "use at least 8 characters";
  if (password.length > 200) return "use at most 200 characters";
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) return "mix letters and numbers";
  const local = email.split("@")[0]?.toLowerCase();
  if (local && local.length > 2 && password.toLowerCase().includes(local)) return "do not include your email name";
  if (/^(password|12345678|qwerty|letmein|welcome)/i.test(password)) return "choose something less common";
  return null;
}
