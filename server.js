const express = require('express');
const bodyParser = require('body-parser');

const { verifyChecksumAxis } = require('./src/security/checksumAxis');
const { decryptAes256Callback } = require('./src/security/aesCallback');

// NEW: imports for get balance
const { v4: uuidv4 } = require('uuid');
const { axisRequest } = require('./src/http/axisHttp');
const config = require('./src/config/axisConfig');
const { jweEncryptAndSign, jweVerifyAndDecrypt, loadJoseKeys,  } = require('./src/security/jweJws');

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.text({ type: '*/*' }));

// --------- CALLBACK (already working) ----------
app.post('/axis/callback', async (req, res) => {
  try {
    const cipher = req.body.GetStatusResponseBodyEncrypted || req.body;
    const decryptedJson = decryptAes256Callback(cipher);
    const parsed = JSON.parse(decryptedJson);

    const data = parsed.data || parsed.Data || parsed;
    const isValidChecksum = verifyChecksumAxis(data);

    if (!isValidChecksum) {
      console.error('Invalid checksum in callback');
      return res.status(400).send('Checksum verification failed');
    }

    console.log('Callback data:', data);
    res.status(200).send('OK');
  } catch (err) {
    console.error('Callback error', err);
    res.status(500).send('ERROR');
  }
});

// --------- HELPERS FOR GET BALANCE ----------
function buildHeaders() {
  const now = Date.now().toString();
  return {
    'Content-Type': 'application/json',
    'x-fapi-epoch-millis': now,
    'x-fapi-channel-id': config.channelId,
    'x-fapi-uuid': uuidv4(),
    'x-fapi-serviceId': config.headersBase['x-fapi-serviceId'],
    'x-fapi-serviceVersion': config.headersBase['x-fapi-serviceVersion'],
    'X-IBM-Client-Id': config.clientId,
    'X-IBM-Client-Secret': config.clientSecret
  };
}

function buildGetBalanceData(corpAccNum) {
  const data = {
    corpAccNum,
    channelId: config.channelId,
    corpCode: config.corpCode
  };
  data.checksum = verifyChecksumAxis.generateChecksum
    ? verifyChecksumAxis.generateChecksum(data)
    : require('./src/security/checksumAxis').generateChecksumAxis(data); // depending on your export

  return { Data: data };
}

// --------- TEST BALANCE ENDPOINT ----------
app.get('/test-balance', async (req, res) => {
  const corpAccNum = '309010100067740';

  try {
    const url = config.urls[config.env].getBalance;
    const headers = buildHeaders();
    const body = buildGetBalanceData(corpAccNum);

    const jwsPayload = await jweEncryptAndSign(body);

    const axisResp = await axisRequest({
      method: 'POST',
      url,
      headers,
      data: jwsPayload
    });

    const decrypted = await jweVerifyAndDecrypt(axisResp.data);
    const root = decrypted.Data || decrypted.data || decrypted;

    res.json({
      rawAxisStatus: axisResp.status,
      decrypted
      // you can also expose root.data if you want only inner fields
    });
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({
      error: true,
      message: err.message,
      axisStatus: err.response?.status,
      axisData: err.response?.data
    });
  }
});


const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Axis integration test server listening on port ${PORT}`);
});
