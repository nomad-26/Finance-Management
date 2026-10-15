/**
 * KKV Gold Finance - Concurrency, Counter Sequence & Error Classification Tests
 * Tests:
 * 1. Safe Startup Diagnostics & Monitoring Endpoints (No secret leakage)
 * 2. Fine-grained Firestore Error Categorization (IAM, Missing Config, Parse Errors, Contention)
 * 3. Atomic Customer ID Generation with Zero Duplicates under Concurrency
 * 4. Concurrent Customer API Creation & Validation Rules
 */
import { firestoreRepository, categorizeFirestoreError } from '../src/repositories/firestore.repository.js';
import { counterService } from '../src/services/counter.service.js';
import { generateCustomerId } from '../src/utils/customerIdGenerator.js';

const BASE_URL = process.env.TEST_API_URL || 'http://127.0.0.1:8080/api';

console.log('═══════════════════════════════════════════════════════════════');
console.log('🧪 RUNNING FIRESTORE CONCURRENCY & ERROR CATEGORIZATION TESTS');
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
  // ── TEST 1: Diagnostic Endpoints & Secret Redaction ────────────────────────
  console.log('1. Testing Safe Diagnostics & Health Endpoints...');
  try {
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthJson = await healthRes.json();
    assert(healthRes.status === 200, `GET /api/health returned 200 (received ${healthRes.status})`);
    assert(healthJson.projectId === 'kkv-finance-4b3bf', 'Health endpoint reports correct projectId (kkv-finance-4b3bf)');
    assert(Boolean(healthJson.firebase), 'Health endpoint embeds safe Firebase summary');
    assert(typeof healthJson.firebase.credentialConfigured === 'boolean', 'Firebase summary contains credentialConfigured flag');
    assert(healthJson.firebase.private_key === undefined && healthJson.firebase.privateKey === undefined, 'Health endpoint DOES NOT leak private keys');

    const diagRes = await fetch(`${BASE_URL}/diagnostics/firebase`);
    const diagJson = await diagRes.json();
    assert(diagRes.status === 200, `GET /api/diagnostics/firebase returned 200 (received ${diagRes.status})`);
    assert(diagJson.success === true && Boolean(diagJson.diagnostics), 'Diagnostics endpoint returns diagnostic details');
    assert(diagJson.diagnostics.expectedProjectId === 'kkv-finance-4b3bf', 'Diagnostics endpoint reports expected projectId');
    assert(diagJson.diagnostics.private_key === undefined, 'Diagnostics endpoint DOES NOT leak private_key');
  } catch (err) {
    assert(false, `Diagnostics endpoint error: ${err.message}`);
  }

  // ── TEST 2: Error Categorization Logic ────────────────────────────────────
  console.log('\n2. Testing Fine-grained Firestore Error Categorization...');
  try {
    // 2a. Transaction aborted / contention
    const abortErr = new Error('10 ABORTED: Too much contention on these documents.');
    (abortErr).code = 'aborted';
    const catAbort = categorizeFirestoreError(abortErr, 'counters', 'APP_COUNTERS');
    assert(catAbort.category === 'TRANSACTION_ABORTED', `Contention correctly categorized as TRANSACTION_ABORTED (got ${catAbort.category})`);
    assert(catAbort.statusCode === 409, `Transaction abort maps to HTTP 409 (got ${catAbort.statusCode})`);
    assert(catAbort.code === 'FIRESTORE_TRANSACTION_ABORTED', `Error code is FIRESTORE_TRANSACTION_ABORTED`);

    // 2b. Deadline exceeded / timeout
    const timeoutErr = new Error('4 DEADLINE_EXCEEDED: Deadline exceeded');
    (timeoutErr).code = 'deadline-exceeded';
    const catTimeout = categorizeFirestoreError(timeoutErr, 'customers', 'KKV-001');
    assert(catTimeout.category === 'UNAVAILABLE', `Deadline exceeded correctly categorized as UNAVAILABLE`);
    assert(catTimeout.statusCode === 504, `Timeout maps to HTTP 504 (got ${catTimeout.statusCode})`);

    // 2c. Service unavailable
    const unavailErr = new Error('14 UNAVAILABLE: Service unavailable');
    (unavailErr).code = 'unavailable';
    const catUnavail = categorizeFirestoreError(unavailErr, 'loans', 'GL-1');
    assert(catUnavail.category === 'UNAVAILABLE' && catUnavail.statusCode === 503, 'Unavailable maps to HTTP 503');

    // 2d. Not found
    const notFoundErr = new Error('5 NOT_FOUND: Document not found');
    (notFoundErr).code = 'not-found';
    const catNotFound = categorizeFirestoreError(notFoundErr, 'settings', 'GLOBAL');
    assert(catNotFound.category === 'NOT_FOUND' && catNotFound.statusCode === 404, 'Not found maps to HTTP 404');

    // 2e. Permission denied when credentials missing
    const permErr = new Error('7 PERMISSION_DENIED: Missing or insufficient permissions.');
    (permErr).code = 'permission-denied';
    const catPerm = categorizeFirestoreError(permErr, 'counters', 'APP_COUNTERS');
    assert(catPerm.statusCode === 403, `Permission denied maps to HTTP 403`);
    assert(Boolean(catPerm.category), `Permission denied assigned specific category: ${catPerm.category}`);
  } catch (err) {
    assert(false, `Error categorization failed: ${err.message}`);
  }

  // ── TEST 3: Customer ID Generation Format ─────────────────────────────────
  console.log('\n3. Testing Atomic Customer ID Format...');
  try {
    const { customerId, sequenceNumber } = await generateCustomerId('KKV-2026');
    assert(typeof sequenceNumber === 'number' && sequenceNumber > 0, `Sequence number is positive integer (${sequenceNumber})`);
    assert(/^KKV-2026-\d{6}$/.test(customerId), `Customer ID matches format KKV-2026-XXXXXX (generated: ${customerId})`);
  } catch (err) {
    assert(false, `Customer ID generation error: ${err.message}`);
  }

  // ── TEST 4: Concurrency Safety (Zero Duplicate IDs) ───────────────────────
  console.log('\n4. Testing Concurrent Sequence Generation (Asserting 0 Duplicates)...');
  try {
    const CONCURRENCY_COUNT = 25;
    const promises = [];
    for (let i = 0; i < CONCURRENCY_COUNT; i++) {
      promises.push(generateCustomerId('KKV-2026'));
    }

    const results = await Promise.all(promises);
    assert(results.length === CONCURRENCY_COUNT, `All ${CONCURRENCY_COUNT} concurrent requests resolved`);

    const idSet = new Set();
    const seqSet = new Set();
    let hasDuplicate = false;

    for (const item of results) {
      if (idSet.has(item.customerId) || seqSet.has(item.sequenceNumber)) {
        hasDuplicate = true;
        console.error(`  ❌ Duplicate detected: ID=${item.customerId}, Seq=${item.sequenceNumber}`);
      }
      idSet.add(item.customerId);
      seqSet.add(item.sequenceNumber);
    }

    assert(!hasDuplicate, `Zero duplicates among ${CONCURRENCY_COUNT} concurrent sequence increments`);
    assert(idSet.size === CONCURRENCY_COUNT, `Set size matches request count (${idSet.size} === ${CONCURRENCY_COUNT})`);
  } catch (err) {
    assert(false, `Concurrency test error: ${err.message}`);
  }

  // ── TEST 5: Concurrent Customer Creation via HTTP API ─────────────────────
  console.log('\n5. Testing Customer Persistence & Concurrency via API...');
  try {
    // 5a. Login as Admin
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'kkvgoldfinance13@gmail.com',
        password: 'Admin@123456'
      })
    });
    const loginJson = await loginRes.json();
    assert(loginRes.status === 200, 'Admin login succeeded');
    const adminToken = loginJson.token;

    // 5b. Create Customer
    const testPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const custPayload = {
      fullName: 'Concurrency Test User 1',
      phoneNumber: testPhone,
      gender: 'Male',
      address: '123 Test Street, Coimbatore',
      idProofType: 'Aadhaar',
      idProofNumber: '9999 8888 7777'
    };

    const createRes = await fetch(`${BASE_URL}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(custPayload)
    });
    const createJson = await createRes.json();

    assert(createRes.status === 201, `Customer created with HTTP 201 (received ${createRes.status})`);
    assert(createJson.success === true, 'Customer creation reports success: true');
    const createdCustId = createJson.data?.customerId || createJson.data?.id || createJson.data?.data?.customerId;
    assert(Boolean(createdCustId), `Customer received canonical customerId: ${createdCustId}`);

    // 5c. Duplicate Mobile Number Prevention
    const dupRes = await fetch(`${BASE_URL}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(custPayload)
    });
    const dupJson = await dupRes.json();
    assert(dupRes.status === 409, `Duplicate phone returns HTTP 409 (received ${dupRes.status})`);
    assert(dupJson.error === 'DUPLICATE_PHONE_NUMBER', 'Error code is DUPLICATE_PHONE_NUMBER');

    // 5d. Concurrent customer creation with distinct phone numbers
    const concurrentCustPromises = [];
    const createdIds = new Set();
    const NUM_CUSTOMERS = 5;

    for (let i = 0; i < NUM_CUSTOMERS; i++) {
      const uniquePhone = `97${Math.floor(10000000 + Math.random() * 90000000)}`;
      concurrentCustPromises.push(
        fetch(`${BASE_URL}/customers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({
            fullName: `Concurrent Customer ${i + 1}`,
            phoneNumber: uniquePhone,
            gender: 'Female',
            address: '456 Parallel Rd',
            idProofType: 'Aadhaar'
          })
        }).then(r => r.json())
      );
    }

    const concurrentResults = await Promise.all(concurrentCustPromises);
    let allSucceeded = true;
    for (const res of concurrentResults) {
      const custId = res.data?.customerId || res.data?.id || res.data?.data?.customerId;
      if (!res.success || !custId) {
        allSucceeded = false;
        console.error('  ❌ Failed response in concurrent customer creation:', res);
      } else {
        createdIds.add(custId);
      }
    }

    assert(allSucceeded, `All ${NUM_CUSTOMERS} parallel customer creations returned success`);
    assert(createdIds.size === NUM_CUSTOMERS, `All ${NUM_CUSTOMERS} created customers have unique IDs (zero collision)`);
  } catch (err) {
    assert(false, `Customer API concurrency test error: ${err.message}`);
  }

  // ── Final Test Summary ─────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`📊 TEST RESULTS: ${passedTests}/${totalTests} Passed (${totalTests - passedTests} Failed)`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
