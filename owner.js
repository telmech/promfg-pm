let ownerToken = localStorage.getItem('ownerToken');
let metrics = {};
let organizations = [];
let plans = [];

document.addEventListener('DOMContentLoaded', () => {
  if (ownerToken) {
    showApp();
    loadDashboard();
  }

  // Navigation
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
      e.target.classList.add('active');
      
      const targetId = e.target.getAttribute('data-target');
      document.querySelectorAll('.viewport-section').forEach(sec => sec.classList.add('hidden'));
      document.getElementById(targetId).classList.remove('hidden');
      
      document.getElementById('header-title').textContent = e.target.textContent;
    });
  });

  // Login
  document.getElementById('owner-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('owner-email').value;
    const password = document.getElementById('owner-password').value;
    
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.user.role !== 'owner') throw new Error('Access restricted to Platform Owners.');
      
      ownerToken = data.token;
      localStorage.setItem('ownerToken', ownerToken);
      showApp();
      loadDashboard();
    } catch (err) {
      const errorMsg = document.getElementById('owner-login-error');
      errorMsg.textContent = err.message;
      errorMsg.classList.remove('hidden');
    }
  });

  document.getElementById('btn-owner-logout').addEventListener('click', () => {
    localStorage.removeItem('ownerToken');
    window.location.reload();
  });
});

function showApp() {
  document.getElementById('login-container').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  document.getElementById('login-container').classList.remove('active');
}

async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = { 'Authorization': \`Bearer \${ownerToken}\` };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  
  const res = await fetch(endpoint, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });
  
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('ownerToken');
    window.location.reload();
  }
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API Error');
  return data;
}

async function loadDashboard() {
  try {
    metrics = await apiCall('/api/owner/metrics');
    organizations = await apiCall('/api/owner/organizations');
    plans = await apiCall('/api/owner/plans');
    
    document.getElementById('metric-mrr').textContent = '$' + metrics.mrr;
    document.getElementById('metric-arr').textContent = '$' + metrics.arr;
    document.getElementById('metric-orgs').textContent = metrics.activeOrgs;
    document.getElementById('metric-users').textContent = metrics.activeUsers;

    renderOrganizations();
    renderPlans();
  } catch (err) {
    alert(err.message);
  }
}

function renderOrganizations() {
  const tbody = document.getElementById('org-table-body');
  tbody.innerHTML = '';
  
  organizations.forEach(org => {
    const tr = document.createElement('tr');
    tr.innerHTML = \`
      <td style="font-family:monospace; font-size:0.8rem;">\${org.id}</td>
      <td><strong>\${org.name}</strong></td>
      <td><span class="badge badge-outline">\${org.plan}</span></td>
      <td>$\${org.mrr || 0}</td>
      <td><span class="status-pill status-\${org.status === 'active' ? 'done' : 'todo'}">\${org.status}</span></td>
      <td>\${org.trialEndsAt ? new Date(org.trialEndsAt).toLocaleDateString() : 'N/A'}</td>
      <td class="org-actions">
        <button class="btn btn-secondary btn-sm btn-suspend" data-id="\${org.id}">\${org.status === 'active' ? 'Suspend' : 'Reactivate'}</button>
        <button class="btn btn-impersonate btn-sm" data-id="\${org.id}">Impersonate</button>
      </td>
    \`;
    
    tr.querySelector('.btn-suspend').addEventListener('click', async () => {
      const newStatus = org.status === 'active' ? 'suspended' : 'active';
      if (!confirm(\`Are you sure you want to \${newStatus} \${org.name}?\`)) return;
      try {
        await apiCall(\`/api/owner/organizations/\${org.id}\`, 'PUT', { status: newStatus });
        loadDashboard();
      } catch (err) {
        alert(err.message);
      }
    });

    tr.querySelector('.btn-impersonate').addEventListener('click', async () => {
      if (!confirm(\`Login as an administrator of \${org.name}? This action will be logged.\`)) return;
      try {
        const data = await apiCall(\`/api/owner/impersonate/\${org.id}\`, 'POST');
        // Set the standard token so the main app picks it up
        localStorage.setItem('token', data.token);
        // Open the main app in a new tab
        window.open('/', '_blank');
      } catch (err) {
        alert(err.message);
      }
    });

    tbody.appendChild(tr);
  });
}

function renderPlans() {
  const tbody = document.getElementById('plans-table-body');
  tbody.innerHTML = '';
  
  plans.forEach(plan => {
    const tr = document.createElement('tr');
    tr.innerHTML = \`
      <td><strong>\${plan.name}</strong></td>
      <td>$\${plan.price}</td>
      <td>\${plan.maxUsers} Users</td>
      <td style="font-size:0.8rem;">\${plan.features.join(', ')}</td>
    \`;
    tbody.appendChild(tr);
  });
}
