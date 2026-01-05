const pool = require('./mysql');

async function createPayoutTransfer(payload, axisResponse) {
  const [result] = await pool.execute(`
    INSERT INTO payout_requests (
      merchant_id, crn, idempotency_key, txn_paymode, txn_type, txn_amount, 
      bene_ifsc_code, bene_acc_num, value_date, bene_name, corp_acc_num,
      checksum_sent, axis_txn_ref, axis_response, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    payload.merchant_id || 1,
    payload.custUniqRef,  // CRN - golden key
    payload.idempotency_key || crypto.randomUUID(),
    payload.txnPaymode,
    payload.txnType || 'CUST',
    payload.txnAmount,
    payload.beneIfscCode,
    payload.beneAccNum,
    payload.valueDate,
    payload.beneName,
    payload.corpAccNum,
    payload.checksum,
    axisResponse?.data?.txnReferenceId,
    JSON.stringify(axisResponse),
    axisResponse?.data?.status === 'S' ? 'processing' : 'failed'
  ]);
  
  return result.insertId;
}

async function updatePayoutStatus(crn, statusData) {
  const [result] = await pool.execute(`
    INSERT INTO payout_status_events (
      payout_id, crn, utr_no, transaction_status, status_description,
      respone_code, batch_no, processing_date, raw_response
    ) VALUES (
      (SELECT id FROM payout_requests WHERE crn = ?), ?, ?, ?, ?, ?, ?, ?, ?
    ) ON DUPLICATE KEY UPDATE 
    updated_at = CURRENT_TIMESTAMP
  `, [
    crn,
    crn,
    statusData.utrNo,
    statusData.transactionStatus,
    statusData.statusDescription,
    statusData.responeCode,
    statusData.batchNo,
    statusData.processingDate,
    JSON.stringify(statusData)
  ]);
  
  // Update main request status
  await pool.execute(`
    UPDATE payout_requests 
    SET status = CASE 
      WHEN ? = 3 THEN 'success'
      WHEN ? = 4 THEN 'return' 
      WHEN ? = 2 THEN 'failed'
      ELSE 'processing'
    END, updated_at = CURRENT_TIMESTAMP
    WHERE crn = ?
  `, [statusData.transactionStatus, statusData.transactionStatus, statusData.transactionStatus, crn]);
  
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
    balanceData.balance || 0,
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
  createPayoutTransfer,
  updatePayoutStatus,
  handleCallback,
  saveBalanceSnapshot,
  getLatestBalance,
  getMerchantBalance
};
