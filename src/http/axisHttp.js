// src/http/axisHttp.js
const fs = require('fs');
const https = require('https');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/axisConfig');

const p12Buffer = fs.readFileSync('./certs/keystore.p12');

const axisHttpsAgent = new https.Agent({
  pfx: p12Buffer,
  passphrase: 'Axis1234@A',      // as provided when Axis/you created it
  // Optional: enforce cert validation
  rejectUnauthorized: true
});

function axisRequest(reqConfig) {
  return axios.request({
    httpsAgent: axisHttpsAgent,
    timeout: 30000,
    ...reqConfig
  });
}

function baseHeaders() {
  const now = Date.now().toString();
  return {
    'Content-Type': 'text/plain',
    'x-fapi-epoch-millis': now,
    'x-fapi-channel-id': config.channelId,
    'x-fapi-uuid': uuidv4(),
    'x-fapi-serviceId': config.headersBase['x-fapi-serviceId'],
    'x-fapi-serviceVersion': config.headersBase['x-fapi-serviceVersion'],
    'X-IBM-Client-Id': config.clientId,
    'X-IBM-Client-Secret': config.clientSecret
  };
}

module.exports = { axisRequest, baseHeaders };
