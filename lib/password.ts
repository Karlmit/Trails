import argon2 from 'argon2';

// AD-6: passwords are hashed and checked with argon2id -- never plaintext,
// never a hand-rolled scheme.

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
