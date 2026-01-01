module.exports = {
  env: 'UAT', // or 'PROD'

  urls: {
    UAT: {
      transferPayment: 'https://sakshamuat.axisbank.co.in/gateway/api/txb/v3/payments/transfer-payment',
      getStatus:       'https://sakshamuat.axisbank.co.in/gateway/api/txb/v3/acct-recon/get-status',
      getBalance:      'https://sakshamuat.axisbank.co.in/gateway/api/txb/v3/acct-recon/get-balance'
    },
    PROD: {
      transferPayment: 'https://saksham.axisbank.co.in/gateway/api/txb/v3/payments/transfer-payment',
      getStatus:       'https://saksham.axisbank.co.in/gateway/api/txb/v3/acct-recon/get-status',
      getBalance:      'https://saksham.axisbank.co.in/gateway/api/txb/v3/acct-recon/get-balance'
    }
  },

  headersBase: {
    'x-fapi-serviceId': 'OpenApi',    // static per docs[file:2][file:6]
    'x-fapi-serviceVersion': '1.0'
  },

  // replace with values provided by Axis
  clientId: 'ebf466922dd17136e20b00544d6b9758',
  clientSecret: '25a52b58256cc2b3dce279304a2b7f2c',
  channelId: 'ELEVENPAY',
  corpCode: 'DEMOCORP159',

  // JWE/JWS crypto
  jwe: {
    // Axis public cert for JWE encryption + JWS verification (.cer/.pem)
    axisPublicCertPath: './certs/rgw.jwejws.uat.axisb.com-sscert.txt',
    // Your PKCS#12 that contains your RSA private key for signing + decrypting
    clientP12Path: './certs/keystore.p12',
    clientP12Password: 'Axis1234@A'
  },

  // Callback AES key etc (from callback docs)
  callback: {
    aesKeyHex: 'cb82007729a99c66a7880952d689b767d66a3a484f7af6f454d329b32cb4cabc', // example from doc[file:7]
    // If Axis gives you a different IV scheme, change AES util accordingly.
  }
};
