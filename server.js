const express = require('express');
const bodyParser = require('body-parser');

const { verifyChecksumAxis } = require('./src/security/checksumAxis');
const { decryptAes256Callback } = require('./src/security/aesCallback');

// NEW: imports for get balance
const { v4: uuidv4 } = require('uuid');
const { axisRequest } = require('./src/http/axisHttp');
const config = require('./src/config/axisConfig');
const { jweEncryptAndSign, jweVerifyAndDecrypt, loadJoseKeys,  } = require('./src/security/jweJws');

const { getBalance } = require('./src/api/getBalance.js');

const crypto = require('crypto');

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

app.get('/test-get-balance', async (req, res) => {
  try {
    console.log('🔍 Testing Balance API...');
    const result = await getBalance();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      rawAxisStatus: result.raw ? 200 : 'Error',
      rawResponse: result.raw,
      decrypted: result.decrypted,
      balance: result.decrypted?.Data?.data?.Balance || 'N/A'
    });
  } catch (error) {
    console.error('❌ Balance API Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      axisStatus: error.axisStatus || 500,
      axisData: error.axisData
    });
  }
});

// --------- TEST BALANCE ENDPOINT ----------
// Get Balance
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

// /test-add-beneficiary
app.post('/test-add-beneficiary', async (req, res) => {
  try {
    console.log('🔍 Testing Add Beneficiary API...', req.body);
    const result = await require('./src/api/addBeneficiary').addBeneficiary(req.body);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      rawAxisStatus: result.raw ? 200 : 'Error',
      rawResponse: result.raw,
      decrypted: result.decrypted,
      beneCode: result.decrypted?.Data?.data?.beneDetails?.beneCode || 'N/A',
      status: result.decrypted?.Data?.status || 'N/A'
    });
  } catch (error) {
    console.error('❌ Add Beneficiary API Error:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.message,
      axisStatus: error.response?.status || 500,
      axisData: error.response?.data || error.axisData,
      requestBody: req.body  // Debug input
    });
  }
});


// /test-bene-enquiry  
app.post('/test-bene-enquiry', async (req, res) => {
  try {
    console.log('🔍 Testing Bene Enquiry API...', req.body);
    const result = await require('./src/api/beneEnquiry').beneEnquiry(req.body);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      rawAxisStatus: result.raw ? 200 : 'Error',
      rawResponse: result.raw,
      decrypted: result.decrypted,
      beneficiaryCount: result.decrypted?.Data?.data?.count || 0,
      beneficiaries: result.decrypted?.Data?.data?.beneDetails || [],
      status: result.decrypted?.Data?.status || 'N/A'
    });
  } catch (error) {
    console.error('❌ Bene Enquiry API Error:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.message,
      axisStatus: error.response?.status || 500,
      axisData: error.response?.data || error.axisData,
      requestBody: req.body  // Debug input
    });
  }
});


// // Add Beneficiary
// app.post('/test-add-beneficiary', async (req, res) => {
//   const payload = {
//     Data: {
//       channelId: "KITEPAY",
//       corpCode: "DEMOCORP159",
//       userId: "kitepay_user",
//       beneinsert: [{
//         apiVersion: "1.0",
//         beneCode: `KITE_${Date.now()}`,
//         beneName: "KitePay Test Merchant", 
//         beneAccNum: "5230330001915",
//         beneIfscCode: "HDFC0000523",
//         checksum: "e326c1ca326533f55d0aa93c1caffde30769a715" // Calculate real checksum
//       }]
//     }
//   };

//   try {
//     const url = config.urls[config.env].beneReg;
//     const headers = buildHeaders();
//     const jwsPayload = await jweEncryptAndSign(payload);

//     const axisResp = await axisRequest({ method: 'POST', url, headers, data: jwsPayload });
//     const decrypted = await jweVerifyAndDecrypt(axisResp.data);
    
//     res.json({ rawAxisStatus: axisResp.status, decrypted });
//   } catch (err) {
//     handleAxisError(err, res);
//   }
// });

// // Beneficiary Enquiry
// app.post('/test-bene-enquiry', async (req, res) => {
//   const payload = {
//     Data: {
//       channelId: "KITEPAY",
//       corpCode: "DEMOCORP159",
//       beneCode: "KITE_1735792080000",
//       status: "All",
//       emailId: "dev@kitepay.in",
//       checksum: "2cd88677a293aba12210a9563c93d808"
//     }
//   };

//   try {
//     const url = config.urls[config.env].beneEnquiry;
//     const headers = buildHeaders();
//     const jwsPayload = await jweEncryptAndSign(payload);

//     const axisResp = await axisRequest({ method: 'POST', url, headers, data: jwsPayload });
//     const decrypted = await jweVerifyAndDecrypt(axisResp.data);
    
//     res.json({ rawAxisStatus: axisResp.status, decrypted });
//   } catch (err) {
//     handleAxisError(err, res);
//   }
// });

// // Fund Transfer
// app.post('/test-fund-transfer', async (req, res) => {
//   const payload = {
//     corpCode: "DEMOCORP159",
//     channelId: "KITEPAY",
//     txnRefNo: `KITE-${Date.now()}-${Math.random().toString(36).slice(2)}`,
//     beneficiary: {
//       accNum: "987654321098",  // Test beneficiary
//       ifsc: "AXIS0000002",
//       name: "KitePay Merchant Test"
//     },
//     amount: "1000.00",
//     remarks: "KitePay UAT Test Transfer"
//   };

//   try {
//     const url = config.urls[config.env].transferPayment;
//     const headers = buildHeaders();
//     const jwsPayload = await jweEncryptAndSign(payload);

//     const axisResp = await axisRequest({
//       method: 'POST',
//       url,
//       headers,
//       data: jwsPayload
//     });

//     const decrypted = await jweVerifyAndDecrypt(axisResp.data);
//     res.json({
//       rawAxisStatus: axisResp.status,
//       request: payload,
//       decrypted
//     });
//   } catch (err) {
//     handleAxisError(err, res);
//   }
// });

// // Get TXN Status
// app.post('/test-txn-status', async (req, res) => {
//   const { txnRefNo, bankRefNo } = req.body; // POST body input
  
//   const payload = {
//     corpCode: "DEMOCORP159",
//     channelId: "KITEPAY",
//     txnRefNo,
//     bankRefNo // Optional
//   };

//   try {
//     const url = config.urls[config.env].getStatus;
//     const headers = buildHeaders();
//     const jwsPayload = await jweEncryptAndSign(payload);

//     const axisResp = await axisRequest({
//       method: 'POST',
//       url,
//       headers,
//       data: jwsPayload
//     });

//     const decrypted = await jweVerifyAndDecrypt(axisResp.data);
//     res.json({
//       rawAxisStatus: axisResp.status,
//       request: payload,
//       decrypted
//     });
//   } catch (err) {
//     handleAxisError(err, res);
//   }
// });

function handleAxisError(err, res) {
  const status = err.response?.status || 500;
  res.status(status).json({
    error: true,
    message: err.message,
    axisStatus: err.response?.status,
    axisData: err.response?.data
  });
}

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Axis integration test server listening on port ${PORT}`);
});
