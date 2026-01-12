/**
 * Quick deployment verification script
 * Run: node test-azure-deployment.js
 */

const https = require('https');

// Replace with your Azure App Service URL
const API_URL = process.env.API_URL || 'https://matchpod-api-gbfkdygcdqdjh7f7.canadacentral-01.azurewebsites.net';

console.log('🔍 Testing Azure App Service Deployment...\n');
console.log(`📍 API URL: ${API_URL}\n`);

// Test 1: Health Check
console.log('1️⃣ Testing Health Endpoint...');
https.get(`${API_URL}/api/health`, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const health = JSON.parse(data);
      console.log('✅ Health Check Response:');
      console.log(JSON.stringify(health, null, 2));
      
      if (health.status === 'healthy') {
        console.log('\n✅ All services are healthy!');
      } else {
        console.log('\n⚠️ Some services may be unhealthy');
      }
      
      // Test 2: API Info
      console.log('\n2️⃣ Testing API Info Endpoint...');
      https.get(`${API_URL}/api`, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const info = JSON.parse(data);
            console.log('✅ API Info Response:');
            console.log(JSON.stringify(info, null, 2));
            console.log('\n✅ Deployment verification complete!');
          } catch (e) {
            console.error('❌ Failed to parse API info:', e.message);
          }
        });
      }).on('error', (err) => {
        console.error('❌ API Info request failed:', err.message);
      });
      
    } catch (e) {
      console.error('❌ Failed to parse health check:', e.message);
      console.log('Raw response:', data);
    }
  });
}).on('error', (err) => {
  console.error('❌ Health check request failed:', err.message);
  console.log('\n💡 Make sure:');
  console.log('   - App Service is running');
  console.log('   - URL is correct');
  console.log('   - No firewall blocking requests');
});

