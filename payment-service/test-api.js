// Simple test script to verify API endpoints
const BASE_URL = 'http://localhost:3001';

async function testHealthCheck() {
  console.log('\n🔍 Testing Health Check...');
  try {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    console.log('✅ Health check passed:', data);
    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

async function testGetQuote() {
  console.log('\n🔍 Testing Get Quote...');
  try {
    const response = await fetch(
      `${BASE_URL}/api/v1/onramp/quotes?sourceAmount=100&sourceCurrency=usd&destinationCurrency=musd`
    );
    const data = await response.json();
    console.log('✅ Quote retrieved:', JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Get quote failed:', error.message);
    return false;
  }
}

async function testCreateSession() {
  console.log('\n🔍 Testing Create Onramp Session...');
  try {
    const response = await fetch(`${BASE_URL}/api/v1/onramp/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        sourceAmount: '100',
        sourceCurrency: 'usd',
      }),
    });
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Session created:', {
        sessionId: data.data.sessionId,
        hasClientSecret: !!data.data.clientSecret,
      });
      return data.data.sessionId;
    } else {
      console.error('❌ Session creation failed:', data);
      return null;
    }
  } catch (error) {
    console.error('❌ Create session failed:', error.message);
    return null;
  }
}

async function testGetSession(sessionId) {
  console.log('\n🔍 Testing Get Session...');
  try {
    const response = await fetch(`${BASE_URL}/api/v1/onramp/sessions/${sessionId}`);
    const data = await response.json();
    console.log('✅ Session retrieved:', JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Get session failed:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting API Tests...\n');
  console.log('Make sure the payment service is running on http://localhost:3001\n');

  const healthOk = await testHealthCheck();
  if (!healthOk) {
    console.log('\n❌ Server is not running. Start it with: npm run dev');
    return;
  }

  await testGetQuote();
  
  const sessionId = await testCreateSession();
  if (sessionId) {
    await testGetSession(sessionId);
  }

  console.log('\n✨ Tests completed!\n');
}

runTests();
