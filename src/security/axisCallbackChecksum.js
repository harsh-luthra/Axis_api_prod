const crypto = require('crypto');

function normalize(val) {
  if (val === null || val === undefined || val === 'null') return '';
  return String(val);
}

function buildChecksumString(obj, sb) {
  if (Array.isArray(obj)) {
    obj.forEach(item => buildChecksumString(item, sb));
    return;
  }

  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      if (key === 'checksum') continue;
      buildChecksumString(obj[key], sb);
    }
    return;
  }

  sb.push(normalize(obj));
}

function generateAxisChecksum(data) {
  const sb = [];
  buildChecksumString(data, sb);
  const finalStr = sb.join('');

  return crypto
    .createHash('md5')
    .update(finalStr, 'utf8')
    .digest('hex');
}

function verifyAxisCallbackChecksum(data) {
  if (!data.checksum) return false;
  const expected = generateAxisChecksum(data);
  return expected === data.checksum;
}

module.exports = {
  verifyAxisCallbackChecksum
};
