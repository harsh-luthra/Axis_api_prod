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
  
  // ? Map ONLY known fields (37+ safe)
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
  
  // ? Dynamic: Build query from keys
  const columns = Object.keys(knownFields);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map(col => knownFields[col]);
  
  const [result] = await pool.execute(`
    INSERT INTO payout_requests (${columns.join(', ')}) 
    VALUES (${placeholders})
  `, values);
  
  console.log(`? Transfer saved: ID ${result.insertId}, CRN ${paymentDetails.custUniqRef}`);
  return result.insertId;
}


async function updatePayoutStatus(crn, axisResponse) {
  try {
    const safeNull = (val) => val === '' || val == null ? null : val;
    
    const parseProcessingDate = (dateStr) => {
      if (!dateStr) return null;
      try {
        const [datePart, timePart] = dateStr.split(' ');
        const [dd, mm, yyyy] = datePart.split('-');
        return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')} ${timePart}`;
      } catch {
        return null;
      }
    };
    
    // ? String ? Tinyint (PDF spec[file:190])
    const mapStatusToInt = (statusStr) => {
      const map = {
        'PENDING': 1,
        'REJECTED': 2,
        'PROCESSED': 3,
        'Return': 4
      };
      return map[statusStr] || 1;
    };
    
    const enqArray = axisResponse.decrypted?.Data?.data?.CUR_TXN_ENQ || [];
    const latestStatus = enqArray.find(item => item.crn === crn) || enqArray[0];
    
    if (!latestStatus) {
      console.warn('⚠️  No status found for CRN:', crn);
      return null;
    }
    
    const txnStatusInt = mapStatusToInt(latestStatus.transactionStatus);
    
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
      safeNull(latestStatus.corpCode),
      safeNull(latestStatus.crn),
      safeNull(latestStatus.utrNo),
      txnStatusInt,                          // ? 2 = "REJECTED"
      safeNull(latestStatus.statusDescription),
      safeNull(latestStatus.batchNo),
      parseProcessingDate(latestStatus.processingDate),
      safeNull(latestStatus.responseCode),
      safeNull(axisResponse.decrypted?.Data?.data?.checksum),
      JSON.stringify(axisResponse.decrypted?.Data)
    ]);
    
    // Update main payout
    // ? FIXED - No comments inside SQL
    console.log('ℹ️  Updating payout_requests:', {
      crn,
      txnStatusInt,
      statusDescription: safeNull(latestStatus.statusDescription)
    });

    await pool.execute(`
      UPDATE payout_requests SET 
        status = CASE 
          WHEN ? = 3 THEN 'processed'
          WHEN ? = 4 THEN 'return'
          WHEN ? = 2 THEN 'reject'
          ELSE 'pending'
        END, 
        status_description = ?,
        response_code = ?,
        batch_no = ?,
        transaction_id = ?,
        utr_no = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE crn = ?
    `, [txnStatusInt, txnStatusInt, txnStatusInt, safeNull(latestStatus.statusDescription), safeNull(latestStatus.responseCode), safeNull(latestStatus.batchNo), safeNull(latestStatus.transactionId), safeNull(latestStatus.utrNo), crn]);

    console.log(`✅ ${crn} → ${latestStatus.transactionStatus} (${txnStatusInt})`);
    return result;
  } catch (err) {
    console.error('❌ updatePayoutStatus Error for CRN', crn, ':', err.message);
    throw err;
  }
}


async function handleCallback(payload) {
  try {
    console.log('🔍 DB payload:', payload);

    const [payouts] = await pool.execute(
      'SELECT id FROM payout_requests WHERE crn = ? OR transaction_id = ?',
      [payload.crn?.trim(), payload.transactionId]
    );
    
    if (payouts.length === 0) {
      console.log('❌ Orphan:', payload.crn);
      return;
    }
    
    await pool.execute(`
      INSERT INTO axis_callbacks (
        payout_id, crn, transaction_id, utr_no, transaction_status,
        status_description, response_code, batch_no, amount, raw_payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      payouts[0].id,
      payload.crn?.trim(),
      payload.transactionId,
      payload.utrNo || null,
      payload.transactionStatus || payload.status,        // ✅ Fallback
      payload.statusDescription,
      payload.responseCode || null,                      // ✅ Explicit NULL
      payload.batchNo || null,
      payload.amount,
      JSON.stringify(payload)
    ]);
    
    console.log('✅ Saved:', payload.crn);
    // Persist utr_no and transaction_id back to payout_requests so main row reflects callback values
    try {
      await pool.execute(
        'UPDATE payout_requests SET response_code = ?, batch_no = ?, utr_no = ?, transaction_id = ?, updated_at = CURRENT_TIMESTAMP WHERE crn = ?',
        [payload.responseCode || null, payload.batchNo || null, payload.utrNo || null, payload.transactionId || null, payload.crn?.trim()]
      );
    } catch (uerr) {
      console.warn('⚠️ Failed to update payout_requests response_code/batch_no/utr/transaction_id for', payload.crn, uerr.message);
    }
    
    // Update payout status from callback
    try {
      const safeNull = (val) => val === '' || val == null ? null : val;
      const axisResponse = {
        decrypted: {
          Data: {
            data: {
              CUR_TXN_ENQ: [{
                crn: safeNull(payload.crn?.trim()),
                transactionStatus: safeNull(payload.transactionStatus || payload.status),
                statusDescription: safeNull(payload.statusDescription),
                utrNo: safeNull(payload.utrNo),
                batchNo: safeNull(payload.batchNo),
                responseCode: safeNull(payload.responseCode),
                corpCode: safeNull(payload.corpCode),
                processingDate: safeNull(payload.processingDate),
                checksum: safeNull(payload.checksum)
              }],
              checksum: safeNull(payload.checksum)
            }
          }
        }
      };
      
      await updatePayoutStatus(payload.crn?.trim(), axisResponse);
    } catch (statusUpdateErr) {
      console.error('⚠️  Status update failed for CRN', payload.crn, ':', statusUpdateErr.message);
      // Don't re-throw - callback was already saved
    }
  } catch (err) {
    console.error('❌ handleCallback Error:', err.message);
    throw err;
  }
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
  
  console.log(`? Balance snapshot saved for merchant ${merchantId}`);
}

async function checkFundTransferExists(custUniqRef) {
  const [rows] = await pool.execute('SELECT id FROM payout_requests WHERE crn = ?', [custUniqRef]);
  return rows.length > 0;
}

async function getLatestBalance(merchantId) {
  const [rows] = await pool.execute(`
    SELECT * FROM balance_snapshots 
    WHERE merchant_id = ? 
    ORDER BY fetched_at DESC LIMIT 1
  `, [merchantId]);
  return rows[0];
}

// ============================================================================
// Cursor-paginated payout fetcher (FULL FIXED VERSION)
// ============================================================================
/**
 * Fetch payout_requests with cursor pagination.
 * @param {number} merchantId - Merchant ID to filter by (optional: null for all)
 * @param {number} limit - Rows per page (default 50, max 200)
 * @param {string} cursor - Base64-encoded cursor (format: 'id_DESC' or 'id_ASC')
 * @param {string} mode - 'full' (all fields) or 'half' (summary fields)
 * @returns { payouts, nextCursor, hasMore }
 */
async function getPayoutsCursorPaginated(merchantId = null, limit = 50, cursor = null, mode = 'full') {
  // Validate and normalize limit
  const validLimits = [50, 100, 200];
  if (!validLimits.includes(limit)) {
    limit = 50; // default
  }

  // Decode cursor: format is "id_direction" base64-encoded
  let cursorId = null;
  let direction = 'DESC';
  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      const [id, dir] = decoded.split('_');
      cursorId = parseInt(id, 10);
      direction = dir === 'ASC' ? 'ASC' : 'DESC';
    } catch (e) {
      console.warn('Invalid cursor:', cursor);
      cursorId = null;
    }
  }

  // ✅ FIXED: Select fields based on mode
  let selectClause;
  if (mode === 'half') {
    selectClause = `pr.id, pr.crn, pr.txn_amount, pr.bene_name, pr.status, pr.created_at, pr.updated_at`;
  } else {
    selectClause = `pr.id, pr.merchant_id, pr.crn, pr.txn_paymode, pr.txn_type, pr.txn_amount,
      pr.bene_code, pr.bene_name, pr.bene_acc_num, pr.bene_ifsc_code,
      pr.bene_bank_name, pr.corp_acc_num, pr.value_date, pr.status, pr.created_at, pr.updated_at`;
  }

  // ✅ FIXED: Build WHERE clause with parameters correctly
  let whereParts = [];
  let whereParams = [];

  if (merchantId) {
    whereParts.push('pr.merchant_id = ?');
    whereParams.push(merchantId);
  }

  if (cursorId !== null) {
    if (direction === 'DESC') {
      whereParts.push('pr.id < ?');
    } else {
      whereParts.push('pr.id > ?');
    }
    whereParams.push(cursorId);
  }

  const whereClause = whereParts.length > 0 ? whereParts.join(' AND ') : '1=1';
  const fetchLimit = limit + 1;
  
  // ✅ FIXED: Params = whereParams + LIMIT (exact match!)
  const queryParams = [...whereParams, fetchLimit];

  try {
    // ✅ FIXED: Use selectClause + table alias for safety
    const sql = `SELECT ${selectClause} 
                 FROM payout_requests pr 
                 WHERE ${whereClause} 
                 ORDER BY pr.id ${direction} 
                 LIMIT ?`;
    
    console.log('📋 Query debug:', { 
      whereClause, 
      whereParams, 
      fetchLimit, 
      totalParams: queryParams.length,
      sqlPreview: sql.substring(0, 200) + '...'
    });
    console.log('📋 Full SQL:', sql);
    console.log('📋 Params array:', queryParams);
    
    const [rows] = await pool.execute(sql, queryParams);

    // Determine if there are more rows beyond this page
    const hasMore = rows.length > limit;
    const payouts = rows.slice(0, limit);

    // Generate next cursor
    let nextCursor = null;
    if (hasMore && payouts.length > 0) {
      const lastId = payouts[payouts.length - 1].id;
      nextCursor = Buffer.from(`${lastId}_${direction}`).toString('base64');
    }

    return {
      success: true,
      payouts,
      pagination: {
        limit,
        cursor: cursor || null,
        nextCursor,
        hasMore,
        count: payouts.length,
        direction
      }
    };
  } catch (err) {
    console.error('❌ getPayoutsCursorPaginated error:', err.message);
    console.error('SQL error code:', err.code);
    console.error('SQL:', sql);
    console.error('Params:', queryParams);
    throw err;
  }
}


module.exports = {
  createFundTransfer,
  updatePayoutStatus,
  handleCallback,
  saveBalanceSnapshot,
  getLatestBalance,
  getMerchantBalance,
  checkFundTransferExists,
  getPayoutsCursorPaginated
};
