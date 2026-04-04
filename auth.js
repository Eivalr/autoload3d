/* =============================================
   auth.js — Supabase Auth + Saved Loadings
   Supports new sb_publishable key format
   ============================================= */

'use strict';

const SUPABASE_URL = 'https://kxybwmmkqcdnwemtrxzq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_B8xnwHjMoOCtxByuxUkb2A_9UL9xFLy';

// ── SUPABASE CLIENT ──────────────────────────
const SB = {
  async req(method, path, body = null, token = null) {
    const headers = { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      method, headers,
      body: body ? JSON.stringify(body) : null,
    });
    let data;
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) {
      const msg = data.error_description || data.message || data.msg || data.error || JSON.stringify(data);
      throw new Error(msg);
    }
    return data;
  },
  auth(method, path, body) { return this.req(method, `/auth/v1${path}`, body); },
  db(method, path, body, token) { return this.req(method, `/rest/v1${path}`, body, token); },
};

// ── SESSION ──────────────────────────────────
const Session = {
  get() { try { return JSON.parse(localStorage.getItem('al3d_session')); } catch { return null; } },
  set(s) { localStorage.setItem('al3d_session', JSON.stringify(s)); },
  clear() { localStorage.removeItem('al3d_session'); },
};

let AuthState = { user: null, token: null, profile: null };

// ── INIT ─────────────────────────────────────
async function initAuth() {
  const s = Session.get();
  if (!s?.refresh_token) return showAuthModal('login');
  try {
    const data = await SB.auth('POST', '/token?grant_type=refresh_token', { refresh_token: s.refresh_token });
    setSession(data);
    await loadProfile();
    onAuthReady();
  } catch(e) {
    Session.clear();
    showAuthModal('login');
  }
}

// Extract user + token from any Supabase auth response (handles both old and new formats)
function setSession(data) {
  // New format: data.session.access_token + data.user
  // Old format: data.access_token + data.user
  const token = data?.session?.access_token || data?.access_token;
  const refreshToken = data?.session?.refresh_token || data?.refresh_token;
  const user = data?.user;
  if (!token || !user) throw new Error('Invalid session response from Supabase');
  AuthState.token = token;
  AuthState.user = user;
  Session.set({ access_token: token, refresh_token: refreshToken });
}

async function loadProfile() {
  try {
    const rows = await SB.db('GET', `/profiles?user_id=eq.${AuthState.user.id}&select=*`, null, AuthState.token);
    AuthState.profile = Array.isArray(rows) ? (rows[0] || null) : null;
  } catch { AuthState.profile = null; }
}

function onAuthReady() {
  document.getElementById('authModal').style.display = 'none';
  document.getElementById('appShell').style.display = 'block';
  updateUserBadge();
  loadSavedLoadings();
  // Also init the main app
  if (typeof genRef === 'function') {
    genRef(); updateEquipPreview(); renderItemList();
    document.getElementById('page-input').style.display = 'block';
  }
}

function updateUserBadge() {
  const name = AuthState.profile?.full_name || AuthState.user?.email?.split('@')[0] || '';
  const company = AuthState.profile?.company_name || '';
  document.getElementById('userBadge').textContent = company ? `${name} · ${company}` : name;
}

// ── LOGIN ─────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('authEmail').value.trim();
  const pass = document.getElementById('authPass').value;
  if (!email || !pass) { authError('Enter email and password.'); return; }
  setAuthLoading(true);
  try {
    const data = await SB.auth('POST', '/token?grant_type=password', { email, password: pass });
    setSession(data);
    await loadProfile();
    onAuthReady();
  } catch(e) {
    authError(e.message.includes('Invalid login') ? 'Invalid email or password.' : e.message);
  } finally { setAuthLoading(false); }
}

// ── REGISTER ──────────────────────────────────
async function doRegister() {
  const email = document.getElementById('authEmail').value.trim();
  const pass = document.getElementById('authPass').value;
  const name = document.getElementById('authName').value.trim();
  const company = document.getElementById('authCompany').value.trim();
  if (!email || !pass || !name) { authError('Name, email and password are required.'); return; }
  if (pass.length < 6) { authError('Password must be at least 6 characters.'); return; }
  setAuthLoading(true);
  try {
    // Step 1: Sign up
    const signupData = await SB.auth('POST', '/signup', {
      email, password: pass,
      options: { emailRedirectTo: window.location.href }
    });

    // Step 2: Try to get a session — may need email confirmation
    const token = signupData?.session?.access_token || signupData?.access_token;
    const user = signupData?.user;

    if (!user) throw new Error('Signup failed — no user returned.');

    if (!token) {
      // Email confirmation required
      authError('');
      document.getElementById('authError').style.color = 'var(--green)';
      document.getElementById('authError').textContent = 'Account created! Check your email to confirm, then sign in.';
      setAuthMode('login');
      setAuthLoading(false);
      return;
    }

    // Step 3: Set session and create profile
    AuthState.token = token;
    AuthState.user = user;
    const refreshToken = signupData?.session?.refresh_token || signupData?.refresh_token;
    Session.set({ access_token: token, refresh_token: refreshToken });

    // Step 4: Create profile row
    try {
      await SB.db('POST', '/profiles', {
        user_id: user.id,
        full_name: name,
        company_name: company || null,
      }, token);
    } catch(profileErr) {
      // Profile creation failed but auth succeeded — not fatal
      console.warn('Profile creation failed:', profileErr.message);
    }

    await loadProfile();
    onAuthReady();
  } catch(e) {
    authError(e.message.includes('already registered') ? 'This email is already registered. Try signing in.' : e.message);
  } finally { setAuthLoading(false); }
}

// ── LOGOUT ───────────────────────────────────
function doLogout() {
  Session.clear();
  AuthState = { user: null, token: null, profile: null };
  document.getElementById('appShell').style.display = 'none';
  showAuthModal('login');
}

// ── MODAL UI ─────────────────────────────────
function showAuthModal(mode) {
  document.getElementById('authModal').style.display = 'flex';
  document.getElementById('appShell').style.display = 'none';
  setAuthMode(mode);
}

function setAuthMode(mode) {
  const isLogin = mode === 'login';
  document.getElementById('authTitle').textContent = isLogin ? 'Sign In' : 'Create Account';
  document.getElementById('authNameRow').style.display = isLogin ? 'none' : 'block';
  document.getElementById('authCompanyRow').style.display = isLogin ? 'none' : 'block';
  document.getElementById('authSubmitBtn').textContent = isLogin ? 'Sign In' : 'Create Account';
  document.getElementById('authToggleLink').textContent = isLogin ? "Don't have an account? Register" : 'Already have an account? Sign In';
  document.getElementById('authToggleLink').onclick = (e) => { e.preventDefault(); setAuthMode(isLogin ? 'register' : 'login'); };
  document.getElementById('authError').textContent = '';
  document.getElementById('authError').style.color = 'var(--red)';
  document.getElementById('authModal').dataset.mode = mode;
}

function authError(msg) {
  const el = document.getElementById('authError');
  el.style.color = 'var(--red)';
  el.textContent = msg;
}

function setAuthLoading(v) {
  const btn = document.getElementById('authSubmitBtn');
  btn.disabled = v;
  if (v) btn.textContent = 'Please wait…';
  else btn.textContent = document.getElementById('authModal').dataset.mode === 'login' ? 'Sign In' : 'Create Account';
}

function handleAuthSubmit() {
  if (document.getElementById('authModal').dataset.mode === 'login') doLogin();
  else doRegister();
}

// ── SAVED LOADINGS ────────────────────────────
async function saveCurrentLoading() {
  if (!AppState.chosenAlgo) { toast('No result to save.', 'error'); return; }
  if (!AuthState.token) { toast('Please sign in to save.', 'error'); return; }

  const masterRef = document.getElementById('masterRef').value || 'AUTO';
  const eq = AppState.chosenAlgo.containers[0]?.eq;
  const totW = AppState.chosenAlgo.containers.reduce((s,c)=>s+c.loadedWeight,0);
  const totCBM = AppState.chosenAlgo.containers.reduce((s,c)=>s+c.loadedCBM,0);

  const payload = {
    user_id: AuthState.user.id,
    master_ref: masterRef,
    equipment_type: currentEquipType,
    equipment_id: eq?.id || 'CUSTOM',
    equipment_name: eq?.name || 'Custom',
    algorithm: AppState.chosenAlgo.algorithm,
    cargo_items: AppState.items,
    result_summary: {
      totalContainers: AppState.chosenAlgo.totalContainers,
      avgUtilization: AppState.chosenAlgo.avgUtilization,
      totalWeight: totW,
      totalCBM: totCBM,
    },
    result_full: AppState.chosenAlgo,
    notes: '',
  };

  try {
    await SB.db('POST', '/loadings', payload, AuthState.token);
    toast(`"${masterRef}" saved successfully.`, 'success');
    loadSavedLoadings();
  } catch(e) {
    toast('Save failed: ' + e.message, 'error');
  }
}

async function loadSavedLoadings() {
  if (!AuthState.token) return;
  try {
    const rows = await SB.db('GET',
      `/loadings?user_id=eq.${AuthState.user.id}&order=created_at.desc&select=id,master_ref,equipment_name,algorithm,result_summary,created_at,notes`,
      null, AuthState.token);
    renderSavedList(Array.isArray(rows) ? rows : []);
  } catch(e) { console.error('Load saved failed:', e); }
}

function renderSavedList(rows) {
  const el = document.getElementById('savedList');
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = `<div class="saved-empty">No saved loadings yet.<br>Run a calculation and click <strong>Save</strong>.</div>`;
    return;
  }
  el.innerHTML = rows.map(r => {
    const s = r.result_summary || {};
    const d = new Date(r.created_at).toLocaleDateString();
    const totW = typeof s === 'string' ? JSON.parse(s).totalWeight : s.totalWeight;
    const totCBM = typeof s === 'string' ? JSON.parse(s).totalCBM : s.totalCBM;
    const ctrs = typeof s === 'string' ? JSON.parse(s).totalContainers : s.totalContainers;
    const util = typeof s === 'string' ? JSON.parse(s).avgUtilization : s.avgUtilization;
    return `<div class="saved-row" id="saved-${r.id}">
      <div class="saved-info" onclick="openSavedLoading('${r.id}')">
        <div class="saved-ref">${r.master_ref}</div>
        <div class="saved-meta">${r.equipment_name || ''} · ${r.algorithm || ''} · ${ctrs || '?'} CTR · ${parseFloat(util||0).toFixed(1)}% util</div>
        <div class="saved-meta">${d} · ${parseFloat(totW||0).toFixed(0)}kg · ${parseFloat(totCBM||0).toFixed(2)}m³</div>
        ${r.notes ? `<div class="saved-notes">${r.notes}</div>` : ''}
      </div>
      <div class="saved-actions">
        <button class="saved-btn" onclick="copySavedLoading('${r.id}')" title="Copy">⎘</button>
        <button class="saved-btn saved-btn-del" onclick="deleteSavedLoading('${r.id}')" title="Delete">✕</button>
      </div>
    </div>`;
  }).join('');
}

async function openSavedLoading(id) {
  try {
    const rows = await SB.db('GET', `/loadings?id=eq.${id}&select=*`, null, AuthState.token);
    const row = rows[0]; if (!row) return;

    AppState.items = Array.isArray(row.cargo_items) ? row.cargo_items : JSON.parse(row.cargo_items || '[]');
    renderItemList();

    const eqType = row.equipment_type || 'sea';
    const tabs = document.querySelectorAll('.equip-tab');
    const typeMap = ['auto','air','sea','truck','custom'];
    const tabIdx = typeMap.indexOf(eqType);
    if (tabIdx >= 0 && tabs[tabIdx]) setEquipType(eqType, tabs[tabIdx]);

    document.getElementById('masterRef').value = row.master_ref;

    const result = typeof row.result_full === 'string' ? JSON.parse(row.result_full) : row.result_full;
    if (result) {
      AppState.results = [result];
      AppState.chosenAlgo = result;
      document.getElementById('nav-results').style.display = '';
      document.getElementById('nav-guided').style.display = '';
      showPage('results');
      renderAlgoComparison([result], result.containers[0]?.eq, null);
      chooseAlgorithm(0, false);
    } else {
      showPage('input');
    }
    toggleSavedPanel(false);
    toast(`Opened: ${row.master_ref}`, 'success');
  } catch(e) { toast('Failed to open: ' + e.message, 'error'); }
}

async function copySavedLoading(id) {
  try {
    const rows = await SB.db('GET', `/loadings?id=eq.${id}&select=*`, null, AuthState.token);
    const row = rows[0]; if (!row) return;
    const newRef = row.master_ref + '-COPY';
    await SB.db('POST', '/loadings', {
      user_id: AuthState.user.id,
      master_ref: newRef,
      equipment_type: row.equipment_type,
      equipment_id: row.equipment_id,
      equipment_name: row.equipment_name,
      algorithm: row.algorithm,
      cargo_items: row.cargo_items,
      result_summary: row.result_summary,
      result_full: row.result_full,
      notes: row.notes || '',
    }, AuthState.token);
    toast(`Copied as "${newRef}"`, 'success');
    loadSavedLoadings();
  } catch(e) { toast('Copy failed: ' + e.message, 'error'); }
}

async function deleteSavedLoading(id) {
  if (!confirm('Delete this saved loading? This cannot be undone.')) return;
  try {
    await SB.db('DELETE', `/loadings?id=eq.${id}`, null, AuthState.token);
    document.getElementById(`saved-${id}`)?.remove();
    toast('Deleted.', 'success');
  } catch(e) { toast('Delete failed: ' + e.message, 'error'); }
}

function toggleSavedPanel(force) {
  const panel = document.getElementById('savedPanel');
  const show = force !== undefined ? force : panel.style.display === 'none';
  panel.style.display = show ? 'flex' : 'none';
  if (show) loadSavedLoadings();
}
