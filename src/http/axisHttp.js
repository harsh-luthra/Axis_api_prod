// src/http/axisHttp.js
const fs = require('fs');
const https = require('https');
const axios = require('axios');

const p12Buffer = fs.readFileSync('./certs/keystore.p12');

const axisHttpsAgent = new https.Agent({
  pfx: p12Buffer,
  passphrase: 'P12_PASSWORD',      // as provided when Axis/you created it
  // Optional: enforce cert validation
  rejectUnauthorized: true
});

function axisRequest(config) {
  return axios.request({
    httpsAgent: axisHttpsAgent,
    timeout: 30000,
    ...config
  });
}

module.exports = { axisRequest };
