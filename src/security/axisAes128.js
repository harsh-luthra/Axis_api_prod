// src/security/axisCallbackAes.js
const crypto = require('crypto');
const { callback } = require('../config/axisConfig');

// This MUST be the same key string they configured,
// e.g. "E795C6D2FA3C423598A0BA1D45EB8703" from their sample main(). [file:106]
// const AXIS_CALLBACK_KEY_STRING = process.env.AXIS_CALLBACK_KEY_STRING;
const AXIS_CALLBACK_KEY_STRING = (callback.aesKeyHex); // Axis shared secret

// from bank: key128: 7d320cf27dab0564a8de42f4ca9f00ca
const KEY_HEX = '7d320cf27dab0564a8de42f4ca9f00ca';

// fixed IV: 00 01 ... 0f (Axis sample) [file:106]
const IV = Buffer.from([
  0x00, 0x01, 0x02, 0x03,
  0x04, 0x05, 0x06, 0x07,
  0x08, 0x09, 0x0a, 0x0b,
  0x0c, 0x0d, 0x0e, 0x0f
]);

function decryptCallback(cipherTextB64) {
  const key = Buffer.from(KEY_HEX, 'hex');
  const cipherBytes = Buffer.from(cipherTextB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-128-cbc', key, IV);
  decipher.setAutoPadding(true);

  // BINARY decrypt to Buffer first
  const decryptedBuf = Buffer.concat([
    decipher.update(cipherBytes),
    decipher.final()
  ]);

  // Find first valid UTF8 JSON start (skip garbage bytes)
  let jsonStart = 0;
  for (let i = 0; i < decryptedBuf.length - 1; i++) {
    if (decryptedBuf[i] === 0x7B) { // '{'
      jsonStart = i;
      break;
    }
  }

  const jsonBytes = decryptedBuf.slice(jsonStart);
  const jsonStr = jsonBytes.toString('utf8');

  // Validate JSON
  const parsed = JSON.parse(jsonStr);
  return parsed;
}

// Optional: local test to match their sample encrypt/decrypt
function encryptAxisCallbackPlain(plaintext) {
  const key = getAxisAesKey();
  const cipher = crypto.createCipheriv('aes-128-cbc', key, AXIS_IV);
  cipher.setAutoPadding(true);

  let enc = cipher.update(plaintext, 'utf8', 'hex');
  enc += cipher.final('hex');
  return enc;
}

module.exports = {
  decryptCallback,
  encryptAxisCallbackPlain
};
