const crypto = require('crypto');
const { callback } = require('../config/axisConfig');

function md5Key(keyString) {
  return crypto.createHash('md5').update(keyString, 'utf8').digest();
}

function decryptAes256Callback(encryptedBase64) {
  const key = md5Key(callback.aesKeyHex); // Axis shared secret

  const IV = Buffer.from([
    0x00, 0x01, 0x02, 0x03,
    0x04, 0x05, 0x06, 0x07,
    0x08, 0x09, 0x0A, 0x0B,
    0x0C, 0x0D, 0x0E, 0x0F
  ]);

  const encrypted = Buffer.from(encryptedBase64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, IV);
  let decrypted = decipher.update(encrypted, null, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = { decryptAes256Callback };
