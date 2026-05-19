// Test script using real Stripe API
const BASE_URL = 'http://localhost:3001';

async function testCreateRealSession() {
  console.log('\n🔍 Testing Create Onramp Session with USDC (as MUSD proxy)...');
  console.log('Note: Using USDC since MUSD is not yet supported by Stripe Crypto');
  
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
      console.log('✅ Session created successfully!');
      console.log('Session ID:', data.data.sessionId);
      console.log('Client Secret:', data.data.clientSecret ? 'Present ✓' : 'Missing ✗');
      console.log('URL:', data.data.url);
      console.log('\n📝 You can now use this client_secret in the frontend OnrampWidget');
      console.log('   or visit the URL directly to test the Stripe-hosted onramp');
      return data.data;
    } else {
      console.error('❌ Session creation failed:', data);
      return null;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return null;
  }
}

async function runTest() {
  console.log('🚀 Testing with Real Stripe Crypto API\n');
  console.log('Make sure:');
  console.log('1. Payment service is running on http://localhost:3001');
  console.log('2. You have valid Stripe API keys in .env');
  console.log('3. Your Stripe account has Crypto Onramp access\n');

  const session = await testCreateRealSession();
  
  if (session) {
    console.log('\n✨ Test completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Visit the URL above to complete a test purchase');
    console.log('2. Use sandbox values:');
    console.log('   - OTP: 000000');
    console.log('   - SSN: 000000000');
    console.log('   - Address: address_full_match');
    console.log('   - Card: 4242424242424242');
  }
}

runTest();
