/**
 * Quick Load Test - 50 users to validate increased rate limits
 */

const https = require('http');

const TOTAL_USERS = 50;
const TEST_DURATION_MS = 30000; // 30 seconds

async function makeRequest(userId) {
  const requestData = JSON.stringify({
    code: 'print("Hello World")',
    language: 'python'
  });

  const options = {
    hostname: 'localhost',
    port: 8910,
    path: '/execute',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestData)
    }
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, userId });
      });
    });

    req.on('error', () => {
      resolve({ status: 'error', userId });
    });

    req.write(requestData);
    req.end();
  });
}

async function quickTest() {
  console.log(`🚀 Quick test with ${TOTAL_USERS} users...`);
  
  const promises = [];
  for (let i = 1; i <= TOTAL_USERS; i++) {
    promises.push(makeRequest(i));
  }

  const results = await Promise.all(promises);
  
  const successful = results.filter(r => r.status === 200).length;
  const failed = results.filter(r => r.status === 429).length;
  const errors = results.filter(r => r.status === 'error').length;

  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Rate limited: ${failed}`);
  console.log(`🔥 Errors: ${errors}`);
  console.log(`📊 Success rate: ${((successful / TOTAL_USERS) * 100).toFixed(1)}%`);
  
  if (successful > 40) {
    console.log('🟢 Rate limit increase SUCCESSFUL - system can handle burst load');
  } else {
    console.log('🔴 Still rate limited - need further optimization');
  }
}

quickTest().catch(console.error);
