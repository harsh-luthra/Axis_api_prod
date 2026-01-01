// const { loadKeys } = require('./src/security/p12');
// const { createPrivateKey } = require('crypto');

// const { privateKeyPem } = loadKeys();
// console.log(privateKeyPem.split('\n')[0]); // should be BEGIN RSA PRIVATE KEY or BEGIN PRIVATE KEY

// const keyObj = createPrivateKey(privateKeyPem);
// const pkcs8 = keyObj.export({ format: 'pem', type: 'pkcs8' }).toString();
// console.log(pkcs8.split('\n')[0]); // BEGIN PRIVATE KEY


const { loadKeys } = require('./src/security/p12');
const { privateKeyPemPkcs8 } = loadKeys();
console.log(privateKeyPemPkcs8.split('\n')[0]); // should be ONLY "-----BEGIN PRIVATE KEY-----"