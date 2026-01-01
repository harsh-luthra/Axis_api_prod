const { jwtEncrypt, CompactEncrypt, compactVerify, importPKCS8, importSPKI, SignJWT } = require('jose');
const { loadKeys } = require('./p12');
const { TextEncoder, TextDecoder } = require('util');

let cache = null;

async function loadJoseKeys() {
  if (cache) return cache;
  const { privateKeyPem, axisPublicKeyPem } = loadKeys();

  const privateKeyForSign = await importPKCS8(privateKeyPem, 'RS256');
  const privateKeyForDecrypt = await importPKCS8(privateKeyPem, 'RSA-OAEP-256');
  const publicKeyForEncrypt = await importSPKI(axisPublicKeyPem, 'RSA-OAEP-256');
  const publicKeyForVerify = await importSPKI(axisPublicKeyPem, 'RS256');

  cache = { privateKeyForSign, privateKeyForDecrypt, publicKeyForEncrypt, publicKeyForVerify };
  return cache;
}

// Encrypt + sign (client -> Axis)
async function jweEncryptAndSign(payloadObj) {
  const { privateKeyForSign, publicKeyForEncrypt } = await loadJoseKeys();
  const payloadJson = JSON.stringify(payloadObj);

  // JWE encrypt
  const enc = await new CompactEncrypt(new TextEncoder().encode(payloadJson))
    .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
    .encrypt(publicKeyForEncrypt);

  // JWS sign (RS256 of encrypted string)
  const signed = await new SignJWT({ jwe: enc })
    .setProtectedHeader({ alg: 'RS256' })
    .sign(privateKeyForSign);

  return signed; // compact JWS string
}

// Verify + decrypt (Axis -> client)
async function jweVerifyAndDecrypt(jwsCompact) {
  const { privateKeyForDecrypt, publicKeyForVerify } = await loadJoseKeys();

  // verify JWS
  const { payload } = await compactVerify(jwsCompact, publicKeyForVerify);
  const { jwe } = JSON.parse(new TextDecoder().decode(payload));
  if (!jwe) throw new Error('JWS payload missing jwe field');

  // decrypt JWE
  const { decryptCompact } = await import('jose');
  const decrypted = await decryptCompact(jwe, privateKeyForDecrypt);
  const json = JSON.parse(new TextDecoder().decode(decrypted.plaintext));
  return json;
}

module.exports = {
  jweEncryptAndSign,
  jweVerifyAndDecrypt
};
