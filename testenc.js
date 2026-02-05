const crypto = require('crypto');
const { callback } = require('./src/config/axisConfig');
const { decryptCallback } = require('./src/security/axisAes128');
const { verifyChecksumAxis } = require('./src/security/checksumAxis');


// This MUST be the same key string they configured,
console.log('Callback AES Key Hex:', callback.aesKeyHex);
// e.g. "E795C6D2FA3C423598A0BA1D45EB8703" from their sample main(). [file:106]
// const AXIS_CALLBACK_KEY_STRING = process.env.AXIS_CALLBACK_KEY_STRING;
const AXIS_CALLBACK_KEY_STRING = (callback.aesKeyHex); // Axis shared secret    

// from bank: key128: 7d320cf27dab0564a8de42f4ca9f00ca
const KEY_HEX = '7d320cf27dab0564a8de42f4ca9f00ca';


// fixed IV: 00 01 ... 0f (Axis sample) [file:106]
// const IV = Buffer.from([
//   0x00, 0x01, 0x02, 0x03,
//   0x04, 0x05, 0x06, 0x07,
//   0x08, 0x09, 0x0a, 0x0b,
//   0x0c, 0x0d, 0x0e, 0x0f
// ]);

// function decryptCallback(cipherTextB64) {
//   const key = Buffer.from(KEY_HEX, 'hex'); // 16‑byte AES‑128 key
//   const cipherBytes = Buffer.from(cipherTextB64, 'base64');

//   const decipher = crypto.createDecipheriv('aes-128-cbc', key, IV);
//   decipher.setAutoPadding(true); // PKCS5/PKCS7

//   let decrypted = decipher.update(cipherBytes, undefined, 'utf8');
//   decrypted += decipher.final('utf8');
//   return decrypted;
// }

// usage:
const cipherTextB64 = 'jhI5nAdyb1qOEjmcB3JvWnJ+hgOb86uSdQNOWWqCNEeOOSA01VW4ko4q1oxuDd2CUlZb7Tfa1Tu8Zxm9RTUdt9kemqYk9M2cDKe3AGHkkJUirMe+QbwpJosjRB91pEeV2iqNNL/L0MZJpT4agEz+q4UOZW5CZEZV3vxvIdBsYr56kUGBhNcy6S04XYqKmKDhgh+p5Ul8NSblMGHFxAh5OEUo3DSXY0CbhJGjjEQ8ghmX5wTPAB2QHo29MlBwA5NPdwqsxdHuYyRg0KB1vwcUmn1ogxEdhG98GQ5FtF97RqK3fhdwV0qH/TDMOyIwyoFyc3dKh+Hrt4b0LyjBho8XRpd40x7Lm3ebYqd5kdEBes1rQ5n4UwskbDnnLjoADtRL58YHtsaPgQRKwoh+qPi6ABFfyTYgxyDfh9iglnO6SUP+5ZUm1Wm4BwU1WsUTMEjp8ovrBrWz5UmENXzK9si1sM1ZqpjXLSUH3bmc22/n4/hYzxtVPwgq7LmJyKgXhpJAv6KEoWTzS+IDRwJXgeO+NNtyya9JwKZGumeEZfSIGUi3pmLtf3T2LzLiF40KxOKKYRlz5iIDffaEo+CHNVXPuPRIUph+2L83vdM8j29jMcNj1mGMHYyRYw2omWCqtGT/Kzv8dYWaE09uXToLoKcJXa2Qz49w2FGYhuVvcesCNY/NHFipmNSOXasryVUDDuoG2nBeIY0rV5eZhEz3kulbjQD7Mx8dWzlYUFFFCUaR74VYPVB3jBqHOkcFfFlCCqhs61DtHLwf8Yv398yzKMB1Pg==';

// decryptCallback(cipherTextB64);
    // const decryptedJson = decryptCallback(cipherTextB64);

    // console.log('Decrypted Callback Payload:', decryptedJson);

    // const parsed = JSON.parse(decryptedJson);

    // console.log('JSON Callback Payload:', parsed);

async function test(encrypted_val) {
    console.log('============================');
//   console.log('🔔 Axis Callback Received:', req.body);
  
  try {
    // const encrypted = req.body?.GetStatusResponseBodyEncrypted || req.body;
    const encrypted = encrypted_val;
    
    if (!encrypted) {
      console.error('❌ Missing encrypted payload');
      return res.status(200).send('OK');
    }

    console.log('🔐 Encrypted:', encrypted);

    // decryptCallback() RETURNS OBJECT - NO JSON.parse needed!
    const decryptedObj = decryptCallback(encrypted);  // ← OBJECT
    
    console.log('✅ Decrypted Object:', JSON.stringify(decryptedObj, null, 2));

    const data = decryptedObj?.data || decryptedObj?.Data || decryptedObj;

    if (!verifyChecksumAxis(data)) {
      console.error('❌ Axis callback checksum failed');
      return res.status(200).send('OK');
    }

    /* ===========================
       EXTRACT CRN & STATUS
    =========================== */
    const record = data?.CUR_TXN_ENQ?.[0];

    if (!record?.crn) {
      console.error('❌ CRN missing');
      return res.status(200).send('OK');
    }

    // const txnUpdate = {
    //   crn: record.crn,
    //   transactionId: record.transaction_id,
    //   utr: record.utrNo,
    //   status: record.transactionStatus,
    //   statusDesc: record.statusDescription,
    //   amount: record.amount,
    //   processedAt: record.processingDate
    // };

    // console.log('✅ Processing:', txnUpdate);

    // await db.handleCallback(txnUpdate);

    res.status(200).send('OK');
    
  } catch (err) {
    console.error('❌ Callback Error:', err);
    res.status(200).send('OK'); // Always 200 for Axis retries
  }
}

test(cipherTextB64);
