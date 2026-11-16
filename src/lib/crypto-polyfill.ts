import { CryptoDigestAlgorithm, digest, getRandomValues } from 'expo-crypto';

/**
 * React Native has no WebCrypto. Supabase's PKCE sign-in flow (used for email links) needs
 * crypto.getRandomValues for the secret code and crypto.subtle.digest to hash it with SHA-256.
 * Without them it falls back to Math.random and an unhashed ("plain") code.
 * This fills in only what is missing, so browsers keep their own WebCrypto.
 * Import it before creating the Supabase client.
 */
const DIGEST_ALGORITHMS: Record<string, CryptoDigestAlgorithm> = {
  'SHA-1': CryptoDigestAlgorithm.SHA1,
  'SHA-256': CryptoDigestAlgorithm.SHA256,
  'SHA-384': CryptoDigestAlgorithm.SHA384,
  'SHA-512': CryptoDigestAlgorithm.SHA512,
};

type MinimalCrypto = {
  getRandomValues?: typeof getRandomValues;
  subtle?: { digest: (algorithm: AlgorithmIdentifier, data: BufferSource) => Promise<ArrayBuffer> };
};

const globalScope = globalThis as { crypto?: MinimalCrypto };
const cryptoObject: MinimalCrypto = globalScope.crypto ?? {};

if (!cryptoObject.getRandomValues) {
  cryptoObject.getRandomValues = getRandomValues;
}

if (!cryptoObject.subtle) {
  cryptoObject.subtle = {
    digest: (algorithm, data) => {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      const expoAlgorithm = DIGEST_ALGORITHMS[name.toUpperCase()];
      if (!expoAlgorithm) return Promise.reject(new Error(`Unsupported digest algorithm: ${name}`));
      return digest(expoAlgorithm, data);
    },
  };
}

if (!globalScope.crypto) {
  globalScope.crypto = cryptoObject;
}
