// test-get-balance.js
const { v4: uuidv4 } = require('uuid');
const { axisRequest } = require('./src/http/axisHttp');
const config = require('./src/config/axisConfig');
const { jweEncryptAndSign, jweVerifyAndDecrypt } = require('./src/security/jweJws');
const { generateChecksumAxis } = require('./src/security/checksumAxis');

// Build headers as per Axis spec[file:2][file:6]
function buildHeaders() {
  const now = Date.now().toString();
  return {
    'Content-Type': 'application/json',
    'x-fapi-epoch-millis': now,
    'x-fapi-channel-id': config.channelId,                    // e.g. 'TXB'
    'x-fapi-uuid': uuidv4(),
    'x-fapi-serviceId': config.headersBase['x-fapi-serviceId'],      // 'OpenApi'
    'x-fapi-serviceVersion': config.headersBase['x-fapi-serviceVersion'], // '1.0'
    'X-IBM-Client-Id': config.clientId,
    'X-IBM-Client-Secret': config.clientSecret
  };
}

// Build non-encrypted Data object for Get Balance[file:2]
function buildGetBalanceData(corpAccNum) {
  const data = {
    corpAccNum,                  // Corporate Debit account no
    channelId: config.channelId, // Axis shared channel ID (e.g. TXB)
    corpCode: config.corpCode    // Your corporate code
    // checksum will be added below
  };

  data.checksum = generateChecksumAxis(data); // MD5 of concatenated values[file:2]
  return { Data: data };
}

async function run() {
  try {
    const url = config.urls[config.env].getBalance; // UAT/PROD URL from config[file:2]
    
    // TODO: set a valid enabled account number for your UAT client
    const corpAccNum = '309010100067740'; // sample from doc[file:2]

    console.log('Using URL:', url);
    console.log('Testing balance for account:', corpAccNum);

    const headers = buildHeaders();
    const body = buildGetBalanceData(corpAccNum);

    console.log('Non-encrypted request body:', JSON.stringify(body, null, 2));

    // Encrypt + sign as per Axis JWE/JWS flow[file:2][file:6]
    const encryptedAndSigned = await jweEncryptAndSign(body);

    // Axis expects compact JWS as body
    const axiosConfig = {
      method: 'POST',
      url,
      headers,
      data: encryptedAndSigned
    };

    const response = await axisRequest(axiosConfig);

    console.log('Raw HTTP status:', response.status);
    console.log('Raw response body (JWS/JWE):', response.data);

    // Decrypt + verify JWS/JWE from Axis[file:2][file:6]
    let decrypted;
    try {
      decrypted = await jweVerifyAndDecrypt(response.data);
      console.log('Decrypted balance response JSON:', JSON.stringify(decrypted, null, 2));
    } catch (e) {
      console.error('Failed to verify/decrypt JWE/JWS:', e.message);
      return;
    }

    // If decrypted.Data or decrypted.data exists, print core fields
    const dataRoot = decrypted.Data || decrypted.data || decrypted;
    if (dataRoot && dataRoot.data) {
      const d = dataRoot.data;
      console.log('---- Parsed balance ----');
      console.log('Status:', d.status);
      console.log('ChannelId:', d.channelId);
      console.log('CorpAccNum:', d.corpAccNum);
      console.log('CorpCode:', d.corpCode);
      console.log('Balance:', d.Balance);
      console.log('Message:', d.message);
    } else {
      console.log('Unexpected decrypted format:', decrypted);
    }
  } catch (err) {
    if (err.response) {
      console.error('HTTP error status:', err.response.status);
      console.error('HTTP error data:', err.response.data);
    } else {
      console.error('Error:', err.message);
    }
  }
}

run();
