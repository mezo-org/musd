#!/usr/bin/env node

/**
 * Configuration Verification Script
 * Checks if all required API keys are configured
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying API Configuration...\n');

// Check dapp/.env
const dappEnvPath = path.join(__dirname, 'dapp', '.env');
const dappEnv = fs.readFileSync(dappEnvPath, 'utf8');

const checks = {
  walletConnect: {
    name: 'WalletConnect Project ID',
    check: () => {
      const match = dappEnv.match(/VITE_WALLETCONNECT_PROJECT_ID=(.+)/);
      const value = match ? match[1].trim() : '';
      return value && value !== 'your_project_id_here';
    },
    file: 'dapp/.env',
    var: 'VITE_WALLETCONNECT_PROJECT_ID'
  },
  stripePublishable: {
    name: 'Stripe Publishable Key (dapp)',
    check: () => {
      const match = dappEnv.match(/VITE_STRIPE_PUBLISHABLE_KEY=(.+)/);
      const value = match ? match[1].trim() : '';
      return value && value.startsWith('pk_test_');
    },
    file: 'dapp/.env',
    var: 'VITE_STRIPE_PUBLISHABLE_KEY'
  },
  musdToken: {
    name: 'MUSD Token Address',
    check: () => {
      const match = dappEnv.match(/VITE_MUSD_TOKEN_ADDRESS=(.+)/);
      const value = match ? match[1].trim() : '';
      return value && value !== '0x0000000000000000000000000000000000000000';
    },
    file: 'dapp/.env',
    var: 'VITE_MUSD_TOKEN_ADDRESS',
    optional: true
  }
};

// Check payment-service/.env
const paymentEnvPath = path.join(__dirname, 'payment-service', '.env');
const paymentEnv = fs.readFileSync(paymentEnvPath, 'utf8');

checks.stripeSecret = {
  name: 'Stripe Secret Key (payment-service)',
  check: () => {
    const match = paymentEnv.match(/STRIPE_SECRET_KEY=(.+)/);
    const value = match ? match[1].trim() : '';
    return value && value.startsWith('sk_test_');
  },
  file: 'payment-service/.env',
  var: 'STRIPE_SECRET_KEY'
};

// Run checks
let allPassed = true;
let optionalMissing = [];

Object.entries(checks).forEach(([key, config]) => {
  const passed = config.check();
  const status = passed ? '✅' : (config.optional ? '⚠️' : '❌');
  
  console.log(`${status} ${config.name}`);
  
  if (!passed) {
    if (config.optional) {
      optionalMissing.push(config);
    } else {
      allPassed = false;
      console.log(`   → Missing in: ${config.file}`);
      console.log(`   → Variable: ${config.var}\n`);
    }
  }
});

console.log('\n' + '='.repeat(50) + '\n');

if (allPassed) {
  console.log('✅ All required API keys are configured!\n');
  
  if (optionalMissing.length > 0) {
    console.log('⚠️  Optional configuration missing:');
    optionalMissing.forEach(config => {
      console.log(`   - ${config.name} (${config.file})`);
    });
    console.log('\n   This is OK for now. Configure after deploying MUSD token.\n');
  }
  
  console.log('🚀 Next steps:');
  console.log('   1. Start payment service: cd payment-service && npm run dev');
  console.log('   2. Start dapp: cd dapp && npm run dev');
  console.log('   3. Open http://localhost:5175/');
  console.log('   4. Connect your Bitcoin wallet\n');
} else {
  console.log('❌ Configuration incomplete!\n');
  console.log('📝 To fix:');
  console.log('   1. Get WalletConnect Project ID from https://cloud.walletconnect.com/');
  console.log('   2. Update dapp/.env with your Project ID');
  console.log('   3. Run this script again to verify\n');
  console.log('📚 See API_KEYS_SETUP.md for detailed instructions\n');
  process.exit(1);
}
