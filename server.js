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

const { fundTransfer } = require('./src/api/transferPayment');
const { getTransferStatus } = require('./src/api/getTransferStatus');

const db = require('./src/db/payouts');

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.text({ type: '*/*' }));

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

// --------- NEW CALLBACK HANDLER ----------
app.post('/axis/callback', async (req, res) => {
  try {
    const encrypted =
      req.body?.GetStatusResponseBodyEncrypted || req.body;

    if (!encrypted) {
      console.error('❌ Missing encrypted payload');
      return res.status(200).send('OK'); // do NOT fail callback
    }

    const decryptedJson = decryptAes256Callback(encrypted);
    const parsed = JSON.parse(decryptedJson);

    const data = parsed?.data || parsed?.Data || parsed;

    if (!verifyChecksumAxis(data)) {
      console.error('❌ Axis callback checksum failed');
      return res.status(200).send('OK'); // Axis retry safe
    }

    /* ===========================
       EXTRACT CRN & STATUS
    =========================== */
    const record = data?.CUR_TXN_ENQ?.[0];

    if (!record?.crn) {
      console.error('❌ CRN missing in callback');
      return res.status(200).send('OK');
    }

    // res.status(200).send('OK');

    const txnUpdate = {
      crn: record.crn,
      transactionId: record.transaction_id,
      utr: record.utrNo,
      status: record.transactionStatus,
      statusDesc: record.statusDescription,
      amount: record.amount,
      processedAt: record.processingDate
    };

    console.log('✅ Axis Callback Received:', txnUpdate);

    await db.handleCallback(txnUpdate);  // NEW: Persist!

    // TODO:
    // 1. Idempotent update using CRN
    // 2. Ignore duplicates
    // 3. Persist status transition

    res.status(200).send('OK'); // ALWAYS 200

  } catch (err) {
    console.error('❌ Callback Fatal Error:', err);
    res.status(200).send('OK'); // Never return non-200
  }
});

// --------- TEST BALANCE ENDPOINT ----------
app.get('/balance/:merchantId', async (req, res) => {
  try {
    const merchantId = parseInt(req.params.merchantId) || 1;  // Default 1
    // const result = await require('./src/api/getBalance').getBalance(merchantId);
    const result = getBalance();
    
    // Latest snapshot
    const latest = await db.getLatestBalance(merchantId);
    
    res.json({
      success: true,
      merchantId,
      axisBalance: result.decrypted?.Data?.data?.balance,
      appPending: latest?.app_pending_out || 0,
      reconciled: latest?.reconciled || false,
      fetchedAt: latest?.fetched_at,
      snapshotId: latest?.id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// /test-transfer-payment
app.post('/fund-transfer', async (req, res) => {
  try {
    const payload = req.body;

    console.log('💸 Fund Transfer Request:', JSON.stringify(payload, null, 2));

    const result = await fundTransfer(payload);

    const decrypted = result?.decrypted || {};
    const data = decrypted?.Data || {};

    /* ===========================
       AXIS BUSINESS FAILURE
    =========================== */
    if (data.status && data.status !== 'S') {
      return res.status(422).json({
        success: false,
        axisStatus: data.status,
        axisMessage: data.message || 'Transaction rejected by Axis',
        axisErrors: data.errorDetails || [],
        raw: result.raw,
        decrypted
      });
    }

    /* ===========================
       SUCCESS
    =========================== */

    const payoutId = await db.createPayoutTransfer(req.body, result);
    console.log(`💾 Payout saved ID: ${payoutId}`);

    return res.status(200).json({
      success: true,
      axisStatus: data.status || 'S',
      axisMessage: data.message || 'Transfer initiated successfully',
      referenceId: data.txnReferenceId || null,
      utr: data.utr || null,
      raw: result.raw,
      decrypted
    });

  } catch (error) {
    console.error('❌ Fund Transfer Error:', error);

    /* ===========================
       VALIDATION ERROR
    =========================== */
    if (error.message?.startsWith('Axis Transfer Validation Failed')) {
      return res.status(400).json({
        success: false,
        errorType: 'VALIDATION_ERROR',
        message: error.message
      });
    }

    /* ===========================
       AXIS HTTP ERROR
    =========================== */
    if (error.response) {
      return res.status(error.response.status || 502).json({
        success: false,
        errorType: 'AXIS_HTTP_ERROR',
        axisStatusCode: error.response.status,
        axisRaw: error.response.data || null
      });
    }

    /* ===========================
       ENCRYPTION / INTERNAL ERROR
    =========================== */
    return res.status(500).json({
      success: false,
      errorType: 'INTERNAL_SERVER_ERROR',
      message: error.message || 'Unexpected error'
    });
  }
});

app.post('/fund-transfer/status', async (req, res) => {
  try {
    console.log('📡 Get Transfer Status Request:', req.body);

    const result = await getTransferStatus(req.body);

    const decrypted = result?.decrypted || {};
    const data = decrypted?.Data || {};

    /* ===========================
       AXIS BUSINESS FAILURE
    =========================== */
    if (data.status && data.status !== 'S') {
      return res.status(422).json({
        success: false,
        axisStatus: data.status,
        axisMessage: data.message || 'Axis rejected status enquiry',
        decrypted
      });
    }

    /* ===========================
       SUCCESS
    =========================== */

    const statusData = data.data?.CURTXNENQ?.[0] || {};
    await db.updatePayoutStatus(req.body.crn, statusData);

    res.status(200).json({
      success: true,
      axisStatus: data.status,
      axisMessage: data.message,
      txnStatus: data.txnStatus || null,
      utr: data.utr || null,
      txnReferenceId: data.txnReferenceId || null,
      decrypted,
      raw: result.raw
    });

  } catch (error) {
    console.error('❌ Get Status Error:', error);

    if (error.message?.startsWith('Axis Status Validation Failed')) {
      return res.status(400).json({
        success: false,
        errorType: 'VALIDATION_ERROR',
        message: error.message
      });
    }

    if (error.response) {
      return res.status(error.response.status || 502).json({
        success: false,
        errorType: 'AXIS_HTTP_ERROR',
        axisRaw: error.response.data
      });
    }

    res.status(500).json({
      success: false,
      errorType: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

// --------- ERROR HANDLER ----------

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
