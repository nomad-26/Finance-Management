import jwt from 'jsonwebtoken';

const BASE_URL = process.env.TEST_API_URL || 'http://127.0.0.1:8080/api';
const JWT_SECRET = process.env.JWT_SECRET || 'kkv_gold_finance_rbac_secure_jwt_secret_2026_super_key_512';

console.log('═══════════════════════════════════════════════════════════════');
console.log('🧪 KKV GOLD FINANCE LOAN PERSISTENCE & CUSTOMER VALIDATION TEST');
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
  // ── 0. Authenticate & Obtain Admin Token ──────────────────────────────────
  console.log('0. Authenticating as Master Admin (KKV-ADMIN-000001)...');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'kkvgoldfinance13@gmail.com',
      password: 'Admin@123456'
    })
  });
  const loginJson = await loginRes.json();
  assert(loginRes.status === 200, `Admin login HTTP status is 200 (received ${loginRes.status})`);
  assert(loginJson.success === true && Boolean(loginJson.token), 'Admin login returned valid token');

  const adminToken = loginJson.token;
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
  };

  // ── 1. Customer Search & Canonical Resolution ────────────────────────────
  console.log('\n1. Testing Customer Search & Resolution (GET /api/customers/search)...');
  
  // 1a. Search by canonical customer ID
  const searchIdRes = await fetch(`${BASE_URL}/customers/search?query=KKV-2026-000001`, {
    headers: authHeaders
  });
  const searchIdJson = await searchIdRes.json();
  assert(searchIdRes.status === 200, `Search by canonical ID status is 200 (received ${searchIdRes.status})`);
  assert(searchIdJson.success === true, 'Search response indicates success');
  
  const searchResults = Array.isArray(searchIdJson.data) ? searchIdJson.data : (searchIdJson.data?.data || []);
  const targetCustomer = searchResults.find(c => c.id === 'KKV-2026-000001' || c.customerId === 'KKV-2026-000001');
  assert(Boolean(targetCustomer), 'Canonical customer KKV-2026-000001 found in search results');

  // 1b. Search by name/substring
  const searchNameRes = await fetch(`${BASE_URL}/customers/search?query=Suresh`, {
    headers: authHeaders
  });
  const searchNameJson = await searchNameRes.json();
  assert(searchNameRes.status === 200, `Search by name substring status is 200 (received ${searchNameRes.status})`);

  // ── 2. Strict Customer Validation on Loan Creation ──────────────────────
  console.log('\n2. Testing Strict Customer Validation on Loan Creation (POST /api/loans)...');

  // 2a. Reject empty customer ID
  const emptyCustRes = await fetch(`${BASE_URL}/loans`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      customerId: '',
      principal: 25000,
      items: [{ item: 'Gold Ring', qty: 1, purity: '22ct', grossWeight: 5.5, netWeight: 5.5 }]
    })
  });
  const emptyCustJson = await emptyCustRes.json();
  assert(emptyCustRes.status === 400, `Empty customerId rejected with 400 (received ${emptyCustRes.status})`);
  assert(emptyCustJson.error === 'CUSTOMER_REQUIRED', `Rejection code is CUSTOMER_REQUIRED (received ${emptyCustJson.error})`);

  // 2b. Reject non-existent customer ID (Never bypass validation or invent fake IDs)
  const fakeCustRes = await fetch(`${BASE_URL}/loans`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      customerId: 'CUST-NON-EXISTENT-999999',
      principal: 25000,
      items: [{ item: 'Gold Chain', qty: 1, purity: '22ct', grossWeight: 12.0, netWeight: 12.0 }]
    })
  });
  const fakeCustJson = await fakeCustRes.json();
  assert(fakeCustRes.status === 404, `Non-existent customerId rejected with 404 (received ${fakeCustRes.status})`);
  assert(fakeCustJson.error === 'CUSTOMER_NOT_FOUND', `Rejection code is CUSTOMER_NOT_FOUND (received ${fakeCustJson.error})`);

  // ── 3. Financial & Collateral Validation ─────────────────────────────────
  console.log('\n3. Testing Financial & Collateral Validation (POST /api/loans)...');

  // 3a. Reject zero or negative principal
  const zeroPrincipalRes = await fetch(`${BASE_URL}/loans`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      customerId: 'KKV-2026-000001',
      principal: 0,
      items: [{ item: 'Gold Coin', qty: 1, purity: '24ct', grossWeight: 8.0, netWeight: 8.0 }]
    })
  });
  const zeroPrincipalJson = await zeroPrincipalRes.json();
  assert(zeroPrincipalRes.status === 400, `Zero principal rejected with 400 (received ${zeroPrincipalRes.status})`);
  assert(zeroPrincipalJson.error === 'INVALID_PRINCIPAL', `Error code is INVALID_PRINCIPAL (received ${zeroPrincipalJson.error})`);

  // 3b. Reject missing collateral items
  const noItemsRes = await fetch(`${BASE_URL}/loans`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      customerId: 'KKV-2026-000001',
      principal: 30000,
      items: []
    })
  });
  const noItemsJson = await noItemsRes.json();
  assert(noItemsRes.status === 400, `Missing items rejected with 400 (received ${noItemsRes.status})`);
  assert(noItemsJson.error === 'COLLATERAL_REQUIRED', `Error code is COLLATERAL_REQUIRED (received ${noItemsJson.error})`);

  // 3c. Reject invalid weight (deduction > gross)
  const invalidWeightRes = await fetch(`${BASE_URL}/loans`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      customerId: 'KKV-2026-000001',
      principal: 30000,
      items: [{ item: 'Gold Bangle', qty: 1, purity: '22ct', grossWeight: 5.0, deductionWeight: 8.0, netWeight: 0 }]
    })
  });
  assert(invalidWeightRes.status === 400, `Deduction > gross weight rejected with 400 (received ${invalidWeightRes.status})`);

  // ── 4. Successful Authoritative Loan Creation & Persistence ───────────────
  console.log('\n4. Testing Successful Loan Creation & Cloud Persistence (POST /api/loans)...');

  const validLoanPayload = {
    customerId: 'KKV-2026-000001',
    customerName: targetCustomer?.name || 'Suresh Kumar',
    customerPhone: targetCustomer?.phone || '9876543210',
    date: new Date().toLocaleDateString('en-GB').replace(/\//g, '-'),
    loanType: 'Gold Loan Regular',
    repaymentSystem: 'Monthly Interest',
    principal: 45000,
    interestRate: 1.5,
    bankMode: 'Cash',
    cashAmount: 45000,
    bankAmount: 0,
    deductAdvanceInterest: false,
    advanceDays: 0,
    advanceInterestAmount: 0,
    cardFee: 25,
    cardFeeEnabled: true,
    cardFeePaymentMode: 'Cash',
    items: [
      {
        id: `item-${Date.now()}-1`,
        item: 'Gold Chain with Pendant',
        qty: 1,
        purity: '22ct',
        grossWeight: 14.500,
        deductionWeight: 0.500,
        netWeight: 14.000
      }
    ],
    marketValue: 70000,
    ltv: 64.28,
    notes: 'Regression test loan creation'
  };

  const createLoanRes = await fetch(`${BASE_URL}/loans`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(validLoanPayload)
  });

  const createLoanJson = await createLoanRes.json();
  assert(createLoanRes.status === 201 || createLoanRes.status === 200, `Loan created successfully with status ${createLoanRes.status}`);
  assert(createLoanJson.success === true, 'Loan creation response success is true');

  const createdLoan = createLoanJson.data;
  assert(Boolean(createdLoan?.id), `Created loan has canonical id: ${createdLoan?.id}`);
  assert(Boolean(createdLoan?.loanNo), `Created loan has loanNo: ${createdLoan?.loanNo}`);
  assert(createdLoan?.customerId === 'KKV-2026-000001', `Created loan customerId matches KKV-2026-000001`);
  assert(Number(createdLoan?.principal) === 45000, `Created loan principal is 45000`);
  assert(Number(createdLoan?.outstandingPrincipal) === 45000, `Created loan outstandingPrincipal is 45000`);
  assert(createdLoan?.status === 'ACTIVE', `Created loan status is ACTIVE`);

  // ── 5. Read-After-Write Verification ─────────────────────────────────────
  console.log('\n5. Testing Read-After-Write Verification (GET /api/loans/:loanNo)...');

  const fetchLoanRes = await fetch(`${BASE_URL}/loans/${encodeURIComponent(createdLoan.loanNo)}`, {
    headers: authHeaders
  });
  const fetchLoanJson = await fetchLoanRes.json();
  assert(fetchLoanRes.status === 200, `Read-after-write GET status is 200 (received ${fetchLoanRes.status})`);
  assert(fetchLoanJson.success === true, 'Read-after-write GET success is true');
  assert(fetchLoanJson.data?.loanNo === createdLoan.loanNo, 'Read-after-write loanNo matches');
  assert(Number(fetchLoanJson.data?.principal) === 45000, 'Read-after-write principal matches 45000');
  assert(fetchLoanJson.data?.items?.length === 1, 'Read-after-write items preserved');

  // ── 6. Customer Active Loan Count Update ─────────────────────────────────
  console.log('\n6. Testing Customer Active Loan Count Update (GET /api/customers/:id)...');

  const custRes = await fetch(`${BASE_URL}/customers/${encodeURIComponent('KKV-2026-000001')}`, {
    headers: authHeaders
  });
  const custJson = await custRes.json();
  assert(custRes.status === 200, `Customer fetch status is 200 (received ${custRes.status})`);
  const updatedCust = custJson.data || custJson.customer || custJson;
  assert(Number(updatedCust.activeLoansCount) > 0, `Customer activeLoansCount incremented (currently ${updatedCust.activeLoansCount})`);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} assertions passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (passedTests === totalTests) {
    console.log('🎉 ALL LOAN PERSISTENCE & CUSTOMER VALIDATION TESTS PASSED!');
    process.exit(0);
  } else {
    console.error('💥 SOME ASSERTIONS FAILED');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled test error:', err);
  process.exit(1);
});
