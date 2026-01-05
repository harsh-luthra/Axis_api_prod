// testVerifyChecksumAxis.js
const { verifyChecksumAxis, generateChecksumAxis } = require('./src/security/checksumAxis');


/*
 IMPORTANT:
 - JSON below is NORMALIZED
 - Smart quotes removed
 - Line break in statusDescription FIXED (Axis removes newlines)
 - Only `data` is passed to checksum logic (per Axis rules)
*/

const payload = {
  data: {
    CUR_TXN_ENQ: [
      {
        transaction_id: "CN0006204254",
        chequeNo: null,
        statusDescription: "Credite to beneficiary on 07-05-2020 18:40:22",
        batchNo: "6r8wkrcQbzu7RpSnxSt54S4XRq7r9S",
        utrNo: "815812301659",
        transactionStatus: "PROCESSED",
        processingDate: "06-07-2020 18:40:22",
        corpCode: "DEMOCORP11",
        crn: "338200641748800",
        responseCode: "AC02",
        paymentMode: "R",
        vendorCode: "",
        amount: "",
        corporateAccountNumber: "",
        debitCreditIndicator: "",
        beneficiaryAccountNumber: "",
        extra1: "",
        extra2: "",
        extra3: "",
        extra4: "",
        extra5: ""
      }
    ],
    checksum: "6423c04adb6f5370ead0797b457c65cd"
  },
  message: "Success",
  status: "S"
};

/* ===========================
   TEST
=========================== */

console.log('🔍 Verifying Axis checksum...\n');

const isValid = verifyChecksumAxis(payload.data);
const calculated = generateChecksumAxis(payload.data);

console.log('Provided Checksum  :', payload.data.checksum);
console.log('Calculated Checksum:', calculated);
console.log('\nResult:', isValid ? '✅ CHECKSUM VALID (AXIS MATCH)' : '❌ CHECKSUM INVALID');
