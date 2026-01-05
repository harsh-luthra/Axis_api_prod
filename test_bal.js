const config = require('./src/config/axisConfig');
const { getBalance } = require('./src/api/getBalance.js');


const result = getBalance();


console.log('Balance API Result:', result);