// src/api/fundTransfer.js
const { v4: uuidv4 } = require('uuid');
const config = require('../config/axisConfig');
const { jweEncryptAndSign, jweVerifyAndDecrypt } = require('../security/jweJws');
const { generateChecksumAxis } = require('../security/checksumAxis');
const { axisRequest } = require('../http/axisHttp');
const db = require('../db/payouts');  // ✅ NEW

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

function validateFundTransfer(ft) {
  const errors = [];

  const isString = v => typeof v === 'string';
  const isNumberStr = v => /^\d+(\.\d{2})$/.test(v);
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v);

  const checkLen = (v, max, name) => {
    if (v && v.length > max) errors.push(`${name} max length ${max}`);
  };

  /* ===========================
     1. ENUM VALIDATIONS
  =========================== */

  const payModes = ['RT', 'NE', 'PA', 'FT', 'CC', 'DD'];
  if (!payModes.includes(ft.txnPaymode)) {
    errors.push(`txnPaymode must be one of ${payModes.join(', ')}`);
  }

  const txnTypes = ['CUST', 'MERC', 'DIST', 'INTN', 'VEND'];
  if (!txnTypes.includes(ft.txnType)) {
    errors.push(`txnType must be one of ${txnTypes.join(', ')}`);
  }

  /* ===========================
     2. MANDATORY FIELDS
  =========================== */

  if (!ft.custUniqRef) errors.push('custUniqRef mandatory');
  if (!ft.txnAmount) errors.push('txnAmount mandatory');
  if (!ft.beneCode) errors.push('beneCode mandatory');
  if (!ft.valueDate) errors.push('valueDate mandatory');
  if (!ft.beneName) errors.push('beneName mandatory');

  /* ===========================
     3. CONDITIONAL MANDATORY
  =========================== */

  if (['RT', 'NE', 'FT'].includes(ft.txnPaymode) && !ft.beneAccNum) {
    errors.push('beneAccNum mandatory for RT/NE/FT');
  }

  if (['RT', 'NE'].includes(ft.txnPaymode) && !ft.beneIfscCode) {
    errors.push('beneIfscCode mandatory for RT/NE');
  }

  if (Number(ft.txnAmount) >= 500000000 && !ft.beneLEI) {
    errors.push('beneLEI mandatory for txn >= 50 Cr');
  }

  /* ===========================
     4. TYPE + FORMAT CHECKS
  =========================== */

  if (!isString(ft.custUniqRef)) errors.push('custUniqRef must be string');
  if (!isString(ft.beneName)) errors.push('beneName must be string');
  if (!isString(ft.beneCode)) errors.push('beneCode must be string');

  if (!isNumberStr(ft.txnAmount)) {
    errors.push('txnAmount must be Number(15,2)');
  }

  if (!isDate(ft.valueDate)) {
    errors.push('valueDate must be YYYY-MM-DD');
  }

  if (ft.beneIfscCode && ft.beneIfscCode.length !== 11) {
    errors.push('beneIfscCode must be exactly 11 characters');
  }

  /* ===========================
     5. LENGTH VALIDATIONS
  =========================== */

  checkLen(ft.custUniqRef, 30, 'custUniqRef');
  checkLen(ft.corpAccNum, 15, config.corpAccNum);
  checkLen(ft.beneCode, 30, 'beneCode');
  checkLen(ft.beneName, 70, 'beneName');
  checkLen(ft.beneAccNum, 30, 'beneAccNum');
  checkLen(ft.beneBankName, 70, 'beneBankName');
  checkLen(ft.beneEmailAddr1, 250, 'beneEmailAddr1');
  checkLen(ft.beneMobileNo, 25, 'beneMobileNo');

  /* ===========================
     6. CHEQUE RULES
  =========================== */

  if (['CC', 'DD'].includes(ft.txnPaymode)) {
    if (!ft.baseCode) errors.push('baseCode mandatory for CC/DD');
    if (!ft.chequeNumber) errors.push('chequeNumber mandatory for CC/DD');
  }

  /* ===========================
     FINAL
  =========================== */

  if (errors.length) {
    throw new Error(`Axis Transfer Validation Failed: ${errors.join(' | ')}`);
  }
}

function buildFundTransferData(ft) {
  validateFundTransfer(ft);

  const payment = {
    txnPaymode: ft.txnPaymode,
    custUniqRef: ft.custUniqRef,
    txnType: ft.txnType || 'CUST',
    txnAmount: ft.txnAmount,
    beneLEI: ft.beneLEI || '',
    corpAccNum: config.corpAccNum,
    beneCode: ft.beneCode,
    valueDate: ft.valueDate || new Date().toISOString().slice(0, 10),
    beneName: ft.beneName,
    beneAccNum: ft.beneAccNum || '',
    beneAcType: ft.beneAcType || '',
    beneAddr1: ft.beneAddr1 || '',
    beneAddr2: ft.beneAddr2 || '',
    beneAddr3: ft.beneAddr3 || '',
    beneCity: ft.beneCity || '',
    beneState: ft.beneState || '',
    benePincode: ft.benePincode || '',
    beneIfscCode: ft.beneIfscCode || '',
    beneBankName: ft.beneBankName || '',
    baseCode: ft.baseCode || '',
    chequeNumber: ft.chequeNumber || '',
    chequeDate: ft.chequeDate || '',
    payableLocation: ft.payableLocation || '',
    printLocation: ft.printLocation || '',
    beneEmailAddr1: ft.beneEmailAddr1 || '',
    beneMobileNo: ft.beneMobileNo || '',
    productCode: ft.productCode || '',
    senderToReceiverInfo: ft.senderToReceiverInfo || ''
  };

  const Data = {
    channelId: config.channelId,
    corpCode: config.corpCode,
    paymentDetails: [payment]
  };

  Data.checksum = generateChecksumAxis(Data);

  return {
    Data,
    Risk: {}
  };
}

// async function fundTransfer(ftDetails, merchantId) {
//   const url = config.urls[config.env].transferPayment; // https://sakshamuat.axisbank.co.in/gateway/api/txb/v3/payments/transfer-payment
//   console.log('🔍 TransferPayment URL:', url);
//   const headers = baseHeaders();
//   const body = buildFundTransferData(ftDetails);

//   console.log('🔍 TransferPayment Data:', JSON.stringify(body, null, 2));

//   const encryptedAndSigned = await jweEncryptAndSign(body);

//   const response = await axisRequest({
//     url,
//     method: 'POST',
//     headers,
//     data: encryptedAndSigned
//   });

//   // ✅ NEW: Save to DB
//   await db.createFundTransfer(merchantId, ftDetails, { raw: response.data, decrypted });

//   const decrypted = await jweVerifyAndDecrypt(response.data);
//   return { raw: response.data, decrypted };
// }

async function fundTransfer(ftDetails, merchantId) {  // ✅ Add merchantId param
  const url = config.urls[config.env].transferPayment;
  const headers = baseHeaders();
  
  // Check if transaction with custUniqRef already exists
  if (await db.checkFundTransferExists(ftDetails.custUniqRef)) {
    throw new Error(`Transaction with custUniqRef ${ftDetails.custUniqRef} already exists`);
  }
  
  const body = buildFundTransferData(ftDetails);
  
  console.log('🔍 TransferPayment Data:', JSON.stringify(body.Data, null, 2));
  
  const encryptedAndSigned = await jweEncryptAndSign(body);

  const response = await axisRequest({ url, method: 'POST', headers, data: encryptedAndSigned });
  const decrypted = await jweVerifyAndDecrypt(response.data);
  
  // ✅ NEW: Save to DB
  await db.createFundTransfer(merchantId, ftDetails, { raw: response.data, decrypted });
  
  return { raw: response.data, decrypted, merchantId };
}

module.exports = { fundTransfer };
