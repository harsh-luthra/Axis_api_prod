// src/security/jweJws.js
const fs = require('fs');
const path = require('path');
const {
  CompactEncrypt,
  CompactSign,
  compactDecrypt,
  compactVerify,
  importPKCS8,
  importSPKI
} = require('jose');
const { TextEncoder, TextDecoder } = require('util');

let cache = null;

async function loadJoseKeys() {
  if (cache) return cache;

  // Load your own private key PEM directly
  const rawPrivatePem = fs.readFileSync(
    path.resolve(__dirname, '../../certs/client_private.key'),
    'utf8'
  );

  // If it's PKCS#1 (BEGIN RSA PRIVATE KEY), convert to PKCS#8 using node:crypto
  let privateKeyPemPkcs8 = rawPrivatePem;
  if (rawPrivatePem.includes('BEGIN RSA PRIVATE KEY')) {
    const { createPrivateKey } = require('crypto');
    const keyObj = createPrivateKey(rawPrivatePem);
    privateKeyPemPkcs8 = keyObj
      .export({ format: 'pem', type: 'pkcs8' })
      .toString();
  }

  // Axis public cert -> public key for encryption/verify
  const axisCertPem = fs.readFileSync(
    path.resolve(__dirname, '../../certs/rgw.jwejws.axisb.com-sscert.txt'),
    'utf8'
  );
  const { X509Certificate } = require('crypto');
  const axisX509 = new X509Certificate(axisCertPem);
  const axisPublicKeyPem = axisX509.publicKey.export({ type: 'spki', format: 'pem' });

  const privateKeyForSign = await importPKCS8(privateKeyPemPkcs8, 'RS256');
  const privateKeyForDecrypt = await importPKCS8(privateKeyPemPkcs8, 'RSA-OAEP-256');
  const publicKeyForEncrypt = await importSPKI(axisPublicKeyPem, 'RSA-OAEP-256');
  const publicKeyForVerify = await importSPKI(axisPublicKeyPem, 'RS256');

  cache = { privateKeyForSign, privateKeyForDecrypt, publicKeyForEncrypt, publicKeyForVerify };
  return cache;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

async function jweEncryptAndSign(payloadObj) {
  const { privateKeyForSign, publicKeyForEncrypt } = await loadJoseKeys();
  const enc = new TextEncoder();

  const payloadJson = JSON.stringify(payloadObj);

  // console.log('PayLoad Json:', payloadJson);  

  // JWE
  const jweCompact = await new CompactEncrypt(enc.encode(payloadJson))
    .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
    .encrypt(publicKeyForEncrypt);

  // console.log('JWE compact:', jweCompact);

  // JWS: sign RAW JWE string as bytes
  const jwsCompact = await new CompactSign(enc.encode(jweCompact))
    .setProtectedHeader({ alg: 'RS256', cty: 'JWE' })
    .sign(privateKeyForSign);

  // console.log('JWS compact:', jwsCompact);
  return jwsCompact;
}

// ? FIXED DECRYPT
async function jweVerifyAndDecrypt(jwsCompact) {
  const { privateKeyForDecrypt, publicKeyForVerify } = await loadJoseKeys();

  // 1. JWS Verify ? Extract JWE
  const { payload } = await compactVerify(jwsCompact, publicKeyForVerify);
  const jweCompact = dec.decode(payload);
  // console.log('?? Extracted JWE:', jweCompact);

  // 2. JWE Decrypt ? CORRECT FUNCTION!
  const { plaintext, protectedHeader } = await compactDecrypt(jweCompact, privateKeyForDecrypt);
  
  // console.log('? Header:', protectedHeader);
  return JSON.parse(dec.decode(plaintext));
}

module.exports = {
  jweEncryptAndSign,
  jweVerifyAndDecrypt
};
