const pool = require('./mysql');
const config = require('../config/axisConfig');
const crypto = require('crypto');

// async function createPayoutTransfer(payload, axisResponse) {
//   const [result] = await pool.execute(`
//     INSERT INTO payout_requests (
//       merchant_id, crn, idempotency_key, txn_paymode, txn_type, txn_amount, 
//       bene_ifsc_code, bene_acc_num, value_date, bene_name, corp_acc_num,
//       checksum_sent, axis_txn_ref, axis_response, status
//     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//   `, [
//     payload.merchant_id || 1,
//     payload.custUniqRef,  // CRN - golden key
//     payload.idempotency_key || crypto.randomUUID(),
//     payload.txnPaymode,
//     payload.txnType || 'CUST',
//     payload.txnAmount,
//     payload.beneIfscCode,
//     payload.beneAccNum,
//     payload.valueDate,
//     payload.beneName,
//     payload.corpAccNum,
//     payload.checksum,
//     axisResponse?.data?.txnReferenceId,
//     JSON.stringify(axisResponse),
//     axisResponse?.data?.status === 'S' ? 'processing' : 'failed'
//   ]);
  
//   return result.insertId;
// }

async function createFundTransfer(merchantId, ftDetails, axisResponse) {
  const paymentDetails = ftDetails.paymentDetails?.[0] || ftDetails;
  const safeNull = (val) => val === '' || val == null ? null : val;
  const safeNumber = (val) => val === '' || val == null ? null : parseFloat(val);
  
  // ✅ Map ONLY known fields (37+ safe)
  const knownFields = {
    merchant_id: merchantId,
    crn: safeNull(paymentDetails.custUniqRef),
    txn_paymode: safeNull(paymentDetails.txnPaymode),
    txn_type: safeNull(paymentDetails.txnType),
    txn_amount: safeNumber(paymentDetails.txnAmount),
    bene_lei: safeNull(paymentDetails.beneLEI),
    bene_code: safeNull(paymentDetails.beneCode),
    value_date: safeNull(paymentDetails.valueDate),
    bene_name: safeNull(paymentDetails.beneName),
    bene_acc_num: safeNull(paymentDetails.beneAccNum),
    bene_ac_type: safeNull(paymentDetails.beneAcType),
    bene_addr1: safeNull(paymentDetails.beneAddr1 || ''),
    bene_addr2: safeNull(paymentDetails.beneAddr2 || ''),
    bene_addr3: safeNull(paymentDetails.beneAddr3 || ''),
    bene_city: safeNull(paymentDetails.beneCity || ''),
    bene_state: safeNull(paymentDetails.beneState || ''),
    bene_pincode: safeNull(paymentDetails.benePincode || ''),
    bene_ifsc_code: safeNull(paymentDetails.beneIfscCode),
    bene_bank_name: safeNull(paymentDetails.beneBankName),
    bene_email_addr1: safeNull(paymentDetails.beneEmailAddr1),
    bene_mobile_no: safeNull(paymentDetails.beneMobileNo),
    base_code: safeNull(paymentDetails.baseCode),
    cheque_number: safeNull(paymentDetails.chequeNumber),
    cheque_date: safeNull(paymentDetails.chequeDate),
    payable_location: safeNull(paymentDetails.payableLocation),
    print_location: safeNull(paymentDetails.printLocation),
    product_code: safeNull(paymentDetails.productCode),
    sender_to_receiver_info: safeNull(paymentDetails.senderToReceiverInfo),
    checksum_sent: safeNull(paymentDetails.checksum),
    axis_response: JSON.stringify(axisResponse),
    status: axisResponse.decrypted?.Data?.status === 'S' ? 'processing' : 'failed'
  };
  
  // ✅ Dynamic: Build query from keys
  const columns = Object.keys(knownFields);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map(col => knownFields[col]);
  
  const [result] = await pool.execute(`
    INSERT INTO payout_requests (${columns.join(', ')}) 
    VALUES (${placeholders})
  `, values);
  
  console.log(`💾 Transfer saved: ID ${result.insertId}, CRN ${paymentDetails.custUniqRef}`);
  return result.insertId;
}


async function updatePayoutStatus(crn, axisResponse) {
  const safeNull = (val) => val === '' || val == null ? null : val;
  
  // ✅ Handle ARRAY (CUR_TXN_ENQ)
  const enqArray = axisResponse.decrypted?.Data?.data?.CUR_TXN_ENQ || [];
  const latestStatus = enqArray.find(item => item.crn === crn) || enqArray[0];
  
  if (!latestStatus) {
    console.log(`⚠️ No status for CRN: ${crn}`);
    return null;
  }
  
  const [result] = await pool.execute(`
    INSERT INTO payout_status_events (
      payout_id, corp_code, crn, utr_no, transaction_status, 
      status_description, batch_no, processing_date, respone_code, 
      checksum_received, raw_response
    ) VALUES (
      (SELECT id FROM payout_requests WHERE crn = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    ) ON DUPLICATE KEY UPDATE 
      raw_response = VALUES(raw_response),
      timestamp = CURRENT_TIMESTAMP
  `, [
    crn,
    latestStatus.corpCode,                      // "DEMOCORP159"
    latestStatus.crn,                           // "FTTEST123461"
    safeNull(latestStatus.utrNo),               // null
    parseInt(latestStatus.transactionStatus) || 2,  // REJECTED=2
    safeNull(latestStatus.statusDescription),   // "Debit account does not exist"
    safeNull(latestStatus.batchNo),             // "46086"
    safeNull(latestStatus.processingDate),      // "05-01-2026 23:33:01"
    safeNull(latestStatus.responseCode),        // "F101"
    safeNull(axisResponse.decrypted?.Data?.data?.checksum),  // "90d42ff8..."
    JSON.stringify(axisResponse)                // Full JSON
  ]);
  
  // Update payout_requests
  const txnStatus = parseInt(latestStatus.transactionStatus) || 1;
  await pool.execute(`
    UPDATE payout_requests SET 
      status = CASE 
        WHEN ? = 3 THEN 'success'
        WHEN ? = 4 THEN 'return'
        WHEN ? = 2 THEN 'failed'
        ELSE 'processing'
      END, 
      updated_at = CURRENT_TIMESTAMP
    WHERE crn = ?
  `, [txnStatus, txnStatus, txnStatus, crn]);
  
  console.log(`📊 ${crn} → ${latestStatus.transactionStatus} (${latestStatus.responseCode})`);
  return result;
}


async function handleCallback(payload) {
  // Match by crn/transaction_id
  const [payouts] = await pool.execute(
    'SELECT id FROM payout_requests WHERE crn = ? OR transaction_id = ?',
    [payload.crn, payload.transactionid]
  );
  
  if (payouts.length === 0) {
    console.log('⚠️ Callback orphan:', payload.crn);
    return;
  }
  
  await pool.execute(`
    INSERT INTO axis_callbacks (
      payout_id, crn, transaction_id, utr_no, transaction_status,
      status_description, response_code, batch_no, amount, raw_payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    payouts[0].id,
    payload.crn,
    payload.transactionid,
    payload.utrNo,
    payload.transactionStatus,
    payload.statusDescription,
    payload.responseCode,
    payload.batchNo,
    payload.amount,
    JSON.stringify(payload)
  ]);
}

// Using
async function getMerchantBalance(merchantId) {
  const [rows] = await pool.execute(`
    SELECT 
      m.app_balance,
      COALESCE(SUM(CASE pr.status WHEN 'pending' THEN pr.txn_amount ELSE 0 END), 0) as pending_payouts,
      m.axis_balance
    FROM merchants m 
    LEFT JOIN payout_requests pr ON m.id = pr.merchant_id AND pr.status IN ('pending', 'processing')
    WHERE m.id = ?
    GROUP BY m.id
  `, [merchantId]);
  
  return rows[0] || { app_balance: 0, pending_payouts: 0, axis_balance: 0 };
}

// Using
async function saveBalanceSnapshot(merchantId, corpAccNum, axisData) {
  const balanceData = axisData?.Data?.data || axisData?.data || {};
  
  // Calculate app pending (your ledger)
  const [pendingRows] = await pool.execute(`
    SELECT COALESCE(SUM(txn_amount), 0) as pending_amount
    FROM payout_requests 
    WHERE merchant_id = ? AND status IN ('pending', 'processing')
  `, [merchantId]);
  
  await pool.execute(`
    INSERT INTO balance_snapshots (
      merchant_id, corp_acc_num, corp_code, channel_id,
      axis_balance, app_pending_out, raw_response
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    merchantId,
    corpAccNum,
    config.corpCode,  // From your config
    config.channelId,
    balanceData.Balance || 0,
    pendingRows[0].pending_amount,
    JSON.stringify(axisData)
  ]);
  
  console.log(`💾 Balance snapshot saved for merchant ${merchantId}`);
}

async function getLatestBalance(merchantId) {
  const [rows] = await pool.execute(`
    SELECT * FROM balance_snapshots 
    WHERE merchant_id = ? 
    ORDER BY fetched_at DESC LIMIT 1
  `, [merchantId]);
  return rows[0];
}

module.exports = {
  createFundTransfer,
  updatePayoutStatus,
  handleCallback,
  saveBalanceSnapshot,
  getLatestBalance,
  getMerchantBalance
};
