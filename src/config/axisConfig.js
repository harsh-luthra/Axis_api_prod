const path = require('path');

const env = process.env;

module.exports = {
  env: env.AXIS_ENV || 'UAT',

  urls: {
    UAT: {
      getBalance:      'https://sakshamuat.axis.bank.in/gateway/api/txb/v3/acct-recon/get-balance',
      beneReg:         'https://sakshamuat.axis.bank.in/gateway/api/txb/v3/payee-mgmt/beneficiary-registration',
      beneEnquiry:     'https://sakshamuat.axis.bank.in/gateway/api/txb/v3/payee-mgmt/beneficiary-enquiry',
      transferPayment: 'https://sakshamuat.axis.bank.in/gateway/api/txb/v3/payments/transfer-payment',
      transferStatus:  'https://sakshamuat.axis.bank.in/gateway/api/txb/v3/acct-recon/get-status'
    },
    PROD: {
      transferPayment: 'https://saksham.axis.bank.in/gateway/api/txb/v3/payments/transfer-payment',
      transferStatus:  'https://saksham.axis.bank.in/gateway/api/txb/v3/acct-recon/get-status',
      getBalance:      'https://saksham.axis.bank.in/gateway/api/txb/v3/acct-recon/get-balance'
    }
  },

  headersBase: {
    'x-fapi-serviceId': env.AXIS_FAPI_SERVICE_ID || 'OpenApi',
    'x-fapi-serviceVersion': env.AXIS_FAPI_SERVICE_VERSION || '1.0'
  },

  // Sensitive values should come from environment variables in prod
  clientId: env.AXIS_CLIENT_ID || 'ebf466922dd17136e20b00544d6b9758',
  clientSecret: env.AXIS_CLIENT_SECRET || '25a52b58256cc2b3dce279304a2b7f2c',
  channelId: env.AXIS_CHANNEL_ID || 'ELEVENPAY',
  corpCode: env.AXIS_CORP_CODE || 'DEMOCORP159',
  corpAccNum: env.AXIS_CORP_ACC || '309010100067740',

  MASTER_API_KEY: env.MASTER_API_KEY || '0123456789abcdef0123456789abcdef',

  jwe: {
    axisPublicCertPath: env.AXIS_PUBLIC_CERT_PATH || path.resolve(__dirname, '../../certs/rgw.jwejws.uat.axisb.com-sscert.txt'),
    clientP12Path: env.CLIENT_P12_PATH || path.resolve(__dirname, '../../certs/keystore.p12'),
    clientP12Password: env.CLIENT_P12_PASSWORD || 'Axis1234@A'
  },

  callback: {
    aesKeyHex: env.AXIS_CALLBACK_KEY_HEX || '7d320cf27dab0564a8de42f4ca9f00ca'
  }
};
