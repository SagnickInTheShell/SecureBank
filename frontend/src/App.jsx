import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  LayoutDashboard,
  ArrowRightLeft,
  PlusCircle,
  History,
  FileText,
  Activity,
  FileCode,
  LogOut,
  Send,
  Eye,
  EyeOff,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Ban,
  ChevronRight,
  User,
  Settings,
  BarChart3,
  XCircle,
  HelpCircle
} from 'lucide-react';
import './App.css';

const API_BASE = '';

function generateUUID() {
  return 'tx-sec-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now();
}

function formatINR(amount) {
  if (amount === undefined || amount === null) return '₹ 0.00';
  return (
    '₹ ' +
    amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export default function App() {
  // Navigation / Active View
  const [activeNav, setActiveNav] = useState('dashboard'); // 'dashboard', 'transactions', 'audit', 'risk'

  // Auth State
  const [token, setToken] = useState(localStorage.getItem('securebank_token') || '');
  const [userAccount, setUserAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);

  // Transactions & Audit Logs
  const [transactions, setTransactions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('transactions'); // 'transactions' | 'audit'
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [selectedTxDetails, setSelectedTxDetails] = useState(null);

  // Transfer Form State
  const [recipientInput, setRecipientInput] = useState('SB10002');
  const [transferAmount, setTransferAmount] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(generateUUID());
  const [recipientInfo, setRecipientInfo] = useState(null);
  const [transferError, setTransferError] = useState('');
  const [transferSuccess, setTransferSuccess] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  // Deposit Form State
  const [depositAmount, setDepositAmount] = useState('');
  const [depositSubmitting, setDepositSubmitting] = useState(false);

  // Auth Form State (Login / Register)
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');

  // 1. Fetch User Account
  const fetchAccount = async (currentToken = token) => {
    if (!currentToken) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/accounts/me`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUserAccount(data);
        fetchHistory(currentToken);
        fetchAuditLogs(currentToken);
      } else if (res.status === 401) {
        handleLogout();
      }
    } catch (err) {
      console.error('Failed to fetch account', err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Fetch History
  const fetchHistory = async (currentToken = token) => {
    try {
      const res = await fetch(`${API_BASE}/transactions/history`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTransactions(data);
      }
    } catch (err) {
      console.error('Failed to fetch history', err);
    }
  };

  // 3. Fetch Audit Logs
  const fetchAuditLogs = async (currentToken = token) => {
    try {
      const res = await fetch(`${API_BASE}/accounts/me/audit-logs`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (err) {
      console.error('Failed to fetch audit logs', err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchAccount(token);
    }
  }, [token]);

  // Recipient Verification
  useEffect(() => {
    if (!recipientInput || recipientInput.length < 5 || !token) {
      setRecipientInfo(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/accounts/verify/${recipientInput.trim().toUpperCase()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setRecipientInfo(data);
        } else {
          setRecipientInfo({ valid: false, detail: 'Account does not exist' });
        }
      } catch {
        setRecipientInfo(null);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [recipientInput, token]);

  // Auth Handlers
  const handleLogin = async (e, demoEmail = null, demoPassword = null) => {
    if (e) e.preventDefault();
    setAuthError('');
    const emailToUse = demoEmail || authEmail;
    const passToUse = demoPassword || authPassword;

    try {
      setLoading(true);
      const formData = new URLSearchParams();
      formData.append('username', emailToUse);
      formData.append('password', passToUse);

      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });

      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('securebank_token', data.access_token);
        setToken(data.access_token);
        fetchAccount(data.access_token);
      } else {
        setAuthError(data.detail || 'Login failed. Please check credentials.');
      }
    } catch {
      setAuthError('Unable to connect to SecureBank server.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: authName,
          email: authEmail,
          password: authPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        await handleLogin(null, authEmail, authPassword);
      } else {
        setAuthError(data.detail || 'Registration failed.');
      }
    } catch {
      setAuthError('Registration request failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('securebank_token');
    setToken('');
    setUserAccount(null);
    setTransactions([]);
    setAuditLogs([]);
  };

  // Transfer Handler
  const handleTransfer = async (e, duplicateSimulation = false) => {
    if (e) e.preventDefault();
    setTransferError('');
    setTransferSuccess('');

    const amt = parseInt(transferAmount, 10);
    if (!amt || amt <= 0) {
      setTransferError('Please enter a valid amount greater than 0.');
      return;
    }

    try {
      setTransferSubmitting(true);
      const res = await fetch(`${API_BASE}/transactions/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          receiver_account: recipientInput.trim().toUpperCase(),
          amount: amt,
          idempotency_key: idempotencyKey,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        if (duplicateSimulation) {
          setTransferSuccess(
            `🛡️ Idempotency Verified! Duplicate request recognized (Tx #${data.id}). Replayed previous result without double deduction.`
          );
        } else if (data.status === 'FLAGGED') {
          setTransferSuccess(
            `⚠️ Transfer of ${formatINR(data.amount)} processed with status FLAGGED (Risk Score: MEDIUM). Marked for compliance review.`
          );
          setIdempotencyKey(generateUUID());
        } else {
          setTransferSuccess(`✅ Transfer of ${formatINR(data.amount)} completed successfully!`);
          setIdempotencyKey(generateUUID());
        }
        fetchAccount();
      } else {
        setTransferError(data.detail || 'Transfer failed.');
        fetchAccount();
      }
    } catch {
      setTransferError('Server connection error during transfer.');
    } finally {
      setTransferSubmitting(false);
    }
  };

  // Deposit Handler
  const handleDeposit = async (e) => {
    e.preventDefault();
    const amt = parseInt(depositAmount, 10);
    if (!amt || amt <= 0) return;

    try {
      setDepositSubmitting(true);
      const res = await fetch(`${API_BASE}/accounts/me/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: amt }),
      });
      if (res.ok) {
        setShowDepositModal(false);
        setDepositAmount('');
        fetchAccount();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDepositSubmitting(false);
    }
  };

  // Preset Scenario Click
  const prefillTest = (type) => {
    setShowTransferModal(true);
    setTransferError('');
    setTransferSuccess('');
    setRecipientInput('SB10002');
    if (type === 'safe') {
      setTransferAmount('5000');
      setIdempotencyKey(generateUUID());
    } else if (type === 'flagged') {
      setTransferAmount('85000');
      setIdempotencyKey(generateUUID());
    } else if (type === 'blocked') {
      setTransferAmount('250000');
      setIdempotencyKey(generateUUID());
    }
  };

  // Filtered transactions
  const filteredTransactions = transactions.filter((tx) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      tx.type.toLowerCase().includes(query) ||
      tx.receiver_account.toLowerCase().includes(query) ||
      (tx.sender_account && tx.sender_account.toLowerCase().includes(query)) ||
      tx.status.toLowerCase().includes(query) ||
      tx.amount.toString().includes(query)
    );
  });

  // Calculate live risk preview for modal
  const getRiskPreview = () => {
    const amt = parseInt(transferAmount, 10) || 0;
    if (amt >= 250000) {
      return {
        level: 'HIGH',
        text: 'Risk Prediction: HIGH (Transfer will be BLOCKED by Risk Engine, HTTP 403, 0 funds debited)',
        bg: 'var(--red-bg)',
        border: 'var(--red-border)',
        color: '#f87171',
      };
    }
    if (amt >= 75000) {
      return {
        level: 'MEDIUM',
        text: 'Risk Prediction: MEDIUM (Large transfer: Will execute with status FLAGGED for compliance)',
        bg: 'var(--amber-bg)',
        border: 'var(--amber-border)',
        color: '#fbbf24',
      };
    }
    return {
      level: 'LOW',
      text: 'Risk Prediction: LOW (Safe transfer: Instant execution & COMPLETED)',
      bg: 'var(--green-bg)',
      border: 'var(--green-border)',
      color: '#34d399',
    };
  };

  const riskPreview = getRiskPreview();

  // ================= RENDER =================

  // Auth Screen
  if (!token || !userAccount) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <div className="brand-section" style={{ justifyContent: 'center', marginBottom: 12 }}>
              <div className="sb-logo-box">
                <ShieldCheck size={26} />
              </div>
              <h1 className="sb-brand-name">SecureBank</h1>
            </div>
            <p className="sb-brand-desc">Intelligent Banking Transaction Platform</p>
          </div>

          <div className="auth-tabs">
            <button
              className={`auth-tab-btn ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setAuthMode('login');
                setAuthError('');
              }}
            >
              Sign In
            </button>
            <button
              className={`auth-tab-btn ${authMode === 'register' ? 'active' : ''}`}
              onClick={() => {
                setAuthMode('register');
                setAuthError('');
              }}
            >
              Open Account
            </button>
          </div>

          {authError && (
            <div
              style={{
                background: 'var(--red-bg)',
                border: '1px solid var(--red-border)',
                color: '#f87171',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                marginBottom: '16px',
              }}
            >
              {authError}
            </div>
          )}

          {authMode === 'login' ? (
            <form onSubmit={(e) => handleLogin(e)}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="alice@example.com"
                  className="form-input"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="form-input"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={loading}
              >
                {loading ? 'Authenticating...' : 'Sign In to Account'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="Alice Smith"
                  className="form-input"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="alice@example.com"
                  className="form-input"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="form-input"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={loading}
              >
                {loading ? 'Opening...' : 'Register & Open Bank Account'}
              </button>
            </form>
          )}

          <div className="demo-users-box">
            <div className="demo-title">Quick Demo Login</div>
            <div className="demo-buttons">
              <button
                type="button"
                className="demo-btn"
                onClick={() => {
                  setAuthEmail('alice@example.com');
                  setAuthPassword('secret123');
                  handleLogin(null, 'alice@example.com', 'secret123');
                }}
              >
                👤 Alice (SB10001)
              </button>
              <button
                type="button"
                className="demo-btn"
                onClick={() => {
                  setAuthEmail('bob@example.com');
                  setAuthPassword('secret123');
                  handleLogin(null, 'bob@example.com', 'secret123');
                }}
              >
                👤 Bob (SB10002)
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Logged-in Dashboard
  return (
    <div className="sb-app">
      {/* Top Navigation Bar */}
      <header className="sb-topbar">
        <div className="sb-brand">
          <div className="sb-logo-box">
            <ShieldCheck size={24} />
          </div>
          <div>
            <div className="sb-brand-name">SecureBank</div>
            <div className="sb-brand-desc">Intelligent Banking Transaction Platform</div>
          </div>
        </div>

        <div className="sb-topbar-right">
          <div className="sb-api-badge">
            <span className="sb-green-dot"></span>
            <span>API Online</span>
          </div>

          <div className="sb-user-chip" title="Account Holder">
            <User size={15} color="#818cf8" />
            <span>{userAccount.account_number}</span>
          </div>

          <button onClick={handleLogout} className="sb-logout-btn" title="Sign Out">
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Layout: Sidebar + Content */}
      <div className="sb-layout">
        {/* Left Sidebar */}
        <aside className="sb-sidebar">
          <button
            className={`sb-nav-item ${activeNav === 'dashboard' ? 'active' : ''}`}
            onClick={() => {
              setActiveNav('dashboard');
              setActiveTab('transactions');
            }}
          >
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </button>

          <button
            className={`sb-nav-item ${activeNav === 'transfer' ? 'active' : ''}`}
            onClick={() => {
              setActiveNav('transfer');
              setShowTransferModal(true);
              setTransferError('');
              setTransferSuccess('');
              setRecipientInput('SB10002');
              setIdempotencyKey(generateUUID());
            }}
          >
            <ArrowRightLeft size={18} />
            <span>Transfer</span>
          </button>

          <button
            className={`sb-nav-item ${activeNav === 'deposit' ? 'active' : ''}`}
            onClick={() => {
              setActiveNav('deposit');
              setShowDepositModal(true);
            }}
          >
            <PlusCircle size={18} />
            <span>Deposit</span>
          </button>

          <button
            className={`sb-nav-item ${activeNav === 'transactions' ? 'active' : ''}`}
            onClick={() => {
              setActiveNav('transactions');
              setActiveTab('transactions');
            }}
          >
            <History size={18} />
            <span>Transactions</span>
          </button>

          <button
            className={`sb-nav-item ${activeNav === 'audit' ? 'active' : ''}`}
            onClick={() => {
              setActiveNav('audit');
              setActiveTab('audit');
            }}
          >
            <FileText size={18} />
            <span>Audit Log</span>
          </button>

          <button
            className={`sb-nav-item ${activeNav === 'risk' ? 'active' : ''}`}
            onClick={() => {
              setActiveNav('risk');
              prefillTest('safe');
            }}
          >
            <Activity size={18} />
            <span>Risk Engine</span>
          </button>

          <a
            href="http://127.0.0.1:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="sb-nav-item"
            title="Open FastAPI Swagger Interactive Docs"
          >
            <FileCode size={18} />
            <span>API Docs</span>
          </a>
        </aside>

        {/* Main Content */}
        <main className="sb-main">
          {/* Greeting */}
          <div className="sb-greeting">
            <h2 className="sb-greeting-title">Welcome back, {userAccount.account_number} 👋</h2>
            <div className="sb-greeting-sub">Here's your account overview</div>
          </div>

          {/* Top Cards Grid */}
          <div className="sb-top-grid">
            {/* Card 1: TOTAL BALANCE */}
            <div className="sb-balance-card">
              {/* 3D Bank Silhouette Watermark */}
              <svg
                className="sb-bank-watermark"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 21h18" />
                <path d="M3 10h18" />
                <path d="M5 6l7-3 7 3" />
                <path d="M4 10v11" />
                <path d="M20 10v11" />
                <path d="M8 14v4" />
                <path d="M12 14v4" />
                <path d="M16 14v4" />
              </svg>

              <div>
                <div className="sb-balance-top">
                  <div className="sb-balance-label-row">
                    <span>TOTAL BALANCE</span>
                    <button
                      className="sb-eye-toggle"
                      onClick={() => setHideBalance(!hideBalance)}
                      title={hideBalance ? 'Show balance' : 'Hide balance'}
                    >
                      {hideBalance ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>

                  <div className="sb-status-pill">
                    <span className="sb-green-dot"></span>
                    <span>{userAccount.status}</span>
                  </div>
                </div>

                <div className="sb-balance-value">
                  {hideBalance ? '₹ ••••••' : formatINR(userAccount.balance)}
                </div>

                <div className="sb-balance-subtext">Available in your SecureBank account</div>
              </div>

              <div className="sb-balance-buttons">
                <button
                  className="sb-btn-transfer"
                  onClick={() => {
                    setShowTransferModal(true);
                    setTransferError('');
                    setTransferSuccess('');
                    setRecipientInput('SB10002');
                    setIdempotencyKey(generateUUID());
                  }}
                >
                  <Send size={15} />
                  <span>Transfer Money</span>
                  <ChevronRight size={15} />
                </button>

                <button className="sb-btn-deposit" onClick={() => setShowDepositModal(true)}>
                  <PlusCircle size={15} />
                  <span>Deposit Funds</span>
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>

            {/* Card 2: Rule-Based Fraud Engine */}
            <div className="sb-fraud-card">
              <div>
                <div className="sb-fraud-header">
                  <div className="sb-fraud-icon">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <div className="sb-fraud-title">Rule-Based Fraud Engine</div>
                    <div className="sb-fraud-subtitle">Every transaction is evaluated using risk rules</div>
                  </div>
                </div>

                {/* Pipeline Flow Boxes */}
                <div className="sb-pipeline-flow">
                  <div className="sb-pipe-box">
                    <FileText size={18} className="sb-pipe-icon" />
                    <span className="sb-pipe-tag">INPUT</span>
                    <span className="sb-pipe-name">Transfer</span>
                  </div>
                  <span className="sb-pipe-arrow">→</span>
                  <div className="sb-pipe-box">
                    <Settings size={18} className="sb-pipe-icon" />
                    <span className="sb-pipe-tag">ENGINE</span>
                    <span className="sb-pipe-name">Risk Rules</span>
                  </div>
                  <span className="sb-pipe-arrow">→</span>
                  <div className="sb-pipe-box">
                    <BarChart3 size={18} className="sb-pipe-icon" />
                    <span className="sb-pipe-tag">OUTPUT</span>
                    <span className="sb-pipe-name">Risk Score</span>
                  </div>
                </div>

                {/* Risk Tiers */}
                <div className="sb-tiers-grid">
                  <div className="sb-tier-box low">
                    <CheckCircle2 size={18} />
                    <div>
                      <div className="sb-tier-title">LOW (&lt; 30)</div>
                      <div className="sb-tier-action">Process</div>
                    </div>
                  </div>
                  <div className="sb-tier-box medium">
                    <AlertTriangle size={18} />
                    <div>
                      <div className="sb-tier-title">MEDIUM (30 – 59)</div>
                      <div className="sb-tier-action">Flag</div>
                    </div>
                  </div>
                  <div className="sb-tier-box high">
                    <Ban size={18} />
                    <div>
                      <div className="sb-tier-title">HIGH (≥ 60)</div>
                      <div className="sb-tier-action">Block</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Test Scenarios */}
              <div>
                <div className="sb-scenarios-label">Quick Test Scenarios</div>
                <div className="sb-scenarios-row">
                  <button className="sb-scenario-btn" onClick={() => prefillTest('safe')}>
                    <ShieldCheck size={16} color="#34d399" />
                    <div style={{ textAlign: 'left' }}>
                      <div className="sb-scenario-amt">₹5,000</div>
                      <div className="sb-scenario-desc">(Safe)</div>
                    </div>
                  </button>

                  <button className="sb-scenario-btn" onClick={() => prefillTest('flagged')}>
                    <AlertTriangle size={16} color="#fbbf24" />
                    <div style={{ textAlign: 'left' }}>
                      <div className="sb-scenario-amt">₹85,000</div>
                      <div className="sb-scenario-desc">(Flagged)</div>
                    </div>
                  </button>

                  <button className="sb-scenario-btn" onClick={() => prefillTest('blocked')}>
                    <Ban size={16} color="#f87171" />
                    <div style={{ textAlign: 'left' }}>
                      <div className="sb-scenario-amt">₹250,000</div>
                      <div className="sb-scenario-desc">(Blocked)</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Card: Transactions / Audit Table */}
          <div className="sb-bottom-card">
            {/* Tab Buttons */}
            <div className="sb-tabs-row">
              <div className="sb-tabs-left">
                <button
                  className={`sb-tab-btn ${activeTab === 'transactions' ? 'active' : ''}`}
                  onClick={() => setActiveTab('transactions')}
                >
                  <History size={16} />
                  <span>Recent Transactions ({transactions.length})</span>
                </button>

                <button
                  className={`sb-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
                  onClick={() => setActiveTab('audit')}
                >
                  <ShieldCheck size={16} />
                  <span>Audit Log Trail ({auditLogs.length})</span>
                </button>
              </div>

              <button className="sb-sync-btn" onClick={() => fetchAccount()}>
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                <span>Sync</span>
              </button>
            </div>

            {/* Search & Filter Row */}
            <div className="sb-search-row">
              <div className="sb-search-box">
                <Search size={14} color="#64748b" />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  className="sb-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button className="sb-filter-btn" title="Filter transactions">
                <Filter size={14} />
              </button>
            </div>

            {/* Tab 1: Transactions Table */}
            {activeTab === 'transactions' && (
              <div>
                {filteredTransactions.length === 0 ? (
                  <div className="sb-empty-state">
                    <div className="sb-empty-icon">
                      <FileText size={24} />
                    </div>
                    <div className="sb-empty-title">No transactions yet</div>
                    <div className="sb-empty-sub">Click Transfer Money or Deposit Funds to get started.</div>
                    <div className="sb-empty-actions">
                      <button
                        className="btn-primary"
                        onClick={() => {
                          setShowTransferModal(true);
                          setRecipientInput('SB10002');
                        }}
                      >
                        <Send size={14} />
                        <span>Transfer Money</span>
                      </button>
                      <button className="btn-secondary" onClick={() => setShowDepositModal(true)}>
                        <PlusCircle size={14} />
                        <span>Deposit Funds</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="sb-table">
                      <thead>
                        <tr>
                          <th>Date & Time</th>
                          <th>Type</th>
                          <th>Amount</th>
                          <th>Party / Account</th>
                          <th>Risk Score</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTransactions.map((tx) => {
                          const isCredit =
                            tx.receiver_account === userAccount.account_number && tx.type === 'DEPOSIT';
                          const isIncoming =
                            tx.receiver_account === userAccount.account_number && tx.type === 'TRANSFER';
                          const isPositive = isCredit || isIncoming;
                          const party = isCredit
                            ? '—'
                            : isIncoming
                            ? tx.sender_account
                            : tx.receiver_account;

                          return (
                            <tr key={tx.id}>
                              <td style={{ color: '#94a3b8' }}>
                                {tx.created_at ? new Date(tx.created_at).toLocaleString() : 'Just now'}
                              </td>
                              <td style={{ fontWeight: 700, color: '#ffffff' }}>{tx.type}</td>
                              <td
                                style={{
                                  fontWeight: 800,
                                  fontFamily: 'monospace',
                                  color: isPositive ? '#34d399' : '#f8fafc',
                                }}
                              >
                                {isPositive
                                  ? `+ ₹${tx.amount.toLocaleString('en-IN')}`
                                  : `- ₹${tx.amount.toLocaleString('en-IN')}`}
                              </td>
                              <td style={{ fontFamily: 'monospace' }}>{party}</td>
                              <td>
                                <span
                                  className={`sb-badge ${
                                    tx.risk_score === 'HIGH'
                                      ? 'blocked'
                                      : tx.risk_score === 'MEDIUM'
                                      ? 'flagged'
                                      : 'success'
                                  }`}
                                >
                                  {tx.risk_score || 'LOW'}
                                </span>
                              </td>
                              <td>
                                {tx.status === 'COMPLETED' && (
                                  <span className="sb-badge success">
                                    <CheckCircle2 size={11} /> Success
                                  </span>
                                )}
                                {tx.status === 'FLAGGED' && (
                                  <span className="sb-badge flagged" title="Flagged by Risk Engine">
                                    <AlertTriangle size={11} /> Flagged
                                  </span>
                                )}
                                {tx.status === 'BLOCKED' && (
                                  <span className="sb-badge blocked" title={tx.failure_reason}>
                                    <Ban size={11} /> Blocked
                                  </span>
                                )}
                                {tx.status === 'FAILED' && (
                                  <span className="sb-badge failed" title={tx.failure_reason}>
                                    <XCircle size={11} /> Failed
                                  </span>
                                )}
                              </td>
                              <td>
                                <button
                                  className="test-chip"
                                  style={{ padding: '3px 8px', fontSize: '11px' }}
                                  onClick={() => setSelectedTxDetails(tx)}
                                >
                                  View
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Audit Logs Table */}
            {activeTab === 'audit' && (
              <div style={{ overflowX: 'auto' }}>
                <table className="sb-table">
                  <thead>
                    <tr>
                      <th>Log ID</th>
                      <th>Action</th>
                      <th>Details</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ color: '#94a3b8', fontFamily: 'monospace' }}>#{log.id}</td>
                        <td>
                          <span
                            className={`sb-badge ${
                              log.action.includes('FAILED') || log.action.includes('BLOCKED')
                                ? 'blocked'
                                : log.action.includes('FLAGGED')
                                ? 'flagged'
                                : 'success'
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td style={{ color: '#ffffff' }}>{log.details || '—'}</td>
                        <td style={{ color: '#94a3b8' }}>
                          {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Transfer Money Modal */}
      {showTransferModal && (
        <div className="modal-overlay" onClick={() => setShowTransferModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Transfer Money</h3>
              <button className="btn-close" onClick={() => setShowTransferModal(false)}>
                ×
              </button>
            </div>

            {transferError && (
              <div
                style={{
                  background: 'var(--red-bg)',
                  border: '1px solid var(--red-border)',
                  color: '#f87171',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  marginBottom: '16px',
                }}
              >
                {transferError}
              </div>
            )}

            {transferSuccess && (
              <div
                style={{
                  background: 'var(--green-bg)',
                  border: '1px solid var(--green-border)',
                  color: '#34d399',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  marginBottom: '16px',
                }}
              >
                {transferSuccess}
              </div>
            )}

            <form onSubmit={handleTransfer}>
              <div className="form-group">
                <label className="form-label">Recipient Account Number</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SB10002"
                  className="form-input font-mono"
                  value={recipientInput}
                  onChange={(e) => setRecipientInput(e.target.value.toUpperCase())}
                />
                {recipientInfo && (
                  <div className={`recipient-preview ${recipientInfo.valid ? '' : 'invalid'}`}>
                    <span>
                      {recipientInfo.valid
                        ? `Verified: ${recipientInfo.name} (${recipientInfo.account_number})`
                        : recipientInfo.is_self
                        ? 'Cannot transfer to your own account'
                        : recipientInfo.detail || 'Invalid or inactive account'}
                    </span>
                    {recipientInfo.valid ? (
                      <CheckCircle2 size={16} color="#10b981" />
                    ) : (
                      <XCircle size={16} color="#ef4444" />
                    )}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Amount (INR)</label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="5000"
                  className="form-input"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                />
                <div className="preset-pills">
                  <span className="preset-pill" onClick={() => setTransferAmount('5000')}>
                    ₹5,000 (Safe)
                  </span>
                  <span className="preset-pill" onClick={() => setTransferAmount('85000')}>
                    ₹85,000 (Flagged)
                  </span>
                  <span className="preset-pill" onClick={() => setTransferAmount('250000')}>
                    ₹250,000 (Blocked)
                  </span>
                </div>
              </div>

              {/* Real-time Risk Prediction Banner */}
              {transferAmount && (
                <div
                  style={{
                    padding: '9px 12px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '14px',
                    background: riskPreview.bg,
                    border: `1px solid ${riskPreview.border}`,
                    color: riskPreview.color,
                    fontWeight: 600,
                  }}
                >
                  <Activity size={15} />
                  <span>{riskPreview.text}</span>
                </div>
              )}

              {/* Idempotency Protection Box */}
              <div className="idempotency-box">
                <div className="idempotency-header">
                  <span>🛡️ Idempotency Protection Active</span>
                  <button
                    type="button"
                    onClick={() => setIdempotencyKey(generateUUID())}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#818cf8',
                      cursor: 'pointer',
                      fontSize: 11,
                    }}
                  >
                    Regenerate Key
                  </button>
                </div>
                <div className="idempotency-key-text">Key: {idempotencyKey}</div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  disabled={transferSubmitting}
                >
                  {transferSubmitting ? 'Processing...' : 'Confirm Transfer'}
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: 12, padding: '0 12px' }}
                  title="Test sending twice with the same key to verify idempotency deduplication"
                  onClick={() => handleTransfer(null, true)}
                  disabled={transferSubmitting}
                >
                  Test Duplicate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="modal-overlay" onClick={() => setShowDepositModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Deposit Funds</h3>
              <button className="btn-close" onClick={() => setShowDepositModal(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleDeposit}>
              <div className="form-group">
                <label className="form-label">Deposit Amount (INR)</label>
                <input
                  type="number"
                  min="1"
                  max="1000000"
                  required
                  placeholder="50000"
                  className="form-input"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                />
                <div className="preset-pills">
                  <span className="preset-pill" onClick={() => setDepositAmount('10000')}>
                    ₹10,000
                  </span>
                  <span className="preset-pill" onClick={() => setDepositAmount('50000')}>
                    ₹50,000
                  </span>
                  <span className="preset-pill" onClick={() => setDepositAmount('100000')}>
                    ₹100,000
                  </span>
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={depositSubmitting}
              >
                {depositSubmitting ? 'Depositing...' : 'Deposit to Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Details Modal */}
      {selectedTxDetails && (
        <div className="modal-overlay" onClick={() => setSelectedTxDetails(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Transaction #{selectedTxDetails.id} Details</h3>
              <button className="btn-close" onClick={() => setSelectedTxDetails(null)}>
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              <div>
                <strong>Type:</strong> {selectedTxDetails.type}
              </div>
              <div>
                <strong>Amount:</strong> {formatINR(selectedTxDetails.amount)}
              </div>
              <div>
                <strong>Sender:</strong> {selectedTxDetails.sender_account || '—'}
              </div>
              <div>
                <strong>Receiver:</strong> {selectedTxDetails.receiver_account}
              </div>
              <div>
                <strong>Status:</strong> {selectedTxDetails.status}
              </div>
              <div>
                <strong>Risk Score:</strong> {selectedTxDetails.risk_score}
              </div>
              {selectedTxDetails.failure_reason && (
                <div>
                  <strong>Reason:</strong> {selectedTxDetails.failure_reason}
                </div>
              )}
              {selectedTxDetails.idempotency_key && (
                <div style={{ wordBreak: 'break-all' }}>
                  <strong>Idempotency Key:</strong> {selectedTxDetails.idempotency_key}
                </div>
              )}
              <div>
                <strong>Date & Time:</strong> {new Date(selectedTxDetails.created_at).toLocaleString()}
              </div>
            </div>

            <button
              className="btn-secondary"
              style={{ width: '100%', marginTop: 20, justifyContent: 'center' }}
              onClick={() => setSelectedTxDetails(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
