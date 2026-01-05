// src/security/aesCallback.js
const crypto = require('crypto');
const { callback } = require('../config/axisConfig');

const ALGO = 'aes-256-cbc';  // Changed to AES-256[file:1]

function hexToBytes(hex) {
  return Buffer.from(hex, 'hex');
}

function decryptAes256Callback(encryptedBase64) {
  // Key must be exactly 32 bytes (256 bits) for AES-256
  const key = hexToBytes(callback.aesKeyHex);  // Update config.aesKeyHex to 64 hex chars (32 bytes)
  
  if (key.length !== 32) {
    throw new Error(`AES-256 key must be 32 bytes, got ${key.length}`);
  }

  const allBytes = Buffer.from(encryptedBase64, 'base64');
  
  // FIXED IV: Axis callback uses specific fixed IV (no dynamic IV per docs)[file:1][file:7]
  // From Checksum-Logic.docx sample: 0x8E,0x12,0x39,0x9C,0x07,0x72,0x6F,0x5A repeated
  const FIXED_IV = Buffer.from([
    0x8E, 0x12, 0x39, 0x9C, 0x07, 0x72, 0x6F, 0x5A, 
    0x8E, 0x12, 0x39, 0x9C, 0x07, 0x72, 0x6F, 0x5A
  ]);

  const decipher = crypto.createDecipheriv(ALGO, key, FIXED_IV);
  let decrypted = decipher.update(allBytes, null, 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

module.exports = {
  decryptAes256Callback
};
