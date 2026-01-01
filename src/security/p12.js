// src/security/p12.js
const fs = require('fs');
const forge = require('node-forge');
const path = require('path');
const config = require('../config/axisConfig');
const { X509Certificate, createPrivateKey } = require('crypto');

let cached = null;

function loadKeys() {
  if (cached) return cached;

  const p12Buffer = fs.readFileSync(path.resolve(config.jwe.clientP12Path));
  const p12Der = forge.util.createBuffer(p12Buffer.toString('binary'));
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, config.jwe.clientP12Password);

  let rsaPrivateKeyPem; // PKCS#1

  for (const safeContent of p12.safeContents) {
    for (const safeBag of safeContent.safeBags) {
      if (
        safeBag.type === forge.pki.oids.keyBag ||
        safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag
      ) {
        const pk = safeBag.key;
        rsaPrivateKeyPem = forge.pki.privateKeyToPem(pk); // "BEGIN RSA PRIVATE KEY"
        break;
      }
    }
    if (rsaPrivateKeyPem) break;
  }

  if (!rsaPrivateKeyPem) {
    throw new Error('Private key not found in client-axis.p12');
  }

  // Convert PKCS#1 -> PKCS#8 (BEGIN PRIVATE KEY) for jose
  const keyObj = createPrivateKey(rsaPrivateKeyPem);
  const privateKeyPemPkcs8 = keyObj
    .export({ format: 'pem', type: 'pkcs8' })
    .toString();

  // Axis public cert
  const axisCertPem = fs.readFileSync(path.resolve(config.jwe.axisPublicCertPath), 'utf8');
  const axisX509 = new X509Certificate(axisCertPem);
  const axisPublicKeyPem = axisX509.publicKey.export({ type: 'spki', format: 'pem' });

  cached = { privateKeyPemPkcs8, axisPublicKeyPem };
  return cached;
}

module.exports = { loadKeys };
