#!/usr/bin/env node

/**
 * Deployment Test Script
 * Tests both local and production deployments
 * 
 * Usage:
 *   node test-deployment.js local
 *   node test-deployment.js production <vercel-url> <backend-url>
 */

const fetch = require('node-fetch');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message) {
  log(`✅ ${message}`, colors.green);
}

function error(message) {
  log(`❌ ${message}`, colors.red);
}

function info(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

function warn(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

async function testEndpoint(name, url, method = 'GET', body = null) {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);

    log(`  Testing: ${url}`, colors.gray);
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({ raw: true }));

    if (response.ok) {
      success(`${name}: OK (${response.status})`);
      return { success: true, data };
    } else {
      error(`${name}: Failed (${response.status})`);
      return { success: false, status: response.status, data };
    }
  } catch (err) {
    error(`${name}: Error - ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function testLocal() {
  info('Testing LOCAL deployment...\n');

  const frontendUrl = 'http://localhost:55964';
  const backendUrl = 'http://localhost:3001';

  // Test backend
  log('\n📦 Backend Server Tests:', colors.blue);
  await testEndpoint('Health Check', `${backendUrl}/health`);

  // Test frontend
  log('\n🌐 Frontend Tests:', colors.blue);
  const frontendTest = await testEndpoint('Homepage', frontendUrl);
  if (!frontendTest.success) {
    warn('Frontend not running. Start with: npm run dev');
  }

  // Test API routes
  log('\n🔌 API Routes Tests:', colors.blue);
  await testEndpoint('Session Status', `${frontendUrl}/api/session-status`);

  log('\n✨ Local testing complete!\n');
}

async function testProduction(vercelUrl, backendUrl) {
  info(`Testing PRODUCTION deployment...\n`);
  
  // Clean URLs
  vercelUrl = vercelUrl.replace(/\/$/, '');
  backendUrl = backendUrl.replace(/\/$/, '');

  // Test backend
  log('\n📦 Backend Server Tests:', colors.blue);
  const healthCheck = await testEndpoint('Health Check', `${backendUrl}/health`);
  
  if (!healthCheck.success) {
    error('Backend is not responding!');
    warn('Make sure your backend is deployed and running.');
    return;
  }

  // Test frontend
  log('\n🌐 Frontend Tests:', colors.blue);
  const frontendTest = await testEndpoint('Homepage', vercelUrl);
  
  if (!frontendTest.success) {
    error('Frontend is not responding!');
    return;
  }

  // Test API routes
  log('\n🔌 API Routes Tests:', colors.blue);
  await testEndpoint('Session Status', `${vercelUrl}/api/session-status`);

  // Test Instagram (sample URL)
  log('\n📸 Instagram API Test:', colors.blue);
  const instagramTest = await testEndpoint(
    'Fetch Public Post',
    `${vercelUrl}/api/fetch-public`,
    'POST',
    { url: 'https://www.instagram.com/p/sample' }
  );

  // Connection test
  log('\n🔗 Backend Connection Test:', colors.blue);
  info(`Frontend should connect to: ${backendUrl}`);
  info('Check browser console for any CORS errors');

  // Summary
  log('\n📊 Production Testing Summary:', colors.blue);
  success(`Frontend URL: ${vercelUrl}`);
  success(`Backend URL: ${backendUrl}`);
  
  log('\n✅ Manual Checks:', colors.yellow);
  info('1. Visit your frontend URL in a browser');
  info('2. Open browser console (F12)');
  info('3. Try downloading an Instagram post');
  info('4. Try downloading a YouTube video');
  info('5. Check for any CORS errors in console');
  
  log('\n✨ Production testing complete!\n');
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  log('\n╔════════════════════════════════════════╗', colors.blue);
  log('║   OmniSave Deployment Test Script    ║', colors.blue);
  log('╚════════════════════════════════════════╝\n', colors.blue);

  if (mode === 'local') {
    await testLocal();
  } else if (mode === 'production') {
    const vercelUrl = args[1];
    const backendUrl = args[2];

    if (!vercelUrl || !backendUrl) {
      error('Missing URLs for production testing');
      info('\nUsage:');
      info('  node test-deployment.js production <vercel-url> <backend-url>');
      info('\nExample:');
      info('  node test-deployment.js production https://my-app.vercel.app https://my-backend.railway.app');
      process.exit(1);
    }

    await testProduction(vercelUrl, backendUrl);
  } else {
    error('Invalid mode');
    info('\nUsage:');
    info('  node test-deployment.js local');
    info('  node test-deployment.js production <vercel-url> <backend-url>');
    info('\nExamples:');
    info('  node test-deployment.js local');
    info('  node test-deployment.js production https://my-app.vercel.app https://my-backend.railway.app');
    process.exit(1);
  }
}

main().catch(err => {
  error(`Fatal error: ${err.message}`);
  process.exit(1);
});
