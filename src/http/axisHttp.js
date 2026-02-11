// src/http/axisHttp.js
const fs = require('fs');
const https = require('https');
const axios = require('axios');

const path = require('path');
const config = require('../config/axisConfig');

// Resolve p12 path from config/env
const p12Path = path.resolve(config.jwe.clientP12Path || process.env.CLIENT_P12_PATH || './certs/keystore.p12');
let axisHttpsAgent;
if (fs.existsSync(p12Path)) {
  const p12Buffer = fs.readFileSync(p12Path);
  axisHttpsAgent = new https.Agent({
    pfx: p12Buffer,
    passphrase: config.jwe.clientP12Password || process.env.CLIENT_P12_PASSWORD,
    rejectUnauthorized: true
  });
} else {
  console.warn('⚠️ Axis p12 not found at', p12Path, '- HTTPS client will use default agent.');
}

function axisRequest(cfg) {
  return axios.request({
    httpsAgent: axisHttpsAgent,
    timeout: parseInt(process.env.AXIS_REQUEST_TIMEOUT || '30000', 10),
    ...cfg
  });
}

module.exports = { axisRequest };
