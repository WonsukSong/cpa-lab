#!/usr/bin/env node
import { webcrypto, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const ALGORITHM = 'RSA-OAEP-256+A256GCM';
export const MAX_ENVELOPE_BYTES = 10 * 1024 * 1024;
const subtle = webcrypto.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const keyIdPattern = /^sha256:[a-f0-9]{64}$/;
const revisionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function record(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function decodeBase64(value) {
  if (typeof value !== 'string' || !value || value.length > MAX_ENVELOPE_BYTES ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Invalid encrypted question-bank encoding.');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new Error('Invalid encrypted question-bank encoding.');
  return bytes;
}

function decodeBase64Url(value) {
  if (typeof value !== 'string' || !value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Invalid RSA key encoding.');
  }
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value) throw new Error('Invalid RSA key encoding.');
  return bytes;
}

// RFC 8785 field order for this two-field public identifier is e, then n.
// Private key fields and incidental JWK metadata never enter the identifier.
export function keyIdForJwk(jwk) {
  if (!record(jwk) || jwk.kty !== 'RSA' || decodeBase64Url(jwk.n).length !== 384 ||
      jwk.e !== 'AQAB') throw new Error('Expected a 3072-bit RSA public key with exponent 65537.');
  return 'sha256:' + createHash('sha256').update(JSON.stringify({ e: jwk.e, n: jwk.n })).digest('hex');
}

export function validateBank(bank) {
  if (!record(bank) || bank.version !== 1 || !Array.isArray(bank.questions) ||
      typeof bank.revision !== 'string' || !revisionPattern.test(bank.revision)) {
    throw new Error('Unsupported question-bank schema.');
  }
  if (encoder.encode(JSON.stringify(bank)).length > MAX_ENVELOPE_BYTES) {
    throw new Error('Question bank exceeds the size limit.');
  }
  return bank;
}

function validateKey(container, privateKey = false) {
  if (!record(container) || container.version !== 1 || !keyIdPattern.test(container.keyId || '') ||
      keyIdForJwk(container.jwk) !== container.keyId) throw new Error('Invalid question-bank key.');
  if (privateKey) {
    for (const field of ['d', 'p', 'q', 'dp', 'dq', 'qi']) decodeBase64Url(container.jwk[field]);
  } else if (['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'].some(field => field in container.jwk)) {
    throw new Error('Encryption accepts a public key only.');
  }
  return container;
}

export function validateEnvelope(envelope) {
  if (!record(envelope) || envelope.version !== 1 || envelope.algorithm !== ALGORITHM ||
      !keyIdPattern.test(envelope.keyId || '') || typeof envelope.bankRevision !== 'string' ||
      !revisionPattern.test(envelope.bankRevision) ||
      encoder.encode(JSON.stringify(envelope)).length > MAX_ENVELOPE_BYTES) {
    throw new Error('Unsupported encrypted question bank.');
  }
  if (decodeBase64(envelope.iv).length !== 12 || decodeBase64(envelope.wrappedKey).length !== 384 ||
      decodeBase64(envelope.ciphertext).length < 16) throw new Error('Invalid encrypted question bank.');
  return envelope;
}

function authenticatedHeader(envelope) {
  return encoder.encode(JSON.stringify({ version: envelope.version, algorithm: envelope.algorithm,
    keyId: envelope.keyId, bankRevision: envelope.bankRevision }));
}

export async function generateKeys() {
  const pair = await subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 3072,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['wrapKey', 'unwrapKey']);
  const publicJwk = await subtle.exportKey('jwk', pair.publicKey);
  const privateJwk = await subtle.exportKey('jwk', pair.privateKey);
  const keyId = keyIdForJwk(publicJwk);
  return {
    publicKey: { version: 1, keyId, jwk: publicJwk },
    privateKey: { version: 1, keyId, jwk: privateJwk },
  };
}

export async function encryptBank(bank, publicKey) {
  validateBank(bank);
  validateKey(publicKey);
  const rsa = await subtle.importKey('jwk', publicKey.jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['wrapKey']);
  const aes = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const envelope = { version: 1, algorithm: ALGORITHM, keyId: publicKey.keyId, bankRevision: bank.revision };
  const plaintext = encoder.encode(JSON.stringify(bank));
  try {
    const [wrappedKey, ciphertext] = await Promise.all([
      subtle.wrapKey('raw', aes, rsa, { name: 'RSA-OAEP' }),
      subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128, additionalData: authenticatedHeader(envelope) }, aes, plaintext),
    ]);
    return validateEnvelope({ ...envelope, iv: Buffer.from(iv).toString('base64'),
      wrappedKey: Buffer.from(wrappedKey).toString('base64'), ciphertext: Buffer.from(ciphertext).toString('base64') });
  } finally {
    plaintext.fill(0);
  }
}

export async function decryptBank(envelope, privateKey) {
  validateEnvelope(envelope);
  validateKey(privateKey, true);
  if (envelope.keyId !== privateKey.keyId) throw new Error('Question-bank key does not match.');
  const rsa = await subtle.importKey('jwk', privateKey.jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['unwrapKey']);
  const aes = await subtle.unwrapKey('raw', decodeBase64(envelope.wrappedKey), rsa,
    { name: 'RSA-OAEP' }, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plaintext = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM',
    iv: decodeBase64(envelope.iv), tagLength: 128, additionalData: authenticatedHeader(envelope) },
  aes, decodeBase64(envelope.ciphertext)));
  try {
    const bank = validateBank(JSON.parse(decoder.decode(plaintext)));
    if (bank.revision !== envelope.bankRevision) throw new Error('Question-bank revision does not match.');
    return bank;
  } finally {
    plaintext.fill(0);
  }
}

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!/^--[a-z]+$/.test(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || args[i].slice(2) in result) {
      throw new Error('Expected --name PATH arguments.');
    }
    result[args[i].slice(2)] = resolve(args[i + 1]);
  }
  return result;
}

async function readJson(path) {
  const data = await readFile(path);
  if (data.length > MAX_ENVELOPE_BYTES) throw new Error('Input exceeds the size limit.');
  return JSON.parse(decoder.decode(data));
}

async function writeJson(path, data, privateFile = false) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: privateFile ? 0o600 : 0o644 });
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const options = parseArgs(rest);
  if (command === 'keygen' && options.public && options.private && Object.keys(options).length === 2) {
    if (options.public === options.private) throw new Error('Public and private paths must differ.');
    const keys = await generateKeys();
    // Write the private key first so a failed public write cannot leave an unpaired public key.
    await writeJson(options.private, keys.privateKey, true);
    await writeJson(options.public, keys.publicKey);
    process.stdout.write(JSON.stringify({ ok: true, keyId: keys.publicKey.keyId }) + '\n');
  } else if (command === 'encrypt' && options.input && options.key && options.output && Object.keys(options).length === 3) {
    const envelope = await encryptBank(await readJson(options.input), await readJson(options.key));
    await writeJson(options.output, envelope);
    process.stdout.write(JSON.stringify({ ok: true, keyId: envelope.keyId, bytes: Buffer.byteLength(JSON.stringify(envelope)) }) + '\n');
  } else if (command === 'verify' && options.input && options.private && options.bank && Object.keys(options).length === 3) {
    const bank = await decryptBank(await readJson(options.input), await readJson(options.private));
    if (!isDeepStrictEqual(bank, await readJson(options.bank))) throw new Error('Question-bank round-trip verification failed.');
    process.stdout.write(JSON.stringify({ ok: true, roundTrip: true, questions: bank.questions.length }) + '\n');
  } else {
    throw new Error('Usage: question-bank-crypto.mjs keygen --public PATH --private PATH | encrypt --input BANK.json --key PUBLIC.json --output ENC.json | verify --input ENC.json --private PRIVATE.json --bank BANK.json');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}
