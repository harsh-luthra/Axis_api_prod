const axios = require('axios');

async function sendCallback(record) {
  try {
    const response = await axios.post(
      'https://orbitwealth.co.in/utr/callback.php',
      {
        crn: record.crn,
        transactionId: record.transaction_id,
        utrNo: record.utrNo,
        transactionStatus: record.transactionStatus,
        statusDescription: record.statusDescription,
        responseCode: record.responseCode,
        batchNo: record.batchNo,
        amount: record.amount
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    console.log('✅ Callback sent successfully');
    console.log('Response:', response.data);

  } catch (error) {
    console.error('❌ Error sending callback');
    console.error(error.response?.data || error.message);
  }
}

// Example usage:
const record = {
  crn: "123456",
  transaction_id: "TXN789",
  utrNo: "UTR123456789",
  transactionStatus: "SUCCESS",
  statusDescription: "Transaction completed",
  responseCode: "00",
  batchNo: "BATCH001",
  amount: 500
};

sendCallback(record);