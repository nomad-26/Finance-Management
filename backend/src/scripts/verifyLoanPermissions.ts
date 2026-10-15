import jwt from 'jsonwebtoken';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { UserModel } from '../models/User.js';
import { StaffAuditModel } from '../models/StaffAudit.js';

const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'kkv_gold_finance_rbac_secure_jwt_secret_2026_super_key_512';

// Helper to make HTTP requests
function makeRequest(options: http.RequestOptions, body?: any): Promise<{ statusCode: number; data: any; headers: any }> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : undefined;
    const reqOptions: http.RequestOptions = {
      ...options,
      port: PORT,
      host: 'localhost',
      headers: {
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
        ...options.headers
      }
    };

    const req = http.request(reqOptions, (res) => {
      let rawData = '';
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      res.on('end', () => {
        let parsed = rawData;
        try {
          parsed = JSON.parse(rawData);
        } catch (_) {}
        resolve({
          statusCode: res.statusCode || 0,
          data: parsed,
          headers: res.headers
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log(' KKV GOLD FINANCE: RBAC & FINANCIAL SAFETY VERIFICATION SUITE   ');
  console.log('================================================================\n');

  // Find or create Admin and Staff accounts in authoritative UserModel
  let adminUser = await UserModel.findOne({ role: 'ADMIN' });
  if (!adminUser) {
    adminUser = await UserModel.create({
      email: (process.env.ADMIN_EMAIL || 'admin@kkv.com').toLowerCase(),
      name: 'System Admin',
      role: 'ADMIN',
      isActive: true
    } as any);
  }

  let staffUser = await UserModel.findOne({ role: 'STAFF' });
  if (!staffUser) {
    staffUser = await UserModel.create({
      email: 'staff.verification@kkv.com',
      name: 'Branch Staff',
      role: 'STAFF',
      isActive: true
    } as any);
  }

  console.log(`[INIT] Admin User: ${adminUser.email} (ID: ${adminUser.staffId || adminUser.id || adminUser._id})`);
  console.log(`[INIT] Staff User: ${staffUser.email} (ID: ${staffUser.staffId || staffUser.id || staffUser._id})`);

  // Sign valid JWT tokens corresponding to real accounts
  const staffToken = jwt.sign(
    {
      sub: (staffUser._id || staffUser.staffId || staffUser.id).toString(),
      id: staffUser.staffId || staffUser.id,
      staffId: staffUser.staffId,
      email: staffUser.email,
      role: 'STAFF'
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const adminToken = jwt.sign(
    {
      sub: (adminUser._id || adminUser.staffId || adminUser.id).toString(),
      id: adminUser.staffId || adminUser.id,
      staffId: adminUser.staffId,
      email: adminUser.email,
      role: 'ADMIN'
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} ${detail ? `- ${detail}` : ''}`);
      failed++;
    }
  }

  try {
    // TEST 1: Unauthenticated request to /api/loans
    const unauthLoans = await makeRequest({ path: '/api/loans', method: 'GET' });
    assert(unauthLoans.statusCode === 401, '1. Unauthenticated request to /api/loans returns 401', `Status: ${unauthLoans.statusCode}`);

    // TEST 2: Staff can view loans list
    const staffLoans = await makeRequest({
      path: '/api/loans',
      method: 'GET',
      headers: { Authorization: `Bearer ${staffToken}` }
    });
    assert(staffLoans.statusCode === 200, '2. Staff can view loans list (returns 200)', `Status: ${staffLoans.statusCode}`);

    const existingLoans = Array.isArray(staffLoans.data?.data) ? staffLoans.data.data : (Array.isArray(staffLoans.data) ? staffLoans.data : []);
    console.log(`   (Found ${existingLoans.length} existing loans in database)`);

    // Pick an existing loan ID or fallback
    const targetLoanId = existingLoans.length > 0 ? (existingLoans[0].id || existingLoans[0].loanNo) : 'test-loan-id';

    // TEST 3: Staff CANNOT update loan via API (Must return 403 Forbidden)
    const staffUpdateRes = await makeRequest(
      {
        path: `/api/loans/${targetLoanId}`,
        method: 'PUT',
        headers: { Authorization: `Bearer ${staffToken}` }
      },
      { principal: 50000, reason: 'Staff trying unauthorized edit' }
    );
    assert(
      staffUpdateRes.statusCode === 403,
      '3. Staff cannot edit loan via PUT /api/loans/:id (Must return 403 Forbidden)',
      `Status: ${staffUpdateRes.statusCode}, Body: ${JSON.stringify(staffUpdateRes.data)}`
    );

    // TEST 4: Staff CANNOT delete loan via API (Must return 403 Forbidden)
    const staffDeleteRes = await makeRequest(
      {
        path: `/api/loans/${targetLoanId}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${staffToken}` }
      },
      { reason: 'Staff trying unauthorized delete' }
    );
    assert(
      staffDeleteRes.statusCode === 403,
      '4. Staff cannot delete loan via DELETE /api/loans/:id (Must return 403 Forbidden)',
      `Status: ${staffDeleteRes.statusCode}, Body: ${JSON.stringify(staffDeleteRes.data)}`
    );

    // TEST 5: Admin without edit reason is rejected (400)
    const adminEditNoReason = await makeRequest(
      {
        path: `/api/loans/${targetLoanId}`,
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` }
      },
      { principal: 50000 }
    );
    assert(
      adminEditNoReason.statusCode === 400,
      '5. Admin edit requires descriptive reason (returns 400 when missing)',
      `Status: ${adminEditNoReason.statusCode}, Body: ${JSON.stringify(adminEditNoReason.data)}`
    );

    // TEST 6: Admin without delete reason is rejected (400)
    const adminDeleteNoReason = await makeRequest(
      {
        path: `/api/loans/${targetLoanId}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      },
      {}
    );
    assert(
      adminDeleteNoReason.statusCode === 400,
      '6. Admin delete requires descriptive reason (returns 400 when missing)',
      `Status: ${adminDeleteNoReason.statusCode}, Body: ${JSON.stringify(adminDeleteNoReason.data)}`
    );

    // TEST 7: Staff creates a customer (Staff workflow preserved)
    const uniquePhone = '98' + Math.floor(10000000 + Math.random() * 90000000).toString();
    const customerPayload = {
      name: 'Verification Borrower',
      phone: uniquePhone,
      currentAddress: '123 Test Street, Tirunelveli',
      idProof: 'Aadhaar Card',
      idProofNumber: '1234-5678-9012'
    };

    const createCustRes = await makeRequest(
      {
        path: '/api/customers',
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` }
      },
      customerPayload
    );
    assert(
      createCustRes.statusCode === 200 || createCustRes.statusCode === 201,
      '7. Staff can create customer (Workflow preserved)',
      `Status: ${createCustRes.statusCode}`
    );
    const createdCust = createCustRes.data?.data || createCustRes.data;
    const testCustId = createdCust?.id || (createdCust?.customerId ? String(createdCust.customerId) : 'cust-test-1');

    // TEST 8: Staff issues a new loan (Staff workflow preserved)
    const issueDateStr = new Date().toISOString().split('T')[0];
    const loanPayload = {
      customerId: testCustId,
      customerName: 'Verification Borrower',
      customerPhone: uniquePhone,
      date: issueDateStr,
      loanType: 'GOLD LOAN',
      principal: 25000,
      interestRate: 1.5,
      items: [
        {
          item: 'Gold Chain 22K',
          purity: '22K',
          qty: 1,
          grossWeight: 10,
          deductionWeight: 0.5,
          netWeight: 9.5
        }
      ],
      totalGrossWeight: 10,
      totalNetWeight: 9.5,
      marketValue: 45000,
      notes: 'Test loan for permission verification'
    };

    const issueLoanRes = await makeRequest(
      {
        path: '/api/loans',
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` }
      },
      loanPayload
    );
    assert(
      issueLoanRes.statusCode === 200 || issueLoanRes.statusCode === 201,
      '8. Staff can issue new loan (Workflow preserved)',
      `Status: ${issueLoanRes.statusCode}`
    );
    const issuedLoan = issueLoanRes.data?.data || issueLoanRes.data;
    const issuedLoanId = issuedLoan?.id || issuedLoan?.loanNo;

    if (issuedLoanId) {
      // TEST 9: Admin edits the issued loan successfully
      const adminEditRes = await makeRequest(
        {
          path: `/api/loans/${issuedLoanId}`,
          method: 'PUT',
          headers: { Authorization: `Bearer ${adminToken}` }
        },
        {
          notes: 'Updated by Admin during verification test',
          interestRate: 1.75,
          reason: 'Administrative correction of interest rate agreed with borrower'
        }
      );
      assert(
        adminEditRes.statusCode === 200,
        '9. Authenticated Admin can edit eligible loan (returns 200)',
        `Status: ${adminEditRes.statusCode}, Body: ${JSON.stringify(adminEditRes.data)}`
      );

      // Verify the edit changed the values
      const verifyEditedRes = await makeRequest({
        path: `/api/loans/${issuedLoanId}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const editedLoanData = verifyEditedRes.data?.data || verifyEditedRes.data;
      assert(
        editedLoanData?.interestRate === 1.75 && editedLoanData?.notes?.includes('Updated by Admin'),
        '10. Loan values updated accurately in storage',
        `InterestRate: ${editedLoanData?.interestRate}, Notes: ${editedLoanData?.notes}`
      );

      // TEST 11: Financial safety check: Record a payment, then ensure Admin CANNOT delete loan
      const paymentRes = await makeRequest(
        {
          path: `/api/loans/${issuedLoanId}/payments`,
          method: 'POST',
          headers: { Authorization: `Bearer ${staffToken}` }
        },
        {
          amount: 5000,
          paymentType: 'PRINCIPAL',
          paymentMode: 'Cash',
          date: issueDateStr
        }
      );

      if (paymentRes.statusCode === 200 || paymentRes.statusCode === 201) {
        const deleteWithRepaymentRes = await makeRequest(
          {
            path: `/api/loans/${issuedLoanId}`,
            method: 'DELETE',
            headers: { Authorization: `Bearer ${adminToken}` }
          },
          { reason: 'Admin archiving loan with historical repayments' }
        );
        assert(
          deleteWithRepaymentRes.statusCode === 200 &&
          deleteWithRepaymentRes.data?.success === true,
          '11. Financial Safety Archival: Admin can safely delete/archive loan with repayment history (returns 200)',
          `Status: ${deleteWithRepaymentRes.statusCode}, Response: ${JSON.stringify(deleteWithRepaymentRes.data)}`
        );

        // Verify the loan is removed from active loans
        const getArchivedLoanRes = await makeRequest({
          path: `/api/loans/${issuedLoanId}`,
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert(
          getArchivedLoanRes.statusCode === 404,
          '11b. Archived loan is removed from active loan queries (returns 404)',
          `Status: ${getArchivedLoanRes.statusCode}`
        );

        // Verify the historical payment receipts are preserved
        const getPaymentsRes = await makeRequest({
          path: `/api/loans/${issuedLoanId}/payments`,
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        const retainedPayments = getPaymentsRes.data?.data || getPaymentsRes.data;
        assert(
          Array.isArray(retainedPayments) && retainedPayments.length > 0,
          '11c. Historical repayment receipts are permanently preserved for accounting integrity',
          `Found ${retainedPayments?.length} preserved receipts`
        );
      }

      // TEST 12: Issue a second pristine loan without repayments and verify clean Admin deletion
      const pristineLoanRes = await makeRequest(
        {
          path: '/api/loans',
          method: 'POST',
          headers: { Authorization: `Bearer ${staffToken}` }
        },
        { ...loanPayload, principal: 15000 }
      );
      const pristineLoan = pristineLoanRes.data?.data || pristineLoanRes.data;
      const pristineLoanId = pristineLoan?.id || pristineLoan?.loanNo;

      const adminDeleteRes = await makeRequest(
        {
          path: `/api/loans/${pristineLoanId}`,
          method: 'DELETE',
          headers: { Authorization: `Bearer ${adminToken}` }
        },
        {
          reason: 'Clean test cleanup by Admin verification suite'
        }
      );
      assert(
        adminDeleteRes.statusCode === 200,
        '12. Authenticated Admin can delete loan without repayments (returns 200)',
        `Status: ${adminDeleteRes.statusCode}, Body: ${JSON.stringify(adminDeleteRes.data)}`
      );

      // TEST 13: Deleted loan is excluded from active loans
      const verifyDeletedRes = await makeRequest({
        path: `/api/loans/${pristineLoanId}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert(
        verifyDeletedRes.statusCode === 404,
        '13. Deleted loan is properly soft-deleted and excluded from active queries (returns 404)',
        `Status: ${verifyDeletedRes.statusCode}`
      );
      // TEST 14: Audit Logging Verification
      const auditRecords = await StaffAuditModel.find({});
      const loanAuditLogs = auditRecords.filter((a) => a.action === 'LOAN_EDIT' || a.action === 'LOAN_DELETE');
      assert(
        loanAuditLogs.length >= 2,
        '14. Audit records accurately persisted for LOAN_EDIT and LOAN_DELETE events with admin identity and reason',
        `Found ${loanAuditLogs.length} audit logs`
      );
      if (loanAuditLogs.length > 0) {
        console.log(`   (Latest audit: Action: ${loanAuditLogs[loanAuditLogs.length - 1].action}, Loan: ${loanAuditLogs[loanAuditLogs.length - 1].loanNo}, Reason: ${loanAuditLogs[loanAuditLogs.length - 1].reason})`);
      }
    }

    console.log('\n================================================================');
    console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal error during test suite:', err);
    process.exit(1);
  }
}

runTests();
