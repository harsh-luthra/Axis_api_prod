require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3001;
const BASE_PATH = process.env.BASE_PATH || '/dashboard';
const distDir = path.join(__dirname, 'dist');

app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(BASE_PATH, express.static(distDir));

app.get(`${BASE_PATH}*`, (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

if (BASE_PATH !== '/') {
  app.get('/', (req, res) => res.redirect(BASE_PATH + '/'));
}

app.listen(PORT, () => {
  console.log(`Dashboard listening on port ${PORT}, serving ${BASE_PATH}/`);
});
