/* =============================================
   auth.js — Supabase Auth + Saved Loadings
   ============================================= */

'use strict';

const SUPABASE_URL = 'https://kxybwmmkqcdnwemtrxzq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_B8xnwHjMoOCtxByuxUkb2A_9UL9xFLy';

// ── SUPABASE CLIENT (lightweight, no SDK needed) ──
const SB = {
  async req(method, path, body = null, token = null) {
    const headers = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.message || data.msg || 'Request failed');
    return data;
  },

  async authReq(method, path, body) {
    return this.req(method, `/auth/v1${path}`, body);
  },

  async dbReq(method, path, body = null, token) {
    return this.req(method, `/rest/v1${path}`, body, token);
  },
};

// ── SESSION STORAGE ──
const Session = {
  get() {
    try { return JSON.parse(localStorage.getItem('al3d_session')); } catch { return null; }
  },
  set(s) { localStorage.setItem('al3d_session', JSON.stringify(s)); },
  clear() { localStorage.removeItem('al3d_session'); },
};

// ── AUTH STATE ──
let AuthState = { user: null, token: null, profile: null };

async function initAuth() {
  const s = Session.get();
  if (!s) return showAuthModal('login');

  try {
    // Refresh session
    const data = await SB.authReq('POST', '/token?grant_type=refresh_token', {
      refresh_token: s.refresh_token,
    });
    AuthState.token = data.access_token;
    AuthState.user = data.user;
    Session.set({ access_token: data.access_token, refresh_token: data.refresh_token });
    await loadProfile();
    onAuthReady();
  } catch {
    Session.clear();
    showAuthModal('login');
  }
}

async function loadProfile() {
  try {
    const rows = await SB.dbReq('GET',
      `/profiles?user_id=eq.${AuthState.user.id}&select=*`,
      null, AuthState.token);
    AuthState.profile = rows[0] || null;
  } catch { AuthState.profile = null; }
}

function onAuthReady() {
  document.getElementById('authModal').style.display = 'none';
  document.getElementById('appShell').style.display = 'block';
  updateUserBadge();
  loadSavedLoadings();
}

function updateUserBadge() {
  const name = AuthState.profile?.full_name || AuthState.user?.email || '';
  const company = AuthState.profile?.company_name || '';
  document.getElementById('userBadge').textContent = company ? `${name} · ${company}` : name;
}

// ── LOGIN ──
async function doLogin() {
  const email = document.getElementById('authEmail').value.trim();
  const pass = document.getElementById('authPass').value;
  if (!email || !pass) { authError('Enter email and password.'); return; }
  setAuthLoading(true);
  try {
    const data = await SB.authReq('POST', '/token?grant_type=password', {
      email, password: pass,
    });
    AuthState.token = data.access_token;
    AuthState.user = data.user;
    Session.set({ access_token: data.access_token, refresh_token: data.refresh_token });
    await loadProfile();
    onAuthReady();
  } catch(e) {
    authError(e.message);
  } finally { setAuthLoading(false); }
}

// ── REGISTER ──
async function doRegister() {
  const email = document.getElementById('authEmail').value.trim();
  const pass = document.getElementById('authPass').value;
  const name = document.getElementById('authName').value.trim();
  const company = document.getElementById('authCompany').value.trim();
  if (!email || !pass || !name) { authError('Name, email and password required.'); return; }
  if (pass.length < 6) { authError('Password must be at least 6 characters.'); return; }
  setAuthLoading(true);
  try {
    // Sign up
    const data = await SB.authReq('POST', '/signup', { email, password: pass });
    AuthState.token = data.access_token;
    AuthState.user = data.user;
    Session.set({ access_token: data.access_token, refresh_token: data.refresh_token });
    // Create profile
    await SB.dbReq('POST', '/profiles', {
      user_id: AuthState.user.id,
      full_name: name,
      company_name: company || null,
    }, AuthState.token);
    await loadProfile();
    onAuthReady();
  } catch(e) {
    authError(e.message);
  } finally { setAuthLoading(false); }
}

// ── LOGOUT ──
function doLogout() {
  Session.clear();
  AuthState = { user: null, token: null, profile: null };
  document.getElementById('appShell').style.display = 'none';
  showAuthModal('login');
}

// ── MODAL UI ──
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
  document.getElementById('authToggleLink').onclick = () => setAuthMode(isLogin ? 'register' : 'login');
  document.getElementById('authError').textContent = '';
  document.getElementById('authModal').dataset.mode = mode;
}

function authError(msg) {
  document.getElementById('authError').textContent = msg;
}

function setAuthLoading(v) {
  document.getElementById('authSubmitBtn').disabled = v;
  document.getElementById('authSubmitBtn').textContent = v ? 'Please wait…' :
    (document.getElementById('authModal').dataset.mode === 'login' ? 'Sign In' : 'Create Account');
}

function handleAuthSubmit() {
  if (document.getElementById('authModal').dataset.mode === 'login') doLogin();
  else doRegister();
}

// ── SAVED LOADINGS ──
async function saveCurrentLoading() {
  if (!AppState.chosenAlgo) { toast('No result to save.', 'error'); return; }
  if (!AuthState.token) { toast('Please sign in to save.', 'error'); return; }

  const masterRef = document.getElementById('masterRef').value || 'AUTO';
  const eq = AppState.chosenAlgo.containers[0]?.eq;

  const payload = {
    user_id: AuthState.user.id,
    master_ref: masterRef,
    equipment_type: currentEquipType,
    equipment_id: eq?.id || 'CUSTOM',
    equipment_name: eq?.name || 'Custom',
    algorithm: AppState.chosenAlgo.algorithm,
    cargo_items: JSON.stringify(AppState.items),
    result_summary: JSON.stringify({
      totalContainers: AppState.chosenAlgo.totalContainers,
      avgUtilization: AppState.chosenAlgo.avgUtilization,
      totalWeight: AppState.chosenAlgo.containers.reduce((s,c)=>s+c.loadedWeight,0),
      totalCBM: AppState.chosenAlgo.containers.reduce((s,c)=>s+c.loadedCBM,0),
    }),
    result_full: JSON.stringify(AppState.chosenAlgo),
    notes: '',
  };

  try {
    await SB.dbReq('POST', '/loadings', payload, AuthState.token);
    toast(`Loading "${masterRef}" saved.`, 'success');
    loadSavedLoadings();
  } catch(e) {
    toast('Save failed: ' + e.message, 'error');
  }
}

async function loadSavedLoadings() {
  if (!AuthState.token) return;
  try {
    const rows = await SB.dbReq('GET',
      `/loadings?user_id=eq.${AuthState.user.id}&order=created_at.desc&select=id,master_ref,equipment_name,algorithm,result_summary,created_at,notes`,
      null, AuthState.token);
    renderSavedList(rows);
  } catch(e) {
    console.error('Failed to load saved loadings:', e);
  }
}

function renderSavedList(rows) {
  const el = document.getElementById('savedList');
  if (!el) return;
  if (!rows || rows.length === 0) {
    el.innerHTML = `<div class="saved-empty">No saved loadings yet. Run a calculation and click Save.</div>`;
    return;
  }
  el.innerHTML = rows.map(r => {
    const s = JSON.parse(r.result_summary || '{}');
    const d = new Date(r.created_at).toLocaleDateString();
    return `<div class="saved-row" id="saved-${r.id}">
      <div class="saved-info" onclick="openSavedLoading('${r.id}')">
        <div class="saved-ref">${r.master_ref}</div>
        <div class="saved-meta">${r.equipment_name} · ${r.algorithm} · ${s.totalContainers || '?'} CTR · ${parseFloat(s.avgUtilization||0).toFixed(1)}% util</div>
        <div class="saved-meta">${d} · ${(s.totalWeight||0).toFixed(0)}kg · ${(s.totalCBM||0).toFixed(2)}m³</div>
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
    const rows = await SB.dbReq('GET',
      `/loadings?id=eq.${id}&select=*`,
      null, AuthState.token);
    const row = rows[0];
    if (!row) return;

    // Restore items
    AppState.items = JSON.parse(row.cargo_items || '[]');
    renderItemList();

    // Restore equipment type
    const eqType = row.equipment_type || 'sea';
    const btn = document.querySelector(`.equip-tab:nth-child(${['auto','air','sea','truck','custom'].indexOf(eqType)+1})`);
    if (btn) setEquipType(eqType, btn);

    // Restore master ref
    document.getElementById('masterRef').value = row.master_ref;

    // Restore result
    const result = JSON.parse(row.result_full || 'null');
    if (result) {
      // Reconstruct containers properly
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
    toast(`Loaded: ${row.master_ref}`, 'success');
  } catch(e) {
    toast('Failed to open: ' + e.message, 'error');
  }
}

async function copySavedLoading(id) {
  try {
    const rows = await SB.dbReq('GET', `/loadings?id=eq.${id}&select=*`, null, AuthState.token);
    const row = rows[0]; if (!row) return;
    const d = new Date();
    const newRef = row.master_ref + '-COPY';
    await SB.dbReq('POST', '/loadings', {
      user_id: AuthState.user.id,
      master_ref: newRef,
      equipment_type: row.equipment_type,
      equipment_id: row.equipment_id,
      equipment_name: row.equipment_name,
      algorithm: row.algorithm,
      cargo_items: row.cargo_items,
      result_summary: row.result_summary,
      result_full: row.result_full,
      notes: row.notes,
    }, AuthState.token);
    toast(`Copied as "${newRef}"`, 'success');
    loadSavedLoadings();
  } catch(e) {
    toast('Copy failed: ' + e.message, 'error');
  }
}

async function deleteSavedLoading(id) {
  if (!confirm('Delete this saved loading?')) return;
  try {
    await SB.dbReq('DELETE', `/loadings?id=eq.${id}`, null, AuthState.token);
    document.getElementById(`saved-${id}`)?.remove();
    toast('Deleted.', 'success');
  } catch(e) {
    toast('Delete failed: ' + e.message, 'error');
  }
}

function toggleSavedPanel(force) {
  const panel = document.getElementById('savedPanel');
  const isVisible = panel.style.display !== 'none';
  const show = force !== undefined ? force : !isVisible;
  panel.style.display = show ? 'flex' : 'none';
  if (show) loadSavedLoadings();
}
