const express = require('express');
const bodyParser = require('body-parser');
// const { decryptAes128Base64 } = require('./security/aesCallback');
const { verifyChecksumAxis } = require('./src/security/checksumAxis');

const { decryptAes256Callback } = require('./src/security/aesCallback');

const app = express();

// Axis might send JSON or just the encrypted string; adjust parser as per their config.
app.use(bodyParser.json());
app.use(bodyParser.text({ type: '*/*' })); // to capture plain text encrypted body

// Example callback endpoint
app.post('/axis/callback', async (req, res) => {
  try {
    // If Axis posts { GetStatusResponseBodyEncrypted: "<cipher>" }
    const cipher = req.body.GetStatusResponseBodyEncrypted || req.body;
    const decryptedJson = decryptAes256Callback(cipher);
    const parsed = JSON.parse(decryptedJson); // { data: { ... , checksum: '...' } } [file:1]

    const data = parsed.data || parsed.Data || parsed;
    const isValidChecksum = verifyChecksumAxis(data);

    if (!isValidChecksum) {
      console.error('Invalid checksum in callback');
      return res.status(400).send('Checksum verification failed');
    }

    // process transaction status
    // e.g. crn, utrNo, transactionStatus, responseCode, etc.[file:1]
    console.log('Callback data:', data);

    // Respond 200 to mark as success per docs.[file:1]
    res.status(200).send('OK');
  } catch (err) {
    console.error('Callback error', err);
    res.status(500).send('ERROR');
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Axis integration test server listening on port ${PORT}`);
});
