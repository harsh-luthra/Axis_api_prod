const config = require('../config/axisConfig');
const { jweEncryptAndSign, jweVerifyAndDecrypt } = require('../security/jweJws');
const { generateChecksumAxis } = require('../security/checksumAxis');
const { axisRequest, baseHeaders } = require('../http/axisHttp');

/* ===========================
   VALIDATION
=========================== */
function validateStatusRequest(req) {
  const errors = [];

  // ✅ CRN mandatory
  if (!req.crn) errors.push('crn mandatory');
  if (typeof req.crn !== 'string') errors.push('crn must be string');
  if (req.crn?.length > 30) errors.push('crn max length 30');  // varchar(30)

  if (errors.length) {
    throw new Error(`Axis Status Validation Failed: ${errors.join(' | ')}`);
  }
}

/* ===========================
   BUILD PAYLOAD
=========================== */
function buildStatusData(req) {
  validateStatusRequest(req);

  const Data = {
    channelId: config.channelId,        // "ELEVENPAY" or "TXB"
    corpCode: config.corpCode,          // "DEMOCORP159"
    crn: [req.crn],                     // ✅ ARRAY! ["FTTEST123456"]
  };

  Data.checksum = generateChecksumAxis(Data);

  return {
    Data,
    Risk: {}
  };
}

/* ===========================
   MAIN API
=========================== */
async function getTransferStatus(payload) {
  const url = config.urls[config.env].transferStatus;  

  const headers = baseHeaders();
  const body = buildStatusData(payload);

  console.log('🔍 Transfer Status Request:', JSON.stringify(body, null, 2));

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

module.exports = { getTransferStatus };
