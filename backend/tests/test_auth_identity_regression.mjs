import jwt from 'jsonwebtoken';
import { localAuthService } from '../src/services/localAuth.service.js';

const BASE_URL = 'http://127.0.0.1:8080/api';
const JWT_SECRET = 'kkv_gold_finance_rbac_secure_jwt_secret_2026_super_key_512';

console.log('═══════════════════════════════════════════════════════════════');
console.log('🧪 KKV GOLD FINANCE AUTHENTICATION & IDENTITY REGRESSION SUITE');
console.log('═══════════════════════════════════════════════════════════════\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
  }
}

async function runTests() {
  // ── TEST 1: Login with Master Admin Credentials ─────────────────────────
  console.log('1. Testing Master Admin Login (POST /api/auth/login)...');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: 'kkvgoldfinance13@gmail.com',
      password: 'Admin@123456'
    })
  });
  const loginJson = await loginRes.json();
  assert(loginRes.status === 200, `Login status code is 200 (received ${loginRes.status})`);
  assert(loginJson.success === true, 'Login response success is true');
  assert(loginJson.token && typeof loginJson.token === 'string', 'Login returned valid JWT token string');
  assert(loginJson.role === 'ADMIN', `Login returned role ADMIN (received ${loginJson.role})`);
  assert(loginJson.user?.staffId === 'KKV-ADMIN-000001', `Login user.staffId is KKV-ADMIN-000001 (received ${loginJson.user?.staffId})`);

  // Decode the minted token to inspect claims
  const decodedMinted = jwt.decode(loginJson.token);
  assert(decodedMinted.sub === 'KKV-ADMIN-000001', `Minted JWT sub is KKV-ADMIN-000001 (received ${decodedMinted?.sub})`);
  assert(decodedMinted.staffId === 'KKV-ADMIN-000001', 'Minted JWT has staffId KKV-ADMIN-000001');
  assert(decodedMinted.uid === 'uid_admin_001', `Minted JWT uid is uid_admin_001 (received ${decodedMinted?.uid})`);
  assert(decodedMinted.role === 'ADMIN', 'Minted JWT role is ADMIN');

  // ── TEST 2: GET /api/auth/me with Standard Admin Token ──────────────────
  console.log('\n2. Testing GET /api/auth/me with standard admin token...');
  const meRes = await fetch(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${loginJson.token}` }
  });
  const meJson = await meRes.json();
  assert(meRes.status === 200, `GET /auth/me returns 200 (received ${meRes.status})`);
  assert(meJson.user.role === 'ADMIN', 'GET /auth/me user role is ADMIN');
  assert(meJson.user.staffId === 'KKV-ADMIN-000001', 'GET /auth/me staffId is KKV-ADMIN-000001');

  // ── TEST 3: Previously Failing Endpoints with Standard Token ────────────
  console.log('\n3. Testing previously failing routes with standard token...');
  
  // 3a. /api/fd/payouts
  const payoutsRes = await fetch(`${BASE_URL}/fd/payouts`, {
    headers: { Authorization: `Bearer ${loginJson.token}` }
  });
  const payoutsJson = await payoutsRes.json();
  assert(payoutsRes.status === 200, `GET /api/fd/payouts returns 200 (received ${payoutsRes.status})`);
  assert(payoutsJson.success === true, 'GET /api/fd/payouts success is true');

  // 3b. /api/accounting/day-book
  const dayBookRes = await fetch(`${BASE_URL}/accounting/day-book`, {
    headers: { Authorization: `Bearer ${loginJson.token}` }
  });
  const dayBookJson = await dayBookRes.json();
  assert(dayBookRes.status === 200, `GET /api/accounting/day-book returns 200 (received ${dayBookRes.status})`);
  assert(dayBookJson.success === true, 'GET /api/accounting/day-book success is true');

  // 3c. /api/receipts
  const receiptsRes = await fetch(`${BASE_URL}/receipts`, {
    headers: { Authorization: `Bearer ${loginJson.token}` }
  });
  const receiptsJson = await receiptsRes.json();
  assert(receiptsRes.status === 200, `GET /api/receipts returns 200 (received ${receiptsRes.status})`);
  assert(receiptsJson.success === true, 'GET /api/receipts success is true');

  // 3d. /api/sessions
  const sessionsRes = await fetch(`${BASE_URL}/sessions`, {
    headers: { Authorization: `Bearer ${loginJson.token}` }
  });
  assert(sessionsRes.status === 200, `GET /api/sessions returns 200 (received ${sessionsRes.status})`);

  // ── TEST 4: EXACT PRODUCTION REGRESSION (Legacy sub: 'user_admin_001') ───
  console.log('\n4. Testing legacy production token (sub: "user_admin_001")...');
  // This is the exact token payload that failed in production logs:
  // [AUTH] JWT verification: SUCCESS
  // [AUTH] User resolution: FAILED (Account no longer exists for ID: user_admin_001)
  const legacyAdminToken = jwt.sign(
    {
      sub: 'user_admin_001',
      id: 'user_admin_001',
      email: 'kkvgoldfinance13@gmail.com',
      role: 'ADMIN'
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const legacyMe = await fetch(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${legacyAdminToken}` }
  });
  const legacyMeJson = await legacyMe.json();
  assert(legacyMe.status === 200, `Legacy token /auth/me returns 200 (received ${legacyMe.status})`);
  assert(legacyMeJson.user?.staffId === 'KKV-ADMIN-000001', `Legacy token resolves canonical staffId KKV-ADMIN-000001 (received ${legacyMeJson.user?.staffId})`);
  assert(legacyMeJson.user?.role === 'ADMIN', 'Legacy token resolves role ADMIN');

  const legacyPayouts = await fetch(`${BASE_URL}/fd/payouts`, {
    headers: { Authorization: `Bearer ${legacyAdminToken}` }
  });
  assert(legacyPayouts.status === 200, `Legacy token /api/fd/payouts returns 200 (received ${legacyPayouts.status})`);

  const legacyDayBook = await fetch(`${BASE_URL}/accounting/day-book`, {
    headers: { Authorization: `Bearer ${legacyAdminToken}` }
  });
  assert(legacyDayBook.status === 200, `Legacy token /api/accounting/day-book returns 200 (received ${legacyDayBook.status})`);

  const legacyReceipts = await fetch(`${BASE_URL}/receipts`, {
    headers: { Authorization: `Bearer ${legacyAdminToken}` }
  });
  assert(legacyReceipts.status === 200, `Legacy token /api/receipts returns 200 (received ${legacyReceipts.status})`);

  // ── TEST 5: Firebase UID Identity Mapping (sub: 'uid_admin_001') ─────────
  console.log('\n5. Testing Firebase Auth UID mapping (sub: "uid_admin_001")...');
  const firebaseUidToken = jwt.sign(
    {
      sub: 'uid_admin_001',
      uid: 'uid_admin_001',
      email: 'kkvgoldfinance13@gmail.com',
      role: 'ADMIN'
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const fbMe = await fetch(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${firebaseUidToken}` }
  });
  const fbMeJson = await fbMe.json();
  assert(fbMe.status === 200, `Firebase UID token /auth/me returns 200 (received ${fbMe.status})`);
  assert(fbMeJson.user?.staffId === 'KKV-ADMIN-000001', 'Firebase UID token resolves canonical staffId KKV-ADMIN-000001');

  const fbPayouts = await fetch(`${BASE_URL}/fd/payouts`, {
    headers: { Authorization: `Bearer ${firebaseUidToken}` }
  });
  assert(fbPayouts.status === 200, `Firebase UID token /api/fd/payouts returns 200 (received ${fbPayouts.status})`);

  // ── TEST 6: Missing User Record Handling ─────────────────────────────────
  console.log('\n6. Testing missing user record (non-existent ID)...');
  const nonExistentToken = jwt.sign(
    {
      sub: 'non_existent_staff_999999',
      id: 'non_existent_staff_999999',
      email: 'ghost_user@nonexistent.domain',
      role: 'STAFF'
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const nonExistentRes = await fetch(`${BASE_URL}/fd/payouts`, {
    headers: { Authorization: `Bearer ${nonExistentToken}` }
  });
  const nonExistentJson = await nonExistentRes.json();
  assert(nonExistentRes.status === 401, `Non-existent user receives 401 Unauthorized (received ${nonExistentRes.status})`);
  assert(nonExistentJson.error === 'UNAUTHORIZED', 'Error code is UNAUTHORIZED');
  assert(nonExistentJson.message === 'User account no longer exists.', `Expected exact message: "User account no longer exists." (received "${nonExistentJson.message}")`);

  // ── TEST 7: Invalid & Expired Tokens ────────────────────────────────────
  console.log('\n7. Testing invalid and expired tokens...');
  
  // 7a. Expired token
  const expiredToken = jwt.sign(
    { sub: 'KKV-ADMIN-000001', email: 'kkvgoldfinance13@gmail.com', role: 'ADMIN' },
    JWT_SECRET,
    { expiresIn: '-10s' }
  );
  const expiredRes = await fetch(`${BASE_URL}/fd/payouts`, {
    headers: { Authorization: `Bearer ${expiredToken}` }
  });
  const expiredJson = await expiredRes.json();
  assert(expiredRes.status === 401, `Expired token receives 401 (received ${expiredRes.status})`);
  assert(expiredJson.error === 'TOKEN_EXPIRED', `Error is TOKEN_EXPIRED (received ${expiredJson.error})`);

  // 7b. Invalid signature token
  const invalidSigToken = jwt.sign(
    { sub: 'KKV-ADMIN-000001', email: 'kkvgoldfinance13@gmail.com', role: 'ADMIN' },
    'wrong_secret_key_123',
    { expiresIn: '1h' }
  );
  const invalidRes = await fetch(`${BASE_URL}/fd/payouts`, {
    headers: { Authorization: `Bearer ${invalidSigToken}` }
  });
  const invalidJson = await invalidRes.json();
  assert(invalidRes.status === 401, `Invalid token receives 401 (received ${invalidRes.status})`);
  assert(invalidJson.error === 'TOKEN_INVALID', `Error is TOKEN_INVALID (received ${invalidJson.error})`);

  // 7c. Missing Authorization Header
  const missingRes = await fetch(`${BASE_URL}/fd/payouts`);
  const missingJson = await missingRes.json();
  assert(missingRes.status === 401, `Missing auth header receives 401 (received ${missingRes.status})`);
  assert(missingJson.error === 'AUTHENTICATION_REQUIRED', 'Error is AUTHENTICATION_REQUIRED');

  // ── TEST 8: Non-Admin Access to Admin-Only Endpoints ────────────────────
  console.log('\n8. Testing RBAC restrictions on admin-only endpoints...');
  await localAuthService.seedDefaultUsers(true);

  const staffToken = jwt.sign(
    {
      sub: 'KKV-STAFF-000099',
      staffId: 'KKV-STAFF-000099',
      email: 'staff@kkvgoldfinance.com',
      role: 'STAFF'
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Staff calling admin-only route: PUT /api/fd/config
  const staffAdminRes = await fetch(`${BASE_URL}/fd/config`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${staffToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ test: true })
  });
  assert(staffAdminRes.status === 403, `Staff access to PUT /api/fd/config receives 403 Forbidden (received ${staffAdminRes.status})`);

  // Admin calling admin-only route: PUT /api/fd/config
  const adminConfigRes = await fetch(`${BASE_URL}/fd/config`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${loginJson.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ minTenureMonths: 6 })
  });
  assert(adminConfigRes.status === 200 || adminConfigRes.status === 400, `Admin access to PUT /api/fd/config is allowed through RBAC (received ${adminConfigRes.status})`);

  // ── TEST SUMMARY ────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`📊 TEST SUITE SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  if (passedTests === totalTests) {
    console.log('🎉 ALL REGRESSION TESTS PASSED CLEANLY WITH ZERO FAILURES!');
  } else {
    console.error(`⚠️ ${totalTests - passedTests} TEST(S) FAILED!`);
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
