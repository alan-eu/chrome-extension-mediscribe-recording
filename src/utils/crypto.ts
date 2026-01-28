// OpenSSL-compatible AES-256-CBC encryption with PBKDF2
// Compatible with: openssl enc -aes-256-cbc -salt -pbkdf2 -k password

const PBKDF2_ITERATIONS = 10000;
const KEY_SIZE = 32; // 256 bits
const IV_SIZE = 16; // 128 bits

/**
 * Derives key and IV from password using PBKDF2 (OpenSSL compatible)
 */
async function deriveKeyAndIV(
  password: string,
  salt: Uint8Array
): Promise<{ key: CryptoKey; iv: Uint8Array }> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // Derive 48 bytes (32 for key + 16 for IV) using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    (KEY_SIZE + IV_SIZE) * 8 // bits
  );

  const derivedArray = new Uint8Array(derivedBits);
  const keyBytes = derivedArray.slice(0, KEY_SIZE);
  const iv = derivedArray.slice(KEY_SIZE, KEY_SIZE + IV_SIZE);

  // Import the derived key for AES
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-CBC', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return { key, iv };
}

/**
 * Encrypts data using AES-256-CBC with PBKDF2 (OpenSSL compatible)
 * Output format: Salted__[8-byte salt][encrypted data]
 */
export async function encryptData(
  data: ArrayBuffer,
  password: string
): Promise<ArrayBuffer> {
  console.log('[Crypto] Starting encryption, input size:', data.byteLength, 'bytes');

  // Generate random salt
  const salt = crypto.getRandomValues(new Uint8Array(8));
  console.log('[Crypto] Generated random salt (8 bytes)');

  // Derive key and IV from password
  console.log('[Crypto] Deriving key and IV using PBKDF2 (iterations:', PBKDF2_ITERATIONS + ')');
  const startTime = performance.now();
  const { key, iv } = await deriveKeyAndIV(password, salt);
  const derivationTime = (performance.now() - startTime).toFixed(2);
  console.log('[Crypto] Key derivation completed in', derivationTime, 'ms');

  // Encrypt data
  console.log('[Crypto] Encrypting data with AES-256-CBC');
  const encryptStartTime = performance.now();
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: iv.buffer as ArrayBuffer },
    key,
    data
  );
  const encryptTime = (performance.now() - encryptStartTime).toFixed(2);
  console.log('[Crypto] Encryption completed in', encryptTime, 'ms');

  // Create OpenSSL-compatible output: "Salted__" + salt + encrypted data
  const salted = new TextEncoder().encode('Salted__');
  const result = new Uint8Array(
    salted.length + salt.length + encryptedData.byteLength
  );
  result.set(salted, 0);
  result.set(salt, salted.length);
  result.set(new Uint8Array(encryptedData), salted.length + salt.length);

  console.log('[Crypto] Encryption complete, output size:', result.buffer.byteLength, 'bytes');
  console.log('[Crypto] Format: Salted__ + salt(8) + encrypted(' + encryptedData.byteLength + ')');

  return result.buffer;
}

/**
 * Decrypts OpenSSL-encrypted data (AES-256-CBC with PBKDF2)
 * Input format: Salted__[8-byte salt][encrypted data]
 */
export async function decryptData(
  encryptedData: ArrayBuffer,
  password: string
): Promise<ArrayBuffer> {
  console.log('[Crypto] Starting decryption, input size:', encryptedData.byteLength, 'bytes');

  const dataArray = new Uint8Array(encryptedData);

  // Verify "Salted__" header
  const saltedHeader = new TextDecoder().decode(dataArray.slice(0, 8));
  if (saltedHeader !== 'Salted__') {
    console.error('[Crypto] Invalid header, expected "Salted__" but got:', saltedHeader);
    throw new Error('Invalid encrypted data format');
  }
  console.log('[Crypto] Valid OpenSSL format detected');

  // Extract salt
  const salt = dataArray.slice(8, 16);
  console.log('[Crypto] Extracted salt (8 bytes)');

  // Extract encrypted data
  const encrypted = dataArray.slice(16);
  console.log('[Crypto] Encrypted payload size:', encrypted.length, 'bytes');

  // Derive key and IV from password
  console.log('[Crypto] Deriving key and IV using PBKDF2 (iterations:', PBKDF2_ITERATIONS + ')');
  const startTime = performance.now();
  const { key, iv } = await deriveKeyAndIV(password, salt);
  const derivationTime = (performance.now() - startTime).toFixed(2);
  console.log('[Crypto] Key derivation completed in', derivationTime, 'ms');

  // Decrypt data
  console.log('[Crypto] Decrypting data with AES-256-CBC');
  const decryptStartTime = performance.now();
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: iv.buffer as ArrayBuffer },
    key,
    encrypted
  );
  const decryptTime = (performance.now() - decryptStartTime).toFixed(2);
  console.log('[Crypto] Decryption completed in', decryptTime, 'ms');
  console.log('[Crypto] Decrypted data size:', decrypted.byteLength, 'bytes');

  return decrypted;
}
