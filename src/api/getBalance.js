// src/api/getBalance.js
const config = require('../config/axisConfig');
const { jweEncryptAndSign, jweVerifyAndDecrypt } = require('../security/jweJws');
const { generateChecksumAxis } = require('../security/checksumAxis');
const { axisRequest, baseHeaders } = require('../http/axisHttp');
const db = require('../db/payouts');

function buildBalanceData(corpAccNum) {
  const data = {
    corpAccNum,
    channelId: config.channelId,
    corpCode: config.corpCode,
    checksum: ''
  };
  //   data.checksum = generateChecksum(data);
  data.checksum = generateChecksumAxis(data);
  return { Data: data };
}

async function getBalance(mid) {
  const merchantId = mid;  // For testing, assume merchant ID 1
  const corpAccNum = '925020023195501'
  const url = config.urls[config.env].getBalance;
  const headers = baseHeaders();
  const body = buildBalanceData(corpAccNum);

  console.log('Request Body:', body);  // Debug log

  const encryptedAndSigned = await jweEncryptAndSign(body);

  //   const response = await axios.post(url, encryptedAndSigned, { headers });

  const response = await axisRequest({
        url,
        method: 'POST',
        headers,
        data: encryptedAndSigned
    });

    const decrypted = await jweVerifyAndDecrypt(response.data);

    console.log(decrypted);

    // NEW: Persist snapshot
    await db.saveBalanceSnapshot(merchantId, corpAccNum, decrypted);
    
    return { 
      raw: response.data, 
      decrypted,
      merchantId,  // Pass through
      snapshotSaved: true 
    };
}

module.exports = {
  getBalance
};


