require('dotenv').config();
const express = require('express');
// const bodyParser = require('body-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const morgan = require('morgan');

const { verifyChecksumAxis } = require('./src/security/checksumAxis');
// const { decryptAes256Callback } = require('./src/security/aesCallback');
const { decryptCallback } = require('./src/security/axisAes128');
// const { decryptHexAes128Ecb } = require('./src/security/axisAes128Ecb');
const pool = require('./src/db/mysql');

// NEW: imports for get balance
const { v4: uuidv4 } = require('uuid');
const { axisRequest } = require('./src/http/axisHttp');
const config = require('./src/config/axisConfig');
const { jweEncryptAndSign, jweVerifyAndDecrypt, loadJoseKeys,  } = require('./src/security/jweJws');

const { getBalance } = require('./src/api/getBalance.js');

const crypto = require('crypto');

const { fundTransfer } = require('./src/api/transferPayment');
const { getTransferStatus } = require('./src/api/getTransferStatus');
const { validateRequest, generateApiKeySchema, fundTransferSchema, transferStatusSchema, addBeneficiarySchema } = require('./src/validators/schemas');

const db = require('./src/db/payouts');

// 2. Add proper logging middleware
const logger = require('winston');// or pino

const app = express();

// Respect proxy headers (X-Forwarded-For) when running behind a proxy/load-balancer.
// Use a non-permissive default (trust 1 proxy). Set `TRUST_PROXY` to `false`, a
// numeric value (e.g. `1`), or a specific IP/mask per Express docs.
const _trustEnv = process.env.TRUST_PROXY;
let trustProxyValue = 1; // safest default when behind a single proxy (e.g. nginx/load-balancer)
if (typeof _trustEnv !== 'undefined') {
  const v = String(_trustEnv).trim();
  const vl = v.toLowerCase();
  if (vl === '0' || vl === 'false' || vl === 'no') {
    trustProxyValue = false;
  } else if (vl === 'true' || vl === '') {
    // avoid permissive boolean true — treat `true` as `1`
    trustProxyValue = 1;
  } else if (!Number.isNaN(Number(v)) && v !== '') {
    trustProxyValue = Number(v);
  } else {
    // allow values like 'loopback' or IP lists
    trustProxyValue = v;
  }
}
app.set('trust proxy', trustProxyValue);

// app.use(bodyParser.json());
// app.use(bodyParser.text({ type: '*/*' }));

// Basic security middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined'));

// Apply a conservative rate limit for public endpoints
app.use(rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
}));

// Generate secure random API key
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex'); // 64 chars
}

// Get merchant by API key (cached)
const merchantCache = new Map();
async function getMerchantByApiKey(apiKey) {
  if (merchantCache.has(apiKey)) return merchantCache.get(apiKey);
  
  const [merchants] = await pool.execute(
    'SELECT * FROM merchants WHERE api_key = ? AND is_active = TRUE',
    [apiKey]
  );
  
  if (merchants[0]) {
    merchantCache.set(apiKey, merchants[0]);
    setTimeout(() => merchantCache.delete(apiKey), 5 * 60 * 1000); // 5min cache
  }
  return merchants[0];
}


// Enhanced middleware
app.use(async (req, res, next) => {
  console.log(`➡️ ${req.method} ${req.path} from ${req.ip}`);
  // Skip API key auth for admin UI and for Axis callback webhook
  if (req.path.startsWith('/admin/')) {
    console.log('🔒 Admin access, skipping API key auth');
    return next();
  }

  if (req.path === '/axis/callback' || req.path.startsWith('/axis/callback/')) {
    console.log('🔔 Axis callback endpoint - skipping API key auth');
    return next();
  }

  // Allow public healthcheck/monitoring endpoints (no auth)
  if (req.path === '/pdown' || req.path.startsWith('/pdown/')) {
    console.log('ℹ️ Healthcheck endpoint - skipping API key auth');
    return next();
  }

  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'X-API-Key required' });

  const merchant = await getMerchantByApiKey(apiKey);
  if (!merchant) return res.status(401).json({ error: 'Invalid API key' });

  req.merchant = merchant;  // { id, merchant_name, corp_code, vendor_code, ... }
  console.log(`✅ Auth: ${merchant.merchant_name} (${apiKey.slice(0,8)}...)`);
  
  next();
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

app.post('/admin/generate-api-key', validateRequest(generateApiKeySchema, 'body'), async (req, res) => {
  try {
    const masterKey = req.headers['x-master-key'];
    
    if (masterKey !== config.MASTER_API_KEY) {
      return res.status(403).json({ error: 'Invalid credentials' });
    }

    const { merchant_name, corp_code, vendor_code, corporate_account } = req.body;
    const apiKey = generateApiKey();

    // Insert merchant
    const [result] = await pool.execute(`
      INSERT INTO merchants (
        api_key, merchant_name, corp_code, vendor_code, corporate_account
      ) VALUES (?, ?, ?, ?, ?)
    `, [apiKey, merchant_name, corp_code || null, vendor_code || null, corporate_account || null]);
    
    const merchantId = result.insertId;

    // Audit log (do not log API key)
    await pool.execute(`
      INSERT INTO api_keys (merchant_id, new_key, generated_by, reason)
      VALUES (?, ?, ?, ?)
    `, [merchantId, apiKey, req.ip || 'unknown', 'New merchant']);

    // Return key only once; never log or repeat it
    res.json({
      success: true,
      merchant_id: merchantId,
      api_key: apiKey,
      merchant_name
    });
    
  } catch (err) {
    console.error('Admin generate-key error:', err.message);
    res.status(500).json({ 
      error: 'Failed to generate key',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});


// GET /admin/merchants (Master Key)
app.get('/admin/merchants', async (req, res) => {
  if (req.headers['x-master-key'] !== config.MASTER_API_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  const [merchants] = await pool.execute(`
    SELECT id, merchant_name, corp_code, vendor_code, 
           api_key as masked_key, is_active, created_at
    FROM merchants ORDER BY created_at DESC
  `);
  
  res.json(merchants);
});

// POST /admin/revoke-key/{merchantId}
app.post('/admin/revoke-key/:id', async (req, res) => {
  if (req.headers['x-master-key'] !== config.MASTER_API_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  const merchantId = req.params.id;
  const newKey = generateApiKey();
  
  await pool.execute(
    'UPDATE merchants SET api_key = ?, is_active = FALSE WHERE id = ?',
    [newKey, merchantId]
  );
  
  res.json({ revoked: true, new_key: newKey });
});


// --------- NEW CALLBACK HANDLER ----------
app.post('/axis/callback', async (req, res) => {
  console.log('============================');
  console.log('🔔 Axis Callback Received');
  
  try {
    const encrypted = req.body?.GetStatusResponseBodyEncrypted || req.body;
    
    if (!encrypted) {
      console.error('❌ Missing encrypted payload');
      return res.status(200).send('OK');
    }

    // avoid logging full encrypted payloads in prod
    console.log('🔐 Encrypted payload length:', typeof encrypted === 'string' ? encrypted.length : 'n/a');

    // decryptCallback() RETURNS OBJECT - NO JSON.parse needed!
    const decryptedObj = decryptCallback(encrypted);  // ← OBJECT
    
    console.log('✅ Decrypted Object keys:', Object.keys(decryptedObj || {}));

    const data = decryptedObj?.data || decryptedObj?.Data || decryptedObj;

    if (!verifyChecksumAxis(data)) {
      console.error('❌ Axis callback checksum failed');
      return res.status(200).send('OK');
    }

    /* ===========================
       EXTRACT CRN & STATUS
    =========================== */
    const record = data?.CUR_TXN_ENQ?.[0];

    if (!record?.crn) {
      console.error('❌ CRN missing');
      return res.status(200).send('OK');
    }

    // In server.js route:
    const txnUpdate = {
      crn: record.crn,
      transactionId: record.transaction_id,
      utrNo: record.utrNo,
      transactionStatus: record.transactionStatus,  // ← Send this
      statusDescription: record.statusDescription,
      responseCode: record.responseCode,
      batchNo: record.batchNo,
      amount: record.amount
    };

    console.log('✅ Processing:', txnUpdate);

    await db.handleCallback(txnUpdate);

    res.status(200).send('OK');
    
  } catch (err) {
    console.error('❌ Callback Error:', err);
    res.status(200).send('OK'); // Always 200 for Axis retries
  }
});


// --------- TEST BALANCE ENDPOINT ----------
app.get('/balance/:merchantId', async (req, res) => {
  try {
    const merchantId = parseInt(req.params.merchantId) || 1;  // Default 1
    // const result = await require('./src/api/getBalance').getBalance(merchantId);
    const result = await getBalance();
    // console.log(result);
    // Latest snapshot
    const latest = await db.getLatestBalance(merchantId);
    
    res.json({
      success: true,
      // merchantId,
      axisBalance: result.decrypted?.Data?.data?.Balance,
      // appPending: latest?.app_pending_out || 0,
      // reconciled: latest?.reconciled || false,
      fetchedAt: latest?.fetched_at,
      // snapshotId: latest?.id
    });

    // res.json({
    //   success: true,
    //   merchantId,
    //   axisBalance: result.decrypted?.Data?.data?.Balance,
    //   appPending: latest?.app_pending_out || 0,
    //   reconciled: latest?.reconciled || false,
    //   fetchedAt: latest?.fetched_at,
    //   snapshotId: latest?.id
    // });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// /test-transfer-payment
app.post('/fund-transfer', validateRequest(fundTransferSchema, 'body'), async (req, res) => {
  try {
    const merchantId = req.merchant?.id || 1;  // From auth middleware
    const payload = req.body;

    console.log('💸 Fund Transfer initiated for merchant:', merchantId);

    const axisResult  = await fundTransfer(payload, merchantId);

    const decrypted = axisResult ?.decrypted || {};
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
        // raw: axisResult .raw,
        // decrypted
      });
    }

    /* ===========================
       SUCCESS
    =========================== */

    return res.status(200).json({
      success: true,
      axisStatus: data.status || 'S',
      axisMessage: data.message || 'Transfer initiated successfully',
      crn: payload.custUniqRef,  // Client polls /status with this
      axisRef: data.txnReferenceId || null,
      // utr: data.utr || null,
      // raw: axisResult .raw,
      // decrypted
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

app.post('/fund-transfer/status', validateRequest(transferStatusSchema, 'body'), async (req, res) => {
  try {
    console.log('📡 Status check for transaction');
    
    const result = await getTransferStatus(req.body);
    // Do not log decrypted response to avoid leaking transaction details
    
    const decrypted = result?.decrypted || {};
    const data = decrypted?.Data || {};

    // AXIS FAILURE
    if (data.status !== 'S') {
      return res.status(422).json({
        success: false,
        axisStatus: data.status,
        axisMessage: data.message,
        decrypted
      });
    }

    // SUCCESS - ARRAY handling
    const statusArray = data.data?.CUR_TXN_ENQ || [];
    const statusData = statusArray.find(item => item.crn === req.body.crn) || statusArray[0] || {};
    
    await db.updatePayoutStatus(req.body.crn, result);

    res.status(200).json({
      success: true,
      crn: req.body.crn,
      status: statusData.transactionStatus,
      statusDescription: statusData.statusDescription,
      responseCode: statusData.responseCode,
      utrNo: statusData.utrNo,
      batchNo: statusData.batchNo,
      processingDate: statusData.processingDate,
      body: data,
      count: statusArray.length
    });

  } catch (error) {
    console.error('❌ Status Error:', error);

    // ✅ YOUR ERROR HANDLERS
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
app.post('/test-add-beneficiary', validateRequest(addBeneficiarySchema, 'body'), async (req, res) => {
  try {
    console.log('🔍 Add Beneficiary API called');
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
    console.error('Add Beneficiary error:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Beneficiary registration failed',
      axisStatus: error.response?.status || 500
    });
  }
});

// --------- GET /payouts (cursor-paginated) ----------
/**
 * GET /payouts?limit=50&cursor=<base64>&mode=full
 * Query params:
 *   - limit: 50, 100, or 200 (default: 50)
 *   - cursor: base64-encoded cursor for pagination (optional)
 *   - mode: 'full' or 'half' response (default: 'full')
 */
app.get('/payouts', async (req, res) => {
  try {
    const merchantId = req.merchant?.id || null;  // From auth middleware
    const limit = parseInt(req.query.limit) || 50;
    const cursor = req.query.cursor || null;
    const mode = req.query.mode || 'full';  // 'full' or 'half'

    console.log(`📊 Fetching payouts: merchantId=${merchantId}, limit=${limit}, mode=${mode}`);

    const result = await db.getPayoutsCursorPaginated(merchantId, limit, cursor, mode);

    res.json(result);
  } catch (error) {
    console.error('❌ GET /payouts error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payouts',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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



// Error handler middleware (must be last)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  logger.error('Unhandled error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal Server Error',
    requestId: req.id || 'unknown'
  });
});

// Start server
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Axis API server VS listening on port ${PORT} [${process.env.AXIS_ENV || 'UAT'}]`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM: Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT: Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
