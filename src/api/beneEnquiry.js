// src/api/beneEnquiry.js
const config = require('../config/axisConfig');
const { jweEncryptAndSign, jweVerifyAndDecrypt } = require('../security/jweJws');
const { generateChecksumAxis } = require('../security/checksumAxis');
const { axisRequest, baseHeaders } = require('../http/axisHttp');

function buildBeneEnquiryData({ beneCode, status = 'All', emailId = 'dev@kitepay.in' } = {}) {
  const data = {
    channelId: config.channelId,
    corpCode: config.corpCode,
    beneCode: beneCode || '',
    status: status,
    emailId: emailId,
    checksum: ''
  };
  
  data.checksum = generateChecksumAxis(data);
  return { Data: data };
}

async function beneEnquiry(queryParams) {
  const url = config.urls[config.env].beneEnquiry; // /payee-mgmt/beneficiary-enquiry
  const headers = baseHeaders();
  const body = buildBeneEnquiryData(queryParams);
  const encryptedAndSigned = await jweEncryptAndSign(body);

  const response = await axisRequest({
    url,
    method: 'POST',
    headers,
    data: encryptedAndSigned
  });

  const decrypted = await jweVerifyAndDecrypt(response.data);
  return { raw: response.data, decrypted };
}

module.exports = {
  beneEnquiry
};
