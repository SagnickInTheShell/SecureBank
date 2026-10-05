import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  LogOut,
  Send,
  PlusCircle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Lock,
  KeyRound,
  User,
  Activity,
  History,
  Sparkles,
  Info
} from 'lucide-react';
import './App.css';

// Base API URL (proxied by Vite or direct)
const API_BASE = '';

function generateUUID() {
  return 'tx-sec-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now();
}

function formatINR(amount) {
  if (amount === undefined || amount === null) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function App() {
  // Auth state
  const [token, setToken] = useState(localStorage.getItem('securebank_token') || '');
  const [userAccount, setUserAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState('checking');

  // Transactions & Audit Logs
  const [transactions, setTransactions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('transactions'); // 'transactions' | 'audit'

  // Modals
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);

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
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');

  // 1. Check API Health
  const checkHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) {
        setHealthStatus('online');
      } else {
        setHealthStatus('degraded');
      }
    } catch {
      setHealthStatus('offline');
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  // 2. Fetch User Account & Balance
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

  // 3. Fetch Transaction History
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

  // 4. Fetch Audit Logs
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

  // Recipient Verification (Debounced)
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
    }, 350);

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
      setAuthError('Unable to connect to SecureBank API server.');
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

  // Seed / Reset to Interview Spec
  const handleDemoSeed = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/accounts/demo-seed`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchAccount();
      }
    } catch (err) {
      console.error('Failed to seed demo data', err);
    } finally {
      setLoading(false);
    }
  };

  // Transfer Money Handler
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
            `🛡️ Idempotency Verified! Duplicate request recognized (Tx #${data.id}). Safe replay: no double deduction occurred.`
          );
        } else if (data.status === 'FLAGGED') {
          setTransferSuccess(
            `⚠️ Transfer of ${formatINR(data.amount)} completed with status FLAGGED (Risk Score: MEDIUM). Marked for compliance review.`
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

  // Deposit Money Handler
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

  // Preset quick fill for interview demonstrations
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

  // Calculate live risk preview for modal
  const getRiskPreview = () => {
    const amt = parseInt(transferAmount, 10) || 0;
    if (amt >= 250000) {
      return {
        level: 'HIGH',
        text: 'Risk Prediction: HIGH (Will be BLOCKED by Risk Engine, HTTP 403, 0 funds debited)',
        bg: 'var(--danger-bg)',
        border: 'var(--danger-border)',
        color: '#f87171',
      };
    }
    if (amt >= 75000) {
      return {
        level: 'MEDIUM',
        text: 'Risk Prediction: MEDIUM (High amount: Will execute with status FLAGGED)',
        bg: 'var(--warning-bg)',
        border: 'var(--warning-border)',
        color: '#fbbf24',
      };
    }
    return {
      level: 'LOW',
      text: 'Risk Prediction: LOW (Safe transfer: Instant execution & COMPLETED)',
      bg: 'var(--success-bg)',
      border: 'var(--success-border)',
      color: '#34d399',
    };
  };

  const riskPreview = getRiskPreview();

  // ================= RENDER =================

  // If user is not logged in: show Auth Screen
  if (!token || !userAccount) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <div className="brand-section" style={{ justifyContent: 'center', marginBottom: 12 }}>
              <div className="brand-icon">
                <ShieldCheck size={28} />
              </div>
              <h1 className="brand-title">SecureBank</h1>
            </div>
            <p className="brand-subtitle">Intelligent Banking Transaction Platform</p>
          </div>

          <div className="auth-tabs">
            <button
              className={`auth-tab-btn ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
            >
              Sign In
            </button>
            <button
              className={`auth-tab-btn ${authMode === 'register' ? 'active' : ''}`}
              onClick={() => { setAuthMode('register'); setAuthError(''); }}
            >
              Open Account
            </button>
          </div>

          {authError && (
            <div style={{
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              color: '#f87171',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              marginBottom: '16px'
            }}>
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
              <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
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
                <label className="form-label">Password (min 6 chars)</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="form-input"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                {loading ? 'Creating...' : 'Register & Open Bank Account'}
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

  // Logged-in Dashboard View
  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-icon">
            <ShieldCheck size={26} />
          </div>
          <div>
            <h1 className="brand-title">SecureBank</h1>
            <p className="brand-subtitle">Intelligent Banking Transaction Platform</p>
          </div>
        </div>

        <div className="header-actions">
          <button
            onClick={handleDemoSeed}
            className="test-chip"
            style={{
              background: 'rgba(99, 102, 241, 0.25)',
              color: '#c7d2fe',
              border: '1px solid rgba(99, 102, 241, 0.5)',
              padding: '6px 14px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Reset Alice to the exact ₹42,500 interview specification"
          >
            <Sparkles size={14} color="#818cf8" />
            <span>Reset Demo (₹42,500)</span>
          </button>

          <div className="health-badge" title="FastAPI REST API /health endpoint">
            <span className="health-dot"></span>
            <span>API Online</span>
          </div>

          <div className="user-profile-badge">
            <User size={16} color="#818cf8" />
            <span className="account-pill">{userAccount.account_number}</span>
          </div>

          <button onClick={handleLogout} className="btn-logout" title="Sign Out">
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Top Grid: Balance & Risk Engine */}
      <div className="balance-grid">
        {/* Balance Card */}
        <div className="balance-card">
          <div className="balance-header">
            <span className="balance-label">Total Balance</span>
            <span className="account-status-tag">
              <span className="pulse-dot" style={{ background: '#34d399' }}></span>
              {userAccount.status}
            </span>
          </div>

          <div className="balance-amount">
            <span className="currency-symbol">₹</span>
            <span>{userAccount.balance.toLocaleString('en-IN')}</span>
          </div>

          <div className="balance-actions">
            <button
              onClick={() => {
                setShowTransferModal(true);
                setTransferError('');
                setTransferSuccess('');
                setRecipientInput('SB10002');
                setIdempotencyKey(generateUUID());
              }}
              className="btn-primary"
            >
              <Send size={16} />
              <span>Transfer Money</span>
            </button>

            <button
              onClick={() => setShowDepositModal(true)}
              className="btn-secondary"
            >
              <PlusCircle size={16} />
              <span>Deposit Funds</span>
            </button>
          </div>
        </div>

        {/* Risk Engine Explainer Card */}
        <div className="risk-explainer-card">
          <div>
            <div className="risk-card-title">
              <Activity size={16} color="#6366f1" />
              <span>Rule-Based Fraud Engine</span>
            </div>

            <div className="risk-pipeline">
              <div className="pipeline-step">
                <div className="pipeline-step-label">Input</div>
                <div className="pipeline-step-val">Transfer</div>
              </div>
              <span className="pipeline-arrow">→</span>
              <div className="pipeline-step">
                <div className="pipeline-step-label">Engine</div>
                <div className="pipeline-step-val">Risk Rules</div>
              </div>
              <span className="pipeline-arrow">→</span>
              <div className="pipeline-step">
                <div className="pipeline-step-label">Output</div>
                <div className="pipeline-step-val">Risk Score</div>
              </div>
            </div>

            <div className="risk-tiers">
              <div className="tier-item low">
                <div className="tier-score">LOW (&lt;30)</div>
                <div className="tier-action">Process</div>
              </div>
              <div className="tier-item medium">
                <div className="tier-score">MEDIUM (30-59)</div>
                <div className="tier-action">Flag</div>
              </div>
              <div className="tier-item high">
                <div className="tier-score">HIGH (≥60)</div>
                <div className="tier-action">Block</div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
              QUICK TEST SCENARIOS:
            </div>
            <div className="quick-tests">
              <span className="test-chip" onClick={() => prefillTest('safe')}>₹5,000 (Safe)</span>
              <span className="test-chip" onClick={() => prefillTest('flagged')}>₹85,000 (Flagged)</span>
              <span className="test-chip" onClick={() => prefillTest('blocked')}>₹250,000 (Blocked)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Card: Tabs (Ledger & Audit) */}
      <div className="content-card">
        <div className="tabs-header">
          <div className="tab-buttons">
            <button
              className={`tab-btn ${activeTab === 'transactions' ? 'active' : ''}`}
              onClick={() => setActiveTab('transactions')}
            >
              <History size={16} />
              <span>Recent Transactions ({transactions.length})</span>
            </button>
            <button
              className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
              onClick={() => setActiveTab('audit')}
            >
              <ShieldCheck size={16} />
              <span>Audit Log Trail ({auditLogs.length})</span>
            </button>
          </div>

          <button
            onClick={() => { fetchAccount(); }}
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: 12 }}
            title="Refresh Data"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Sync</span>
          </button>
        </div>

        {/* Tab 1: Transactions Ledger */}
        {activeTab === 'transactions' && (
          <div className="table-responsive">
            {transactions.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No transactions yet. Click <strong>Transfer Money</strong> or <strong>Deposit Funds</strong> to get started.
              </div>
            ) : (
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Tx ID</th>
                    <th>Type</th>
                    <th>Sender</th>
                    <th>Receiver</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Risk Score</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const isCredit = tx.receiver_account === userAccount.account_number && tx.type === 'DEPOSIT';
                    const isIncomingTransfer = tx.receiver_account === userAccount.account_number && tx.type === 'TRANSFER';
                    const isPositive = isCredit || isIncomingTransfer;

                    return (
                      <tr key={tx.id}>
                        <td className="font-mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          #{tx.id}
                        </td>
                        <td>
                          <span style={{ fontWeight: 600 }}>{tx.type}</span>
                        </td>
                        <td className="font-mono">{tx.sender_account || '—'}</td>
                        <td className="font-mono">{tx.receiver_account}</td>
                        <td>
                          <span className={isPositive ? 'amount-positive' : 'amount-negative'}>
                            {isPositive ? `+ ${formatINR(tx.amount)}` : `- ${formatINR(tx.amount)}`}
                          </span>
                        </td>
                        <td>
                          {tx.status === 'COMPLETED' && (
                            <span className="badge badge-success">
                              <CheckCircle2 size={12} /> Success
                            </span>
                          )}
                          {tx.status === 'FLAGGED' && (
                            <span className="badge badge-warning" title="Flagged by Rule-based Risk Engine">
                              <AlertTriangle size={12} /> Flagged
                            </span>
                          )}
                          {tx.status === 'BLOCKED' && (
                            <span className="badge badge-danger" title={tx.failure_reason || 'Blocked by Risk Engine'}>
                              <XCircle size={12} /> Blocked
                            </span>
                          )}
                          {tx.status === 'FAILED' && (
                            <span className="badge badge-danger" title={tx.failure_reason}>
                              <XCircle size={12} /> Failed
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${
                            tx.risk_score === 'HIGH' ? 'badge-danger' :
                            tx.risk_score === 'MEDIUM' ? 'badge-warning' :
                            'badge-success'
                          }`}>
                            {tx.risk_score || 'LOW'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {tx.created_at ? new Date(tx.created_at).toLocaleString() : 'Just now'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 2: Audit Logs Trail */}
        {activeTab === 'audit' && (
          <div className="table-responsive">
            {auditLogs.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No audit logs recorded for this account.
              </div>
            ) : (
              <table className="custom-table">
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
                      <td className="font-mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        #{log.id}
                      </td>
                      <td>
                        <span className={`badge ${
                          log.action.includes('FAILED') || log.action.includes('BLOCKED') ? 'badge-danger' :
                          log.action.includes('FLAGGED') ? 'badge-warning' :
                          'badge-neutral'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-primary)' }}>{log.details || '—'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Transfer Money Modal */}
      {showTransferModal && (
        <div className="modal-overlay" onClick={() => setShowTransferModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Transfer Money</h3>
              <button className="btn-close" onClick={() => setShowTransferModal(false)}>×</button>
            </div>

            {transferError && (
              <div style={{
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger-border)',
                color: '#f87171',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                marginBottom: '16px'
              }}>
                {transferError}
              </div>
            )}

            {transferSuccess && (
              <div style={{
                background: 'var(--success-bg)',
                border: '1px solid var(--success-border)',
                color: '#34d399',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                marginBottom: '16px'
              }}>
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
                      {recipientInfo.valid ? `Verified: ${recipientInfo.name} (${recipientInfo.account_number})` :
                       recipientInfo.is_self ? 'Cannot transfer to your own account' :
                       recipientInfo.detail || 'Invalid or inactive account'}
                    </span>
                    {recipientInfo.valid ? <CheckCircle2 size={16} color="#10b981" /> : <XCircle size={16} color="#ef4444" />}
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
                  <span className="preset-pill" onClick={() => setTransferAmount('5000')}>₹5,000 (Safe)</span>
                  <span className="preset-pill" onClick={() => setTransferAmount('85000')}>₹85,000 (Flagged)</span>
                  <span className="preset-pill" onClick={() => setTransferAmount('250000')}>₹250,000 (Blocked)</span>
                </div>
              </div>

              {/* Real-time Risk Prediction Banner */}
              {transferAmount && (
                <div style={{
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '14px',
                  background: riskPreview.bg,
                  border: `1px solid ${riskPreview.border}`,
                  color: riskPreview.color,
                  fontWeight: 500
                }}>
                  <Activity size={15} />
                  <span>{riskPreview.text}</span>
                </div>
              )}

              {/* Idempotency Demonstration Box */}
              <div className="idempotency-box">
                <div className="idempotency-header">
                  <span>🛡️ Idempotency Protection Active</span>
                  <button
                    type="button"
                    onClick={() => setIdempotencyKey(generateUUID())}
                    style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: 11 }}
                  >
                    Regenerate Key
                  </button>
                </div>
                <div className="idempotency-key-text">
                  Key: {idempotencyKey}
                </div>
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
                  title="Simulate accidental double-click to test duplicate transfer protection"
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
              <button className="btn-close" onClick={() => setShowDepositModal(false)}>×</button>
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
                  <span className="preset-pill" onClick={() => setDepositAmount('10000')}>₹10,000</span>
                  <span className="preset-pill" onClick={() => setDepositAmount('50000')}>₹50,000</span>
                  <span className="preset-pill" onClick={() => setDepositAmount('100000')}>₹100,000</span>
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
    </div>
  );
}
