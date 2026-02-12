module.exports = {
  env: 'PROD', // or 'PROD'

  // https://sakshamuat.axisbank.co.in/gateway/api/txb/v3/payee-mgmt/beneficiary-registration

  urls: {
    UAT: {
      getBalance:      'https://sakshamuat.axis.bank.in/gateway/api/txb/v3/acct-recon/get-balance',
      beneReg:         'https://sakshamuat.axis.bank.in/gateway/api/txb/v3/payee-mgmt/beneficiary-registration', // POST
      beneEnquiry:     'https://sakshamuat.axis.bank.in/gateway/api/txb/v3/payee-mgmt/beneficiary-enquiry', // POST
      transferPayment: 'https://sakshamuat.axis.bank.in/gateway/api/txb/v3/payments/transfer-payment',
      transferStatus:  'https://sakshamuat.axis.bank.in/gateway/api/txb/v3/acct-recon/get-status',
    },

    PROD: {
      transferPayment: 'https://saksham.axisbank.co.in/gateway/api/txb/v3/payments/transfer-payment',
      transferStatus:  'https://saksham.axisbank.co.in/gateway/api/txb/v3/acct-recon/get-status',
      getBalance:      'https://saksham.axisbank.co.in/gateway/api/txb/v3/acct-recon/get-balance'
    }
  },

  headersBase: {
    'x-fapi-serviceId': 'OpenApi',// static per docs[file:2][file:6]
    'x-fapi-serviceVersion': '1.0'
  },

  // replace with values provided by Axis
  clientId: '984b95cd19c30af9bbf36d2e8f0db67b',
  clientSecret: '9332840d867a45d9f9de287971f533a8',
  channelId: 'ELEVENPAY',
  corpCode: 'EPSPL',
  corpAccNum: '925020023195501',

  MASTER_API_KEY: '0123456789abcdef0123456789abcdef', // example from doc[file:7]

  // JWE/JWS crypto
  jwe: {
    // Axis public cert for JWE encryption + JWS verification (.cer/.pem)
    axisPublicCertPath: './certs/rgw.jwejws.axisb.com-sscert.txt',
    // Your PKCS#12 that contains your RSA private key for signing + decrypting
    clientP12Path: './certs/keystore.p12',
    clientP12Password: 'Axis1234@A'
  },

  // Callback AES key etc (from callback docs)
  callback: {
    aesKeyHex: 'acc28c91a3bdfc918a5067e19adeae1a', // example from doc[file:7]
    // ce98611eb501e541cca90c0229ec797e  // IV
    // If Axis gives you a different IV scheme, change AES util accordingly.
  }
};
