import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Bell, Plus, Menu, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { NavPage } from '../../types';
import { KKVLogo } from '../common/KKVLogo';
import { GlobalSearch } from '../common/GlobalSearch';

interface PageMetadata {
  title: string;
  subtitle: string;
}

const pageTitles: Record<NavPage, PageMetadata> = {
  dashboard: {
    title: 'Dashboard Overview',
    subtitle: 'Real-time vault gold weight, active pledges, and monthly interest accrual'
  },
  customers: {
    title: 'Customer Management',
    subtitle: 'Manage borrowers and KYC details.'
  },
  'customers-add': {
    title: 'Add Customer',
    subtitle: 'Manage borrowers and KYC details.'
  },
  'add-customer-form': {
    title: 'Add Borrower KYC',
    subtitle: 'Complete borrower KYC onboarding and identity verification'
  },
  'edit-customer': {
    title: 'Edit Borrower KYC',
    subtitle: 'Update borrower KYC details and identity verification'
  },
  'search-customer': {
    title: 'Search Customers',
    subtitle: 'Find and manage registered borrower records.'
  },
  'customer-profile': {
    title: 'Customer Profile',
    subtitle: 'Borrower KYC details, active pledges, and complete loan history'
  },
  'loan-issue': {
    title: 'Issue New Loan',
    subtitle: 'Issue new loans and review recent loan list.'
  },
  'loan-display': {
    title: 'Loan Display',
    subtitle: 'Active gold loan book, customer pledges, interest rates, and loan statuses'
  },
  'loan-receipts': {
    title: 'Loan Receipts',
    subtitle: 'Record borrower repayments, interest credits, and closure receipts'
  },
  'receipt-display': {
    title: 'Receipt Display',
    subtitle: 'Official printable payment voucher and customer acknowledgment'
  },
  'all-receipts': {
    title: 'All Receipts',
    subtitle: 'Loan disbursements and payment receipts only.'
  },
  'pending-loans': {
    title: 'Pending Loans',
    subtitle: 'Approval queue for high-value pledges, document verifications & renewals'
  },
  'total-loans': {
    title: 'Total Loans',
    subtitle: 'Comprehensive ledger of historical and active gold loan portfolio'
  },
  'rc-renewal-reminders': {
    title: 'RC & Renewal Reminders',
    subtitle: 'Pledge maturity notices, annual renewals, and collection alerts'
  },
  'bill-balance': {
    title: 'Bill Balance',
    subtitle: 'Borrower statement of account, principal dues, paid ledger, and net balances'
  },
  'fd-customers': {
    title: 'Fixed Deposit Management',
    subtitle: 'Manage term deposits linked to master customer records.'
  },
  'new-deposit': {
    title: 'Issue New Fixed Deposit',
    subtitle: 'Issue term deposit linked to master customer ID with monthly yield payout.'
  },
  'deposit-display': {
    title: 'Deposit Display',
    subtitle: 'Active fixed deposit contracts and monthly yield commitments'
  },
  'deposit-interest': {
    title: 'Deposit Interest',
    subtitle: 'Calculate and disburse guaranteed monthly deposit dividend payouts'
  },
  'interest-display': {
    title: 'Interest Display',
    subtitle: 'Itemized historical interest payouts ledger for depositors'
  },
  'interest-pending': {
    title: 'Interest Pending',
    subtitle: 'Upcoming monthly interest dividend obligations schedule'
  },
  'deposit-withdrawal': {
    title: 'Deposit Withdrawal',
    subtitle: 'Matured fixed deposit settlement and capital payout'
  },
  'withdrawal-display': {
    title: 'Withdrawal Display',
    subtitle: 'Historical record of withdrawn and matured fixed deposits'
  },
  'fd-customers-deposits': {
    title: 'FD Customers & Deposits',
    subtitle: 'Unified directory of deposit holders and active deposit portfolios'
  },
  'fd-receipt': {
    title: 'Fixed Deposit Receipt',
    subtitle: 'Official printable term deposit receipt and certificate'
  },
  'fd-receipt-display': {
    title: 'Fixed Deposit Receipt Display',
    subtitle: 'Official printable term deposit receipt and certificate'
  },
  'day-book': {
    title: 'Day Book',
    subtitle: 'Daily cash and bank transactions chronologically summarized'
  },
  'trial-balance': {
    title: 'Trial Balance',
    subtitle: 'Double-entry trial balance ledger verifying branch accounts'
  },
  'profit-loss': {
    title: 'Profit & Loss',
    subtitle: 'Interest spread, processing fee revenue, and operational expenses'
  },
  'balance-sheet': {
    title: 'Balance Sheet',
    subtitle: 'Position of assets (gold pledges, vault cash) and liabilities'
  },
  accounts: {
    title: 'Day Book & Accounts',
    subtitle: 'Financial statements, general ledger, and cash positions'
  },
  'daily-reminders': {
    title: 'Daily Reminders',
    subtitle: 'Customer collection calls, interest follow-ups, and operational tasks'
  },
  'admin-panel': {
    title: 'Admin Panel',
    subtitle: 'Authorized administrative controls, role permissions, and audit logs'
  },
  settings: {
    title: 'Settings',
    subtitle: 'Branch profile, printer setup, and staff access configuration'
  },
  rental: {
    title: 'Rental Management',
    subtitle: 'Commercial complexes, shop units, tenants, monthly rent collections, and expenses'
  },
  'rental-dashboard': {
    title: 'Rental Dashboard',
    subtitle: 'Commercial complexes, shop units, tenants, monthly rent collections, and expenses'
  },
  'rental-complexes': {
    title: 'Complex Management',
    subtitle: 'Manage commercial complexes, locations, active properties, and total shops'
  },
  'rental-complex-detail': {
    title: 'Complex Details',
    subtitle: 'Shop units performance, expected rents, collections, pending dues, and advances'
  },
  'rental-shops': {
    title: 'Shops & Tenants',
    subtitle: 'Commercial shop directory, tenant contact information, monthly rents, and status'
  },
  'rental-shop-detail': {
    title: 'Shop Details & History',
    subtitle: 'Tenant details, itemized rent payment ledger, and shop expense history'
  },
  'rental-payments': {
    title: 'Rent Payments',
    subtitle: 'Record rent collections, partial payments, advance adjustments, Cash and GPay split'
  },
  'rental-daybook': {
    title: 'Rental Day Book',
    subtitle: 'Authoritative commercial rental ledger of collections, expenses, cash/online splits, and running balances'
  },
  'rental-expenses': {
    title: 'Rental Expenses',
    subtitle: 'Property maintenance, utilities, repairs, cleaning, security, and complex expenses'
  },
  'rental-reports': {
    title: 'Rental Reports',
    subtitle: 'Monthly rent statements, expense ledgers, Cash vs GPay collections, and property performance'
  },
  'rental-pending-rent': {
    title: 'Pending Rent',
    subtitle: 'Track due and overdue rent across complexes and shops.'
  },
  notifications: {
    title: 'Notification Center',
    subtitle: 'Real-time due events, interest schedules, renewals, and collections'
  }
};

interface TopbarProps {
  showNewLoan?: boolean;
}

export const Topbar: React.FC<TopbarProps> = ({ showNewLoan }) => {
  const {
    currentPage,
    setCurrentPage,
    unreadNotificationCount,
    toggleNotificationOpen,
    toggleSidebar,
    isSidebarCollapsed,
    currentUser,
    userRole,
    hideDashboardValues,
    setHideDashboardValues,
    triggerDashboardRefresh
  } = useApp();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const isDashboard = currentPage === 'dashboard';

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const userGreetingName =
    currentUser?.displayName?.trim() ||
    currentUser?.fullName?.trim() ||
    (currentUser as any)?.username?.trim() ||
    currentUser?.staffId?.trim() ||
    currentUser?.uid?.trim() ||
    currentUser?.id?.trim() ||
    (currentUser?.email ? currentUser.email.split('@')[0] : '') ||
    (userRole === 'ADMIN' ? 'Administrator' : 'Staff');

  const meta = pageTitles[currentPage] || {
    title: 'KKV Gold Finance',
    subtitle: 'Branch Management System'
  };

  const headerTitle = isDashboard ? `${getGreeting()}, ${userGreetingName}` : meta.title;
  const headerSubtitle = isDashboard ? null : meta.subtitle;

  const isRentalModule = typeof currentPage === 'string' && (currentPage.startsWith('rental') || currentPage === 'rental');
  const shouldShowNewLoan = showNewLoan !== undefined ? showNewLoan : !isRentalModule;

  const handleRefreshClick = () => {
    setIsRefreshing(true);
    triggerDashboardRefresh();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 800);
  };

  return (
    <header className="topbar">
      {/* Left: Sidebar Toggle + Official Logo + Dynamic Page Title (Greeting on Dashboard) */}
      <div className="topbar-left">
        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={toggleSidebar}
          title={isSidebarCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
          aria-label={isSidebarCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
          aria-expanded={!isSidebarCollapsed}
        >
          <Menu size={20} />
        </button>
        <div className="topbar-brand-title">
          <KKVLogo size={32} />
          <div className="topbar-title-block">
            <h1 className="page-header-title">{headerTitle}</h1>
            {headerSubtitle && <p className="page-header-subtitle">{headerSubtitle}</p>}
          </div>
        </div>
      </div>

      {/* Right: Search, Dashboard Actions (Hide Amounts, Refresh), Notification Icon, + New Loan Button */}
      <div className="topbar-right">
        {/* Global Search Bar */}
        <GlobalSearch />

        {/* Dashboard Specific Action Toolbar Buttons */}
        {isDashboard && (
          <div className="topbar-dashboard-actions">
            <button
              type="button"
              className="btn btn-secondary topbar-dashboard-action-btn"
              onClick={() => setHideDashboardValues((prev) => !prev)}
              title={hideDashboardValues ? 'Show Amounts' : 'Hide Amounts'}
              aria-label={hideDashboardValues ? 'Show Financial Amounts' : 'Hide Financial Amounts'}
            >
              {hideDashboardValues ? <Eye size={14} /> : <EyeOff size={14} />}
              <span className="btn-label-desktop">{hideDashboardValues ? 'Show Amounts' : 'Hide Amounts'}</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary topbar-dashboard-action-btn"
              onClick={handleRefreshClick}
              title="Refresh Dashboard data"
              aria-label="Refresh Dashboard Data"
              disabled={isRefreshing}
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              <span className="btn-label-desktop">{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
            </button>
          </div>
        )}

        {/* Notification Icon */}
        <button
          className="topbar-action-btn"
          title={`Notifications (${unreadNotificationCount} unread)`}
          onClick={toggleNotificationOpen}
          style={{ position: 'relative' }}
        >
          <Bell size={17} />
          {unreadNotificationCount > 0 ? (
            <span className="notification-badge">
              {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
            </span>
          ) : (
            <span className="notification-dot" style={{ opacity: 0.4 }}></span>
          )}
        </button>

        {/* + New Loan Button (Rendered only on Finance/Loan pages, hidden on Rental Portal) */}
        {shouldShowNewLoan && (
          <button
            className="btn btn-primary topbar-new-loan-btn"
            onClick={() => setCurrentPage('loan-issue')}
            title="Issue New Loan"
          >
            <Plus size={15} />
            <span className="btn-label-desktop">New Loan</span>
          </button>
        )}
      </div>
    </header>
  );
};
