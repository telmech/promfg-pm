// ==================== APP STATE & CONFIG ====================
const state = {
  token: localStorage.getItem('pm_token') || '',
  currentUser: null,
  users: [],
  projects: [],
  tasks: [],
  notifications: [],
  departments: [],
  settings: { companyName: 'PRO-MFG', companyLogo: '' },
  currentView: 'dashboard',
  selectedTaskId: null,
  theme: localStorage.getItem('pm_theme') || 'light'
};

const API_BASE = '';
let signupEmail = ''; // Stores signup email temporarily during OTP check

const DEFAULT_TIMELINE_STAGES = [
  { name: 'Kick off', startDate: '', endDate: '', duration: 0, progress: 0 },
  { name: 'Ideation', startDate: '', endDate: '', duration: 0, progress: 0 },
  { name: 'Design', startDate: '', endDate: '', duration: 0, progress: 0 },
  { name: 'Purchase Manufacturing', startDate: '', endDate: '', duration: 0, progress: 0 },
  { name: 'Purchase BOP', startDate: '', endDate: '', duration: 0, progress: 0 },
  { name: 'Fabrication', startDate: '', endDate: '', duration: 0, progress: 0 },
  { name: 'Manufacturing', startDate: '', endDate: '', duration: 0, progress: 0 },
  { name: 'Surface Treatment', startDate: '', endDate: '', duration: 0, progress: 0 },
  { name: 'Assembly', startDate: '', endDate: '', duration: 0, progress: 0 },
  { name: 'Programming', startDate: '', endDate: '', duration: 0, progress: 0 },
  { name: 'Dry Run', startDate: '', endDate: '', duration: 0, progress: 0 },
  { name: 'Trial', startDate: '', endDate: '', duration: 0, progress: 0 },
  { name: 'MQ1', startDate: '', endDate: '', duration: 0, progress: 0 }
];

// ==================== INITIALIZATION ====================

// Helper helpers for BOM Supplier Comparison
function getWinningPrice(item) {
  if (item.winner === 'Supplier A') return parseFloat(item.supplierA_price) || 0;
  if (item.winner === 'Supplier B') return parseFloat(item.supplierB_price) || 0;
  if (item.winner === 'Supplier C') return parseFloat(item.supplierC_price) || 0;
  return 0;
}

function getWinnerName(item) {
  if (item.winner === 'Supplier A') return item.supplierA_name || 'Supplier A';
  if (item.winner === 'Supplier B') return item.supplierB_name || 'Supplier B';
  if (item.winner === 'Supplier C') return item.supplierC_name || 'Supplier C';
  return 'None';
}

function getWinnerPrice(item) {
  return getWinningPrice(item);
}

function getWinnerDelivery(item) {
  if (item.winner === 'Supplier A') return item.supplierA_leadTime || '—';
  if (item.winner === 'Supplier B') return item.supplierB_leadTime || '—';
  if (item.winner === 'Supplier C') return item.supplierC_leadTime || '—';
  return '—';
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupEventListeners();
  initReportControls();
  
  // Load global settings on start (no auth required) - removed for multi-tenant
  
  if (state.token) {
    verifyTokenAndStart();
  } else {
    showLogin();
  }
});

// Theme setup
function initTheme() {
  document.body.className = state.theme === 'dark' ? 'dark-theme' : 'light-theme';
  updateThemeIcon();
}

// Update Theme Icon visibility
function updateThemeIcon() {
  const darkIcon = document.getElementById('theme-icon-dark');
  const lightIcon = document.getElementById('theme-icon-light');
  if (state.theme === 'dark') {
    darkIcon.classList.remove('hidden');
    lightIcon.classList.add('hidden');
  } else {
    darkIcon.classList.add('hidden');
    lightIcon.classList.remove('hidden');
  }
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('pm_theme', state.theme);
  initTheme();
}

// Router and view transitions
function navigateTo(viewId) {
  state.currentView = viewId;
  
  // Hide all sections
  document.querySelectorAll('.viewport-section').forEach(section => {
    section.classList.add('hidden');
  });
  
  // Show target section
  const targetSection = document.getElementById(`view-${viewId}`);
  if (targetSection) {
    targetSection.classList.remove('hidden');
  }
  
  // Update view title
  const titleMap = {
    'portal': 'Enterprise Module Portal',
    'dashboard': 'Dashboard',
    'projects': 'Projects',
    'tasks': 'Task Board',
    'team': 'Team Management',
    'rfq': 'RFQ Tracking',
    'bom': 'BOM Tracking',
    'reports': 'Reports & Analytics'
  };
  document.getElementById('view-title').textContent = titleMap[viewId] || 'Project & Task Manager';
  
  // Update active navigation link (both desktop sidebar and mobile bottom bar)
  document.querySelectorAll('.nav-link, .mobile-nav-item').forEach(link => {
    if (link.getAttribute('data-target') === `view-${viewId}`) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Fetch relevant view data
  fetchViewData(viewId);
}

// Fetch data depending on active view
async function fetchViewData(viewId) {
  try {
    if (viewId === 'portal') {
      await fetchSettings();
      renderPortal();
    } else if (viewId === 'dashboard') {
      await Promise.all([fetchProjects(), fetchTasks(), fetchNotifications()]);
      renderDashboard();
    } else if (viewId === 'projects') {
      await fetchProjects();
      renderProjects();
    } else if (viewId === 'tasks') {
      await Promise.all([fetchProjects(), fetchTasks(), fetchUsers(), fetchDepartments()]);
      
      const selectFilter = document.getElementById('board-project-filter');
      const currentSelected = selectFilter.value || 'all';
      
      renderKanbanBoard();
      handleProjectFilterChange(currentSelected);
    } else if (viewId === 'team') {
      await Promise.all([fetchUsers(), fetchDepartments(), fetchSettings()]);
      renderTeam();
    } else if (viewId === 'rfq') {
      await Promise.all([fetchUsers(), fetchRFQs()]);
      renderRFQDashboard();
      renderRFQTable();
      renderRFQCharts();
    } else if (viewId === 'bom') {
      await fetchProjects();
      populateBOMProjectDropdown();
      const projSelect = document.getElementById('bom-project-select');
      if (projSelect && projSelect.value) {
        await fetchBOMItems(projSelect.value);
      } else {
        state.bomItems = [];
      }
      renderBOMDashboard();
      renderBOMTable();
    } else if (viewId === 'reports') {
      await Promise.all([fetchUsers(), fetchProjects(), fetchTasks()]);
      renderReports();
    } else if (viewId === 'pr') {
      await Promise.all([fetchProjects(), fetchPRs()]);
      renderPRDashboard();
      renderPRTable();
    }
  } catch (err) {
    console.error('Failed to load data for view:', viewId, err);
  }
}

// ==================== API CLIENT ====================
async function apiCall(endpoint, method = 'GET', body = null, isFormData = false) {
  const headers = {};
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  
  if (body && !isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const options = {
    method,
    headers
  };

  if (body) {
    options.body = isFormData ? body : JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${endpoint}`, options);
  
  let data = null;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch (e) {
      // ignore parse error
    }
  }
  
  if (res.status === 401 || res.status === 403) {
    if (data && data.error && (data.error.includes('expired') || data.error.includes('token') || data.error.includes('deactivated'))) {
      alert(data.error || 'Session expired. Please log in again.');
      logout();
      throw new Error('Authentication expired');
    }
  }

  if (!res.ok) {
    const errorMsg = (data && data.error) ? data.error : `Request failed with status ${res.status}`;
    throw new Error(errorMsg);
  }

  return data;
}

// ==================== AUTHENTICATION FLOW ====================
async function verifyTokenAndStart() {
  try {
    const data = await apiCall('/api/auth/me');
    state.currentUser = data;
    await fetchSettings();
    showApp();
    initSocket();
    navigateTo('portal');
    
    // Subscription Trial Check
    const activePlans = ['Pro Plan', 'Starter', 'Growth', 'Business', 'Enterprise'];
    if (!activePlans.includes(state.currentUser.plan) && state.currentUser.trialEndsAt) {
      if (new Date(state.currentUser.trialEndsAt) < new Date()) {
        alert('Your 14-Day Free Trial has expired. Please upgrade your plan to continue using the application.');
        const btnBilling = document.getElementById('btn-billing');
        if (btnBilling) btnBilling.click();
      }
    }

    // Check due dates once on login
    apiCall('/api/notifications/check-due-dates', 'POST').catch(console.error);
    
    // Start notifications polling every 30s
    setInterval(() => {
      if (state.token) {
        fetchNotifications().then(renderNotifications).catch(console.error);
      }
    }, 30000);

  } catch (err) {
    console.error('Token validation failed, directing to login page', err);
    logout();
  }
}

async function showLogin() {
  document.getElementById('login-container').classList.remove('hidden');
  document.getElementById('app-container').classList.add('hidden');
  
  // Show login card, hide signup/otp cards
  document.getElementById('login-card').classList.remove('hidden');
  document.getElementById('signup-card').classList.add('hidden');
  document.getElementById('otp-card').classList.add('hidden');

  // Load department choices for signup
  try {
    const res = await fetch(`${API_BASE}/api/departments/default`);
    const depts = await res.json();
    const signupDept = document.getElementById('signup-dept');
    if (signupDept) {
      signupDept.innerHTML = '';
      depts.forEach(d => {
        signupDept.innerHTML += `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`;
      });
    }
  } catch (err) {
    console.error('Failed to load departments', err);
  }
}

function showApp() {
  document.getElementById('login-container').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  
  const initials = state.currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  document.getElementById('user-avatar-initials').textContent = initials;
  document.getElementById('user-display-name').textContent = state.currentUser.name;
  document.getElementById('user-display-role').textContent = formatRoleTitle(state.currentUser.role);
  
  const userDisp = document.getElementById('header-user-display');
  if (userDisp && state.currentUser) {
    userDisp.textContent = `${state.currentUser.name} (${formatRoleTitle(state.currentUser.role)})`;
  }
  
  const role = state.currentUser.role;
  const isOwner = (role === 'owner');
  const isAdmin = (role === 'admin' || isOwner || role === 'superadmin');
  const isPM = (role === 'project_manager');
  const isDeptHead = (role === 'department_head');
  const isManager = (isAdmin || isPM || isDeptHead);

  // Hide/Show Admin features (Super Admin / Admin only)
  if (isAdmin) {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  } else {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
  }

  // Hide/Show Admin+PM features (Super Admin / Admin / Project Manager)
  if (isManager) {
    document.querySelectorAll('.admin-pm-only').forEach(el => el.classList.remove('hidden'));
  } else {
    document.querySelectorAll('.admin-pm-only').forEach(el => el.classList.add('hidden'));
  }

  // Hide/Show Projects based on permissions
  const hasProjects = isAdmin || !state.currentUser.permissions || state.currentUser.permissions.projects === true;
  if (hasProjects) {
    document.querySelectorAll('.project-access-only').forEach(el => el.classList.remove('hidden'));
  } else {
    document.querySelectorAll('.project-access-only').forEach(el => el.classList.add('hidden'));
  }

  // Hide/Show trial banner dynamically
  const trialBanner = document.getElementById('trial-sidebar-banner');
  if (trialBanner) {
    const activePlans = ['Starter', 'Growth', 'Business', 'Enterprise', 'Pro Plan'];
    if (!activePlans.includes(state.currentUser.plan) && state.currentUser.trialEndsAt) {
      trialBanner.style.display = 'block';
      const diff = new Date(state.currentUser.trialEndsAt) - new Date();
      const daysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
      document.getElementById('trial-days-badge').textContent = `${daysLeft} days left`;
    } else {
      trialBanner.style.display = 'none';
    }
  }

  // Hide/Show BOM based on permissions & plan
  const plan = state.currentUser.plan || 'Free Trial';
  const planAllowsBOM = (plan === 'Growth' || plan === 'Business' || plan === 'Enterprise' || plan === 'Pro Plan' || plan === 'Free Trial');
  const hasBOM = planAllowsBOM && (isAdmin || (state.currentUser.permissions && state.currentUser.permissions.bom === true));
  if (hasBOM) {
    document.querySelectorAll('.purchasing-admin-only').forEach(el => el.classList.remove('hidden'));
  } else {
    document.querySelectorAll('.purchasing-admin-only').forEach(el => el.classList.add('hidden'));
  }

  // Hide/Show RFQ based on permissions & plan
  const planAllowsRFQ = (plan === 'Growth' || plan === 'Business' || plan === 'Enterprise' || plan === 'Pro Plan' || plan === 'Free Trial');
  const hasRFQ = planAllowsRFQ && (isAdmin || (state.currentUser.permissions && state.currentUser.permissions.rfq === true));
  if (hasRFQ) {
    document.querySelectorAll('.rfq-access-only').forEach(el => el.classList.remove('hidden'));
  } else {
    document.querySelectorAll('.rfq-access-only').forEach(el => el.classList.add('hidden'));
  }

  // Hide/Show PR based on permissions & plan
  const planAllowsPR = (plan === 'Business' || plan === 'Enterprise' || plan === 'Pro Plan' || plan === 'Free Trial');
  const hasPR = planAllowsPR && (isAdmin || (state.currentUser.permissions && state.currentUser.permissions.pr === true) || role === 'operations_head' || role === 'md' || state.currentUser.department === 'Purchasing');
  if (hasPR) {
    document.querySelectorAll('.pr-access-only').forEach(el => el.classList.remove('hidden'));
  } else {
    document.querySelectorAll('.pr-access-only').forEach(el => el.classList.add('hidden'));
  }

  // Hide/Show Super Admin settings panels (Branding, Departments manager)
  if (isAdmin) {
    document.querySelectorAll('.super-admin-only').forEach(el => el.classList.remove('hidden'));
  } else {
    document.querySelectorAll('.super-admin-only').forEach(el => el.classList.add('hidden'));
  }
}

function logout() {
  state.token = '';
  state.currentUser = null;
  localStorage.removeItem('pm_token');
  showLogin();
}

// ==================== DATA ACTIONS ====================
async function fetchUsers() {
  state.users = await apiCall('/api/users');
  return state.users;
}

async function fetchPRs() {
  state.prs = await apiCall('/api/prs');
  return state.prs;
}

async function fetchProjects() {
  state.projects = await apiCall('/api/projects');
  return state.projects;
}

async function fetchTasks() {
  state.tasks = await apiCall('/api/tasks');
  return state.tasks;
}

async function fetchNotifications() {
  state.notifications = await apiCall('/api/notifications');
  return state.notifications;
}

async function fetchDepartments() {
  state.departments = await apiCall('/api/departments');
  return state.departments;
}

async function fetchSettings() {
  const settings = await apiCall('/api/settings');
  state.settings = settings;
  applyBranding();
  return settings;
}

// Apply company name and company logo
function applyBranding() {
  const compName = state.settings.companyName || 'PRO-MFG';
  const logoFilename = state.settings.companyLogo;

  // Update browser tab title
  document.title = `${compName} — Project & Task Management`;

  // Sidebar header rebrand
  const sidebarTextEl = document.getElementById('company-name-sidebar-text');
  const sidebarLogoContainer = document.getElementById('company-logo-sidebar-container');
  
  if (logoFilename) {
    if (sidebarTextEl) sidebarTextEl.style.display = 'none';
    if (sidebarLogoContainer) {
      sidebarLogoContainer.style.maxWidth = '100%';
      sidebarLogoContainer.style.maxHeight = '100px';
      sidebarLogoContainer.style.width = '100%';
      sidebarLogoContainer.style.height = 'auto';
      sidebarLogoContainer.style.marginRight = '0';
      sidebarLogoContainer.style.display = 'block';
      sidebarLogoContainer.style.backgroundColor = '#ffffff';
      sidebarLogoContainer.style.padding = '8px 12px';
      sidebarLogoContainer.style.borderRadius = '6px';
      sidebarLogoContainer.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
      sidebarLogoContainer.innerHTML = `<img src="/uploads/${logoFilename}" class="company-logo-img" style="max-height: 80px; max-width: 100%; object-fit: contain; margin: 0 auto; border-radius: 0;" alt="${escapeHTML(compName)}">`;
    }
  } else {
    if (sidebarTextEl) {
      sidebarTextEl.style.display = 'inline';
      sidebarTextEl.textContent = compName;
    }
    if (sidebarLogoContainer) {
      sidebarLogoContainer.style.maxWidth = '';
      sidebarLogoContainer.style.maxHeight = '';
      sidebarLogoContainer.style.width = '';
      sidebarLogoContainer.style.height = '';
      sidebarLogoContainer.style.marginRight = '8px';
      sidebarLogoContainer.style.display = 'inline-block';
      sidebarLogoContainer.style.backgroundColor = '';
      sidebarLogoContainer.style.padding = '';
      sidebarLogoContainer.style.borderRadius = '';
      sidebarLogoContainer.style.boxShadow = '';
      sidebarLogoContainer.innerHTML = `<svg id="default-sidebar-logo-svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`;
    }
  }

  // Log in screen rebrand (Sign Up/OTP stay static PRO-MFG logo)
  document.querySelectorAll('.dynamic-name-login-text').forEach(el => {
    if (logoFilename) {
      el.style.display = 'none';
    } else {
      el.style.display = 'block';
      el.textContent = compName;
    }
  });

  document.querySelectorAll('.dynamic-logo-login-container').forEach(el => {
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    if (logoFilename) {
      el.style.maxWidth = '280px';
      el.style.maxHeight = '100px';
      el.style.width = '100%';
      el.style.height = 'auto';
      el.innerHTML = `<img src="/uploads/${logoFilename}" class="company-logo-img" style="max-height: 90px; max-width: 260px; object-fit: contain; border-radius: 0; display:block; margin: 0 auto;" alt="${escapeHTML(compName)}">`;
    } else {
      el.style.maxWidth = '100%';
      el.style.maxHeight = '80px';
      el.style.width = '100%';
      el.style.height = 'auto';
      el.innerHTML = `<img src="/logo.jpg" onerror="this.onerror=null; this.src='/uploads/logo.jpg';" class="company-logo-img" style="max-height: 80px; max-width: 220px; object-fit: contain; border-radius: 0; display:block; margin: 0 auto;" alt="${escapeHTML(compName)}">`;
    }
  });

  // Browser tab title
  document.title = `Project & Task Management • Powered by PRO-MFG`;
}

// ==================== RENDERING LOGIC ====================

// 1. Dashboard View
function renderDashboard() {
  const totalProj = state.projects.length;
  
  const role = state.currentUser.role;
  const isManager = (role === 'admin' || role === 'project_manager');
  
  const myTasks = state.tasks.filter(t => t.assigneeId === state.currentUser.id);
  const dashboardTasks = isManager ? state.tasks : myTasks;

  const todoTasks = dashboardTasks.filter(t => t.status === 'todo').length;
  const inProgressTasks = dashboardTasks.filter(t => t.status === 'inprogress').length;
  const doneTasks = dashboardTasks.filter(t => t.status === 'done').length;

  document.getElementById('stat-total-projects').textContent = totalProj;
  document.getElementById('stat-todo-tasks').textContent = todoTasks;
  document.getElementById('stat-inprogress-tasks').textContent = inProgressTasks;
  document.getElementById('stat-completed-tasks').textContent = doneTasks;

  const nowStr = new Date().toISOString().split('T')[0];
  const overdueTasks = myTasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < nowStr);
  
  const alertBanner = document.getElementById('dashboard-alert-banner');
  if (overdueTasks.length > 0) {
    alertBanner.classList.remove('hidden');
    document.getElementById('alert-banner-text').textContent = `Attention: You have ${overdueTasks.length} overdue task(s) assigned to you!`;
  } else {
    alertBanner.classList.add('hidden');
  }

  // Due Soon
  const myUpcoming = myTasks
    .filter(t => t.status !== 'done')
    .sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    })
    .slice(0, 5);

  const myUpcomingList = document.getElementById('my-urgent-tasks-list');
  myUpcomingList.innerHTML = '';
  
  if (myUpcoming.length === 0) {
    myUpcomingList.innerHTML = '<div class="empty-state">No upcoming tasks assigned. Good job!</div>';
  } else {
    myUpcoming.forEach(task => {
      const projName = state.projects.find(p => p.id === task.projectId)?.name || 'Unknown Project';
      const isOverdue = task.dueDate && task.dueDate < nowStr;
      
      const item = document.createElement('div');
      item.className = 'task-item-mini';
      item.innerHTML = `
        <div>
          <h4>${escapeHTML(task.title)}</h4>
          <p>${escapeHTML(projName)} • Due: <span class="${isOverdue ? 'overdue' : ''}">${task.dueDate || 'No Date'}</span></p>
        </div>
        <span class="priority-pill pill-${task.priority}">${task.priority}</span>
      `;
      item.addEventListener('click', () => openTaskDetailsModal(task.id));
      myUpcomingList.appendChild(item);
    });
  }

  // Workload Chart
  const chartContainer = document.getElementById('workload-chart-container');
  chartContainer.innerHTML = '';

  let usersToDisplay = [];
  if (isManager && state.users.length > 0) {
    usersToDisplay = state.users.filter(u => u.status === 'active');
  } else {
    const assigneeIds = [...new Set(state.tasks.map(t => t.assigneeId).filter(Boolean))];
    if (!assigneeIds.includes(state.currentUser.id)) assigneeIds.push(state.currentUser.id);
    
    const hardcodedNames = {
      'u1': 'Super Admin',
      'u4': 'System Admin',
      'u5': 'Project Manager',
      'u2': 'Alice Johnson',
      'u3': 'Bob Smith'
    };

    usersToDisplay = assigneeIds.map(id => {
      if (id === state.currentUser.id) return state.currentUser;
      return {
        id,
        name: hardcodedNames[id] || 'User ' + id,
        status: 'active'
      };
    });
  }

  if (usersToDisplay.length === 0) {
    chartContainer.innerHTML = '<div class="empty-state">No active team members.</div>';
  } else {
    const workloadList = document.createElement('div');
    workloadList.className = 'workload-list';
    
    usersToDisplay.forEach(user => {
      const userTasks = state.tasks.filter(t => t.assigneeId === user.id);
      const openCount = userTasks.filter(t => t.status !== 'done').length;
      const doneCount = userTasks.filter(t => t.status === 'done').length;
      const total = openCount + doneCount;
      
      const openPercent = total > 0 ? (openCount / total) * 100 : 0;
      const donePercent = total > 0 ? (doneCount / total) * 100 : 0;

      const row = document.createElement('div');
      row.className = 'workload-item';
      row.innerHTML = `
        <div class="workload-name-row">
          <span>${escapeHTML(user.name)}</span>
          <span>${openCount} open / ${doneCount} done</span>
        </div>
        <div class="workload-bar-wrapper">
          <div class="workload-open" style="width: ${openPercent}%" title="Open tasks"></div>
          <div class="workload-done" style="width: ${donePercent}%" title="Completed tasks"></div>
        </div>
      `;
      workloadList.appendChild(row);
    });
    
    chartContainer.appendChild(workloadList);
  }

  renderNotifications();
}

// 2. Projects View (Includes Customer Name and Customer Logo Rendering)
function renderProjects() {
  const projectsGrid = document.getElementById('projects-grid');
  projectsGrid.innerHTML = '';

  const searchVal = document.getElementById('project-search-input').value.toLowerCase();
  const filtered = state.projects.filter(p => 
    p.name.toLowerCase().includes(searchVal) || 
    p.description.toLowerCase().includes(searchVal)
  );

  if (filtered.length === 0) {
    projectsGrid.innerHTML = '<div class="empty-state">No projects found.</div>';
    return;
  }

  const role = state.currentUser.role;
  const isManager = (role === 'admin' || role === 'project_manager');
  const hasDeletionRights = (role === 'admin');

  filtered.forEach(proj => {
    const projTasks = state.tasks.filter(t => t.projectId === proj.id);
    const completed = projTasks.filter(t => t.status === 'done').length;
    const total = projTasks.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    // customer name / customer logo rendering
    let customerHtml = '';
    if (proj.customerName) {
      const logoImg = proj.customerLogo 
        ? `<img src="/uploads/${proj.customerLogo}" class="project-card-customer-logo" alt="${escapeHTML(proj.customerName)}">`
        : '';
      customerHtml = `
        <div class="project-card-customer-row">
          ${logoImg}
          <span>Customer: <strong>${escapeHTML(proj.customerName)}</strong></span>
        </div>
      `;
    }

    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <h3>${escapeHTML(proj.name)}</h3>
      <p>${escapeHTML(proj.description || 'No description provided.')}</p>
      
      ${customerHtml}

      <div class="project-dates" style="margin-top: 12px;">
        Dates: ${proj.startDate || 'N/A'} to ${proj.endDate || 'N/A'}
      </div>
      <div class="project-progress-row">
        <div class="project-progress-bar">
          <div class="project-progress-fill" style="width: ${percent}%"></div>
        </div>
        <div class="project-progress-label">
          <span>Progress</span>
          <span>${percent}% (${completed}/${total} tasks)</span>
        </div>
      </div>
      <div class="project-card-actions admin-pm-only">
        <button class="btn-icon btn-edit-proj" title="Edit Project" data-id="${proj.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button class="btn-icon btn-delete-proj text-danger ${hasDeletionRights ? '' : 'hidden'}" title="Delete Project" data-id="${proj.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.project-card-actions')) return;
      document.getElementById('board-project-filter').value = proj.id;
      navigateTo('tasks');
    });

    if (isManager) {
      card.querySelector('.btn-edit-proj').addEventListener('click', (e) => {
        e.stopPropagation();
        openProjectFormModal(proj.id);
      });
    }
    
    if (hasDeletionRights) {
      card.querySelector('.btn-delete-proj').addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDeleteProject(proj.id);
      });
    }

    projectsGrid.appendChild(card);
  });
}

// 3. Task Board View (Kanban / List / Timeline)
function renderKanbanBoard() {
  const projectFilter = document.getElementById('board-project-filter').value;
  const viewType = document.getElementById('board-view-type').value;

  const selectFilter = document.getElementById('board-project-filter');
  selectFilter.innerHTML = '<option value="all">All Shared Projects</option>';
  state.projects.forEach(p => {
    selectFilter.innerHTML += `<option value="${p.id}">${escapeHTML(p.name)}</option>`;
  });
  selectFilter.value = projectFilter;

  // Populate Assignee Filter dynamically
  const assigneeFilterSelect = document.getElementById('board-assignee-filter');
  if (assigneeFilterSelect) {
    const selectedAssignee = assigneeFilterSelect.value || 'all';
    assigneeFilterSelect.innerHTML = '<option value="all">All Members</option>';
    state.users.forEach(u => {
      assigneeFilterSelect.innerHTML += `<option value="${u.id}">${escapeHTML(u.name)}</option>`;
    });
    if (Array.from(assigneeFilterSelect.options).some(opt => opt.value === selectedAssignee)) {
      assigneeFilterSelect.value = selectedAssignee;
    } else {
      assigneeFilterSelect.value = 'all';
    }
  }

  // Filter Tasks by Project, Assignee (Member-wise), and Priority (Priority-wise)
  let filteredTasks = state.tasks;
  if (projectFilter !== 'all') {
    filteredTasks = filteredTasks.filter(t => t.projectId === projectFilter);
  }

  const assigneeFilter = document.getElementById('board-assignee-filter') ? document.getElementById('board-assignee-filter').value : 'all';
  if (assigneeFilter !== 'all') {
    filteredTasks = filteredTasks.filter(t => t.assigneeId === assigneeFilter);
  }

  const priorityFilter = document.getElementById('board-priority-filter') ? document.getElementById('board-priority-filter').value : 'all';
  if (priorityFilter !== 'all') {
    filteredTasks = filteredTasks.filter(t => t.priority === priorityFilter);
  }

  if (viewType === 'board') {
    document.getElementById('tasks-kanban-view').classList.remove('hidden');
    document.getElementById('tasks-list-view').classList.add('hidden');
    document.getElementById('project-timeline-view').classList.add('hidden');
    renderKanbanCards(filteredTasks);
  } else {
    document.getElementById('tasks-kanban-view').classList.add('hidden');
    document.getElementById('tasks-list-view').classList.remove('hidden');
    document.getElementById('project-timeline-view').classList.add('hidden');
    renderListTasks(filteredTasks);
  }
}

// Project Selection Sub-navigation tabs visibility toggle
function handleProjectFilterChange(projectId) {
  const tabsContainer = document.getElementById('project-tabs-container');
  if (projectId === 'all') {
    tabsContainer.classList.add('hidden');
    document.getElementById('board-view-type-wrapper').classList.remove('hidden');
    navigateToSubTab('board');
  } else {
    tabsContainer.classList.remove('hidden');
    const activeTab = document.querySelector('.project-tab.active').getAttribute('data-tab');
    navigateToSubTab(activeTab);
  }
}

function navigateToSubTab(tabName) {
  document.querySelectorAll('.project-tab').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabName) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  const selectedProjId = document.getElementById('board-project-filter').value;
  const viewType = document.getElementById('board-view-type').value;

  document.querySelectorAll('.project-tab-content').forEach(el => el.classList.add('hidden'));

  if (tabName === 'board') {
    document.getElementById('board-view-type-wrapper').classList.remove('hidden');
    if (viewType === 'board') {
      document.getElementById('tasks-kanban-view').classList.remove('hidden');
      renderKanbanBoard();
    } else {
      document.getElementById('tasks-list-view').classList.remove('hidden');
      renderKanbanBoard();
    }
  } else if (tabName === 'timeline') {
    document.getElementById('board-view-type-wrapper').classList.add('hidden');
    document.getElementById('project-timeline-view').classList.remove('hidden');
    renderProjectTimeline(selectedProjId);
  }
}

// Render Project Timeline Metrics Dashboard
function renderTimelineMetrics(timeline) {
  const container = document.getElementById('project-timeline-dashboard-metrics');
  if (!container) return;

  const totalStages = timeline.length;
  if (totalStages === 0) {
    container.innerHTML = '';
    return;
  }

  // 1. Calculate Average Progress
  const totalProgress = timeline.reduce((acc, stage) => acc + (stage.progress || 0), 0);
  const avgProgress = Math.round(totalProgress / totalStages);

  // 2. Calculate Milestones Count
  const completedCount = timeline.filter(s => s.progress === 100).length;
  const inProgressCount = timeline.filter(s => s.progress > 0 && s.progress < 100).length;
  const notStartedCount = timeline.filter(s => !s.progress || s.progress === 0).length;

  const compPct = (completedCount / totalStages) * 100;
  const progPct = (inProgressCount / totalStages) * 100;
  const nsPct = (notStartedCount / totalStages) * 100;

  // 3. Calculate Total Planned Span
  const totalPlannedDays = timeline.reduce((acc, stage) => acc + (parseInt(stage.duration, 10) || 0), 0);

  // 4. Calculate Timeline Health
  const now = new Date().setHours(0,0,0,0);
  let healthText = 'On Track';
  let healthColor = 'var(--success-color)';

  const hasDelayed = timeline.some(stage => {
    if (stage.progress < 100 && stage.endDate) {
      const end = new Date(stage.endDate).getTime();
      return end < now;
    }
    return false;
  });

  if (hasDelayed) {
    healthText = 'Delayed';
    healthColor = 'var(--danger-color)';
  } else if (timeline.every(s => !s.progress || s.progress === 0)) {
    healthText = 'Not Started';
    healthColor = 'var(--text-secondary)';
  } else if (inProgressCount > 0 || completedCount > 0) {
    healthText = 'On Track';
    healthColor = 'var(--success-color)';
  }

  container.innerHTML = `
    <div class="summary-chart-card">
      <h4>Overall Completion</h4>
      <div class="metric-val">${avgProgress}%</div>
      <div class="project-progress-bar" style="margin-top: 8px; height: 8px;">
        <div class="project-progress-fill" style="width: ${avgProgress}%; background: linear-gradient(90deg, var(--primary-color), var(--accent-color));"></div>
      </div>
    </div>

    <div class="summary-chart-card">
      <h4>Timeline Health</h4>
      <div class="metric-val" style="color: ${healthColor};">${healthText}</div>
      <p style="font-size: 0.65rem; color: var(--text-secondary); margin-top: 4px;">Evaluated from planned milestone deadlines</p>
    </div>

    <div class="summary-chart-card">
      <h4>Milestones Progress</h4>
      <div class="metric-val">${completedCount} / ${totalStages}</div>
      <div class="milestones-segmented-bar">
        <div class="segmented-fill-completed" style="width: ${compPct}%" title="Completed"></div>
        <div class="segmented-fill-inprogress" style="width: ${progPct}%" title="In Progress"></div>
        <div class="segmented-fill-notstarted" style="width: ${nsPct}%" title="Not Started"></div>
      </div>
      <div class="milestones-segmented-legend">
        <span><span class="legend-dot" style="background-color: var(--success-color)"></span>${completedCount} Done</span>
        <span><span class="legend-dot" style="background-color: var(--warning-color)"></span>${inProgressCount} Active</span>
        <span><span class="legend-dot" style="background-color: #cbd5e1"></span>${notStartedCount} Pending</span>
      </div>
    </div>

    <div class="summary-chart-card">
      <h4>Total Work Schedule</h4>
      <div class="metric-val">${totalPlannedDays} Days</div>
      <p style="font-size: 0.65rem; color: var(--text-secondary); margin-top: 4px;">Sum of planned milestones spans</p>
    </div>
  `;
}

// Render Project Timeline Plan & Milestones sheet
function renderProjectTimeline(projectId) {
  const proj = state.projects.find(p => p.id === projectId);
  if (!proj) return;

  const tbody = document.getElementById('timeline-stages-editor-body');
  tbody.innerHTML = '';

  // Local mutable copy of milestones timeline
  const localTimeline = JSON.parse(JSON.stringify(proj.timeline || DEFAULT_TIMELINE_STAGES));
  const isManager = (state.currentUser.role === 'admin' || state.currentUser.role === 'project_manager');

  const renderTimelineRows = () => {
    tbody.innerHTML = '';
    localTimeline.forEach((stage, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="text" class="timeline-stage-name-input" value="${escapeHTML(stage.name)}" data-idx="${idx}" ${isManager ? '' : 'disabled'} style="font-weight:600;"></td>
        <td><input type="date" class="timeline-date-start" value="${stage.startDate || ''}" data-idx="${idx}" ${isManager ? '' : 'disabled'}></td>
        <td><input type="date" class="timeline-date-end" value="${stage.endDate || ''}" data-idx="${idx}" ${isManager ? '' : 'disabled'}></td>
        <td><input type="number" class="timeline-duration" value="${stage.duration || ''}" min="0" data-idx="${idx}" ${isManager ? '' : 'disabled'}></td>
        <td><input type="number" class="timeline-progress" value="${stage.progress || 0}" min="0" max="100" data-idx="${idx}" ${isManager ? '' : 'disabled'} style="font-weight:700;"></td>
        <td class="admin-pm-only">
          <button type="button" class="btn-delete-milestone" data-idx="${idx}" title="Delete Milestone">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        </td>
      `;
      
      const nameInput = tr.querySelector('.timeline-stage-name-input');
      const startInput = tr.querySelector('.timeline-date-start');
      const endInput = tr.querySelector('.timeline-date-end');
      const durInput = tr.querySelector('.timeline-duration');
      const progressInput = tr.querySelector('.timeline-progress');
      const deleteBtn = tr.querySelector('.btn-delete-milestone');

      const recalculate = (triggerField) => {
        const startVal = startInput.value;
        const endVal = endInput.value;
        const durVal = parseInt(durInput.value, 10);
        const progressVal = parseInt(progressInput.value, 10) || 0;
        const oneDay = 24 * 60 * 60 * 1000;

        localTimeline[idx].name = nameInput.value;
        localTimeline[idx].progress = Math.min(100, Math.max(0, progressVal));

        if (triggerField === 'start' || triggerField === 'end') {
          if (startVal && endVal) {
            const startDate = new Date(startVal);
            const endDate = new Date(endVal);
            if (endDate >= startDate) {
              const diffDays = Math.ceil((endDate - startDate) / oneDay) + 1;
              durInput.value = diffDays;
              localTimeline[idx].duration = diffDays;
            } else {
              durInput.value = 0;
              localTimeline[idx].duration = 0;
            }
            localTimeline[idx].startDate = startVal;
            localTimeline[idx].endDate = endVal;
          } else {
            localTimeline[idx].startDate = startVal || '';
            localTimeline[idx].endDate = endVal || '';
          }
        } else if (triggerField === 'duration') {
          if (durVal && durVal > 0) {
            if (startVal) {
              const startDate = new Date(startVal);
              const endDate = new Date(startDate.getTime() + (durVal - 1) * oneDay);
              const endStr = endDate.toISOString().split('T')[0];
              endInput.value = endStr;
              localTimeline[idx].endDate = endStr;
              localTimeline[idx].startDate = startVal;
              localTimeline[idx].duration = durVal;
            } else if (endVal) {
              const endDate = new Date(endVal);
              const startDate = new Date(endDate.getTime() - (durVal - 1) * oneDay);
              const startStr = startDate.toISOString().split('T')[0];
              startInput.value = startStr;
              localTimeline[idx].startDate = startStr;
              localTimeline[idx].endDate = endVal;
              localTimeline[idx].duration = durVal;
            } else {
              localTimeline[idx].duration = durVal;
            }
          } else {
            localTimeline[idx].duration = 0;
          }
        }
        
        renderGanttChart(localTimeline);
        renderTimelineMetrics(localTimeline);
      };

      nameInput.addEventListener('input', () => { localTimeline[idx].name = nameInput.value; });
      startInput.addEventListener('change', () => recalculate('start'));
      endInput.addEventListener('change', () => recalculate('end'));
      durInput.addEventListener('input', () => recalculate('duration'));
      progressInput.addEventListener('input', () => recalculate('progress'));

      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          localTimeline.splice(idx, 1);
          renderTimelineRows();
          renderGanttChart(localTimeline);
          renderTimelineMetrics(localTimeline);
        });
      }

      tbody.appendChild(tr);
    });
  };

  renderTimelineRows();
  renderGanttChart(localTimeline);
  renderTimelineMetrics(localTimeline);

  // Bind Add Milestone button
  const addBtn = document.getElementById('btn-add-milestone');
  const newAddBtn = addBtn.cloneNode(true);
  addBtn.replaceWith(newAddBtn);
  
  if (isManager) {
    newAddBtn.classList.remove('hidden');
    newAddBtn.addEventListener('click', () => {
      localTimeline.push({
        name: 'New Milestone Stage',
        startDate: '',
        endDate: '',
        duration: 0,
        progress: 0
      });
      renderTimelineRows();
      renderGanttChart(localTimeline);
      renderTimelineMetrics(localTimeline);
    });
  } else {
    newAddBtn.classList.add('hidden');
  }

  // Bind Save Timeline changes button
  const saveBtn = document.getElementById('btn-save-timeline');
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.replaceWith(newSaveBtn);

  if (isManager) {
    newSaveBtn.classList.remove('hidden');
    newSaveBtn.addEventListener('click', async () => {
      try {
        await apiCall(`/api/projects/${projectId}/timeline`, 'PUT', { timeline: localTimeline });
        alert('Timeline plan saved successfully!');
        await fetchProjects();
        renderProjectTimeline(projectId);
      } catch (err) {
        alert('Failed to save timeline: ' + err.message);
      }
    });
  } else {
    newSaveBtn.classList.add('hidden');
  }
}

// Generate Gantt Chart
function renderGanttChart(timeline) {
  const container = document.getElementById('gantt-chart-container');
  container.innerHTML = '';

  const validStages = timeline.filter(s => s.startDate && s.endDate && s.duration > 0);

  if (validStages.length === 0) {
    container.innerHTML = '<div class="empty-state">No timeline dates set to generate visual Gantt chart. Enter dates above and click Save.</div>';
    return;
  }

  // Find min and max times
  let minTime = Infinity;
  let maxTime = -Infinity;

  validStages.forEach(s => {
    const start = new Date(s.startDate).getTime();
    const end = new Date(s.endDate).getTime();
    if (start < minTime) minTime = start;
    if (end > maxTime) maxTime = end;
  });

  const oneDay = 24 * 60 * 60 * 1000;
  const totalDays = Math.ceil((maxTime - minTime) / oneDay) + 1;

  const ganttGrid = document.createElement('div');
  ganttGrid.className = 'gantt-grid';

  const headerRow = document.createElement('div');
  headerRow.className = 'gantt-header-row';
  
  const scaleContainer = document.createElement('div');
  scaleContainer.className = 'gantt-scale';

  const tickCount = 4;
  for (let i = 0; i < tickCount; i++) {
    const tickTime = minTime + (maxTime - minTime) * (i / (tickCount - 1));
    const tickDate = new Date(tickTime);
    const tickStr = tickDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const percent = (i / (tickCount - 1)) * 100;
    
    scaleContainer.innerHTML += `
      <div class="gantt-scale-tick" style="left: ${percent}%">${tickStr}</div>
    `;
  }

  headerRow.innerHTML = `<div>Stage / Milestone</div>`;
  headerRow.appendChild(scaleContainer);
  container.appendChild(headerRow);

  timeline.forEach(stage => {
    const row = document.createElement('div');
    row.className = 'gantt-row';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'gantt-stage-name';
    nameDiv.textContent = stage.name;
    nameDiv.title = stage.name;

    const barContainer = document.createElement('div');
    barContainer.className = 'gantt-bar-container';

    if (stage.startDate && stage.endDate && stage.duration > 0) {
      const start = new Date(stage.startDate).getTime();
      const end = new Date(stage.endDate).getTime();
      const offsetDays = Math.ceil((start - minTime) / oneDay);
      const durationDays = Math.ceil((end - start) / oneDay) + 1;

      const leftPct = (offsetDays / totalDays) * 100;
      const widthPct = (durationDays / totalDays) * 100;

      const barFill = document.createElement('div');
      barFill.className = 'gantt-bar-fill';
      barFill.style.left = `${leftPct}%`;
      barFill.style.width = `${widthPct}%`;

      // actual progress nested overlay
      const progressPct = stage.progress || 0;
      const progressBar = document.createElement('div');
      progressBar.className = 'gantt-bar-progress';
      progressBar.style.width = `${progressPct}%`;
      
      const barLabel = document.createElement('span');
      barLabel.className = 'gantt-bar-label';
      barLabel.textContent = `${durationDays}d (${progressPct}%)`;

      barFill.appendChild(progressBar);
      barFill.appendChild(barLabel);
      barFill.title = `${stage.name}: Planned ${stage.startDate} to ${stage.endDate} (${durationDays} days) | Actual Progress: ${progressPct}%`;
      
      barContainer.appendChild(barFill);
    }

    row.appendChild(nameDiv);
    row.appendChild(barContainer);
    ganttGrid.appendChild(row);
  });

  const today = new Date().setHours(0,0,0,0);
  if (today >= minTime && today <= maxTime) {
    const offsetDays = Math.ceil((today - minTime) / oneDay);
    const leftPct = (offsetDays / totalDays) * 100;
    
    const todayLine = document.createElement('div');
    todayLine.className = 'gantt-today-line';
    todayLine.style.left = `${leftPct}%`;
    todayLine.style.height = `${(timeline.length * 44) + 10}px`;
    todayLine.style.top = '0';
    scaleContainer.appendChild(todayLine);
  }

  container.appendChild(ganttGrid);
}

// Render Kanban cards
function renderKanbanCards(filteredTasks) {
  const cols = {
    todo: document.getElementById('cards-todo'),
    inprogress: document.getElementById('cards-inprogress'),
    done: document.getElementById('cards-done')
  };

  Object.values(cols).forEach(col => col.innerHTML = '');

  const counts = { todo: 0, inprogress: 0, done: 0 };
  const nowStr = new Date().toISOString().split('T')[0];
  const role = state.currentUser.role;

  filteredTasks.forEach(task => {
    counts[task.status]++;
    const colContainer = cols[task.status];
    if (!colContainer) return;

    const proj = state.projects.find(p => p.id === task.projectId);
    const projName = proj ? proj.name : 'Unknown';
    const isOverdue = task.status !== 'done' && task.dueDate && task.dueDate < nowStr;

    let assigneeInitials = 'UA';
    let assigneeName = 'Unassigned';
    
    if (task.assigneeId) {
      const u = state.users.find(item => item.id === task.assigneeId);
      if (u) {
        assigneeInitials = u.name.split(' ').map(x => x[0]).join('').substring(0, 2).toUpperCase();
        assigneeName = u.name;
      }
    }

    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.draggable = true;
    card.dataset.id = task.id;
    
    // Regular members can edit tasks they created or are assigned to
    const isCreator = task.createdBy === state.currentUser.id;
    const isAssignee = task.assigneeId === state.currentUser.id;
    const isManager = (role === 'admin' || role === 'project_manager');
    const canEdit = isManager || isCreator || isAssignee;

    card.innerHTML = `
      <div class="kanban-card-project">${escapeHTML(projName)}</div>
      <h4>${escapeHTML(task.title)}</h4>
      <span class="priority-pill pill-${task.priority}">${task.priority}</span>
      
      <div class="kanban-card-meta">
        <div class="kanban-card-assignee" title="Assignee: ${escapeHTML(assigneeName)}">
          <div class="initials">${assigneeInitials}</div>
        </div>
        <div class="kanban-card-date ${isOverdue ? 'overdue' : ''}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <span>${task.dueDate ? formatDateMini(task.dueDate) : 'No Date'}</span>
        </div>
      </div>

      <button class="btn-icon kanban-card-edit-btn ${canEdit ? '' : 'hidden'}" title="Edit Task" data-id="${task.id}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
      </button>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.kanban-card-edit-btn')) return;
      openTaskDetailsModal(task.id);
    });

    if (canEdit) {
      card.querySelector('.kanban-card-edit-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openTaskFormModal(task.id);
      });
    }

    setupDragAndDropHandlers(card);
    colContainer.appendChild(card);
  });

  document.getElementById('count-todo').textContent = counts.todo;
  document.getElementById('count-inprogress').textContent = counts.inprogress;
  document.getElementById('count-done').textContent = counts.done;
}

// Render List View of Tasks
function renderListTasks(filteredTasks) {
  const tbody = document.getElementById('list-tasks-body');
  tbody.innerHTML = '';

  if (filteredTasks.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No tasks found.</td></tr>';
    return;
  }

  const role = state.currentUser.role;

  filteredTasks.forEach(task => {
    const proj = state.projects.find(p => p.id === task.projectId);
    const projName = proj ? proj.name : 'Unknown';
    
    let assigneeName = 'Unassigned';
    if (task.assigneeId) {
      const u = state.users.find(item => item.id === task.assigneeId);
      if (u) assigneeName = u.name;
    }

    const isCreator = task.createdBy === state.currentUser.id;
    const isAssignee = task.assigneeId === state.currentUser.id;
    const isManager = (role === 'admin' || role === 'project_manager');
    const canEdit = isManager || isCreator || isAssignee;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHTML(task.title)}</strong></td>
      <td>${escapeHTML(projName)}</td>
      <td>${escapeHTML(assigneeName)}</td>
      <td><span class="priority-pill pill-${task.priority}">${task.priority}</span></td>
      <td>${task.dueDate || 'No Date'}</td>
      <td><span class="status-pill status-${task.status}">${task.status}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm btn-open-detail" data-id="${task.id}">Open</button>
        <button class="btn btn-secondary btn-sm btn-edit-task ${canEdit ? '' : 'hidden'}" data-id="${task.id}">Edit</button>
      </td>
    `;

    tr.querySelector('.btn-open-detail').addEventListener('click', () => openTaskDetailsModal(task.id));
    
    if (canEdit) {
      tr.querySelector('.btn-edit-task').addEventListener('click', () => openTaskFormModal(task.id));
    }

    tbody.appendChild(tr);
  });
}

// Drag and drop handlers
function setupDragAndDropHandlers(card) {
  card.addEventListener('dragstart', (e) => {
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', card.dataset.id);
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
  });
}

function initKanbanDropzones() {
  document.querySelectorAll('.column-cards').forEach(zone => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      
      const taskId = e.dataTransfer.getData('text/plain');
      const column = zone.closest('.kanban-column');
      const newStatus = column.dataset.status;

      const task = state.tasks.find(t => t.id === taskId);
      if (task && task.status !== newStatus) {
        const oldStatus = task.status;
        task.status = newStatus;
        renderKanbanBoard();

        try {
          await apiCall(`/api/tasks/${taskId}`, 'PUT', { status: newStatus });
          await fetchTasks();
          renderKanbanBoard();
        } catch (err) {
          alert('Failed to update task status: ' + err.message);
          task.status = oldStatus;
          renderKanbanBoard();
        }
      }
    });
  });
}

// 4. Team View (Super Admin / Admin / PM Access)
function renderTeam() {
  const tbody = document.getElementById('team-table-body');
  tbody.innerHTML = '';

  const activeCount = state.users.filter(u => u.status === 'active').length;
  document.getElementById('active-user-counter').textContent = activeCount;

  const role = state.currentUser.role;
  const isSuperAdmin = (role === 'admin'); // 'admin' is the top org role
  const isAdmin = (role === 'admin');
  const isPM = (role === 'project_manager');

  state.users.forEach(user => {
    const isSelf = user.id === state.currentUser.id;
    const isTargetSuperAdmin = user.role === 'admin';
    const isTargetAdmin = user.role === 'admin';
    
    // SuperAdmin manages everyone. Admin manages Admin/PM/Members. PM manages PM/Members. DeptHead manages their own dept.
    const canManageUser = isSuperAdmin || 
                         (isAdmin && !isTargetSuperAdmin) || 
                         (isPM && !isTargetSuperAdmin && !isTargetAdmin && !isSelf) ||
                         (isDeptHead && user.department === state.currentUser.department && !isTargetSuperAdmin && !isTargetAdmin);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHTML(user.name)}</strong></td>
      <td>${escapeHTML(user.email)}</td>
      <td><span class="priority-pill pill-medium" style="text-transform:uppercase; font-weight:700; letter-spacing:0.5px;">${formatRoleTitle(user.role).toUpperCase()}</span></td>
      <td><span class="badge badge-outline" style="white-space:nowrap; display:inline-block; padding: 4px 10px; border-radius: 12px; font-weight:600;">${escapeHTML(user.department || 'Engineering')}</span></td>
      <td>
        <div style="font-size:0.85rem; font-weight:600;">${user.plan || 'Free Trial'}</div>
        <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase;">${user.paymentStatus || 'unpaid'}</div>
      </td>
      <td><span class="status-pill status-${user.status === 'active' ? 'done' : 'todo'}">${user.status}</span></td>
      <td>${new Date(user.createdAt).toLocaleDateString()}</td>
      <td style="display:flex; flex-wrap:wrap; gap:4px;">
        <button class="btn btn-secondary btn-edit-user" data-id="${user.id}" ${canManageUser ? '' : 'disabled'}>Edit</button>
        ${(canManageUser && user.status !== 'active') ? `<button class="btn btn-primary btn-approve-user" data-id="${user.id}">Approve</button>` : ''}
        ${(canManageUser && user.status === 'active') ? `<button class="btn btn-danger btn-deny-user" data-id="${user.id}">Deny</button>` : ''}
      </td>
    `;

    if (canManageUser) {
      tr.querySelector('.btn-edit-user').addEventListener('click', () => openUserFormModal(user.id));
      
      const approveBtn = tr.querySelector('.btn-approve-user');
      if (approveBtn) approveBtn.addEventListener('click', () => approveUser(user.id));
      
      const denyBtn = tr.querySelector('.btn-deny-user');
      if (denyBtn) denyBtn.addEventListener('click', () => denyUser(user.id));
    }
    
    tbody.appendChild(tr);
  });

  // Render Super Admin Departments CRUD panel
  const deptSection = document.getElementById('department-management-section');
  if (isSuperAdmin) {
    deptSection.classList.remove('hidden');
    renderDepartmentsCRUD();
  } else {
    deptSection.classList.add('hidden');
  }

  // Render Super Admin Branding configuration
  const brandSection = document.getElementById('branding-management-section');
  if (isSuperAdmin) {
    brandSection.classList.remove('hidden');
    document.getElementById('company-name-input').value = state.settings.companyName || '';
    
    const preview = document.getElementById('company-logo-preview');
    if (state.settings.companyLogo) {
      preview.innerHTML = `<img src="/uploads/${state.settings.companyLogo}" style="max-height:100%; max-width:100%; object-fit:contain;" alt="Logo Preview">`;
    } else {
      preview.innerHTML = `<span style="font-size:0.75rem; color:var(--text-secondary);">No custom logo</span>`;
    }
  } else {
    brandSection.classList.add('hidden');
  }
}

// Super Admin Departments CRUD Rendering
function renderDepartmentsCRUD() {
  const tbody = document.getElementById('departments-list-body');
  tbody.innerHTML = '';
  
  state.departments.forEach(dept => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHTML(dept)}</strong></td>
      <td>
        <button type="button" class="btn btn-danger btn-sm btn-delete-dept" data-name="${escapeHTML(dept)}">Delete</button>
      </td>
    `;
    tr.querySelector('.btn-delete-dept').addEventListener('click', async () => {
      if (!confirm(`Are you sure you want to remove the "${dept}" department?`)) return;
      try {
        await apiCall(`/api/departments/${encodeURIComponent(dept)}`, 'DELETE');
        await fetchDepartments();
        renderDepartmentsCRUD();
      } catch (err) {
        alert(err.message);
      }
    });
    tbody.appendChild(tr);
  });
}

async function toggleUserStatus(id, currentStatus) {
  const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
  const actionText = newStatus === 'active' ? 'reactivate' : 'deactivate';
  if (!confirm(`Are you sure you want to ${actionText} this user account?`)) return;

  try {
    await apiCall(`/api/users/${id}`, 'PUT', { status: newStatus });
    await fetchUsers();
    renderTeam();
  } catch (err) {
    alert(err.message);
  }
}

// 5. Reports View (Admin / PM / Super Admin Only)
function renderReports() {
  const nowStr = new Date().toISOString().split('T')[0];

  const projectList = document.getElementById('report-project-progress');
  projectList.innerHTML = '';
  
  if (state.projects.length === 0) {
    projectList.innerHTML = '<div class="empty-state">No projects setup.</div>';
  } else {
    state.projects.forEach(p => {
      const projTasks = state.tasks.filter(t => t.projectId === p.id);
      const done = projTasks.filter(t => t.status === 'done').length;
      const total = projTasks.length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;

      const div = document.createElement('div');
      div.className = 'report-project-progress-row';
      div.innerHTML = `
        <div class="report-project-progress-header">
          <span>${escapeHTML(p.name)}</span>
          <span>${pct}% (${done}/${total} tasks)</span>
        </div>
        <div class="project-progress-bar">
          <div class="project-progress-fill" style="width: ${pct}%"></div>
        </div>
      `;
      projectList.appendChild(div);
    });
  }

  const userList = document.getElementById('report-user-completions');
  userList.innerHTML = '';
  const activeUsers = state.users.filter(u => u.status === 'active');

  if (activeUsers.length === 0) {
    userList.innerHTML = '<div class="empty-state">No active users.</div>';
  } else {
    activeUsers.forEach(user => {
      const completed = state.tasks.filter(t => t.assigneeId === user.id && t.status === 'done').length;
      const open = state.tasks.filter(t => t.assigneeId === user.id && t.status !== 'done').length;

      const item = document.createElement('div');
      item.className = 'report-list-item';
      item.innerHTML = `
        <span><strong>${escapeHTML(user.name)}</strong></span>
        <span>${completed} Completed / ${open} Open</span>
      `;
      userList.appendChild(item);
    });
  }

  const overdueList = document.getElementById('report-overdue-list');
  overdueList.innerHTML = '';
  const overdue = state.tasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < nowStr);

  if (overdue.length === 0) {
    overdueList.innerHTML = '<div class="empty-state">No overdue tasks! Keep it up.</div>';
  } else {
    overdue.forEach(t => {
      const user = state.users.find(u => u.id === t.assigneeId);
      const name = user ? user.name : 'Unassigned';
      
      const item = document.createElement('div');
      item.className = 'report-list-item';
      item.innerHTML = `
        <div>
          <strong>${escapeHTML(t.title)}</strong>
          <span style="display:block; font-size:0.75rem; color:var(--danger-color)">Due: ${t.dueDate}</span>
        </div>
        <span class="priority-pill pill-high" style="font-size:0.7rem;">${escapeHTML(name)}</span>
      `;
      overdueList.appendChild(item);
    });
  }
}

// 6. Notifications Panel
function renderNotifications() {
  const notifBadge = document.getElementById('notification-badge');
  const notifList = document.getElementById('notification-list');
  const unread = state.notifications.filter(n => !n.read);
  
  if (unread.length > 0) {
    notifBadge.textContent = unread.length;
    notifBadge.classList.remove('hidden');
  } else {
    notifBadge.classList.add('hidden');
  }

  notifList.innerHTML = '';
  if (state.notifications.length === 0) {
    notifList.innerHTML = '<div class="no-notifications">No new notifications</div>';
    return;
  }

  state.notifications.forEach(n => {
    const div = document.createElement('div');
    div.className = `notification-item ${n.read ? '' : 'unread'}`;
    div.innerHTML = `
      <div>${escapeHTML(n.text)}</div>
      <div class="notif-time">${formatTimeAgo(n.createdAt)}</div>
    `;
    div.addEventListener('click', async () => {
      if (!n.read) {
        await apiCall(`/api/notifications/${n.id}/read`, 'PUT');
        fetchNotifications().then(renderNotifications).catch(console.error);
      }
    });
    notifList.appendChild(div);
  });
}

// ==================== FORM & MODAL ACTIONS ====================

// Task Creation/Edition Modal
async function openTaskFormModal(taskId = null) {
  const modal = document.getElementById('modal-task-form');
  const form = document.getElementById('task-form');
  form.reset();
  
  const role = state.currentUser.role;
  const isManager = (role === 'admin' || role === 'project_manager');

  // Filter projects by member assignments if not manager
  const projectSelect = document.getElementById('task-project');
  projectSelect.innerHTML = '<option value="">Select Project...</option>';
  
  const allowedProj = isManager 
    ? state.projects 
    : state.projects.filter(p => p.members && p.members.includes(state.currentUser.id));
  
  allowedProj.forEach(p => {
    projectSelect.innerHTML += `<option value="${p.id}">${escapeHTML(p.name)}</option>`;
  });

  // Populate department filter choices
  const deptFilter = document.getElementById('task-assignee-dept-filter');
  deptFilter.innerHTML = '<option value="all">Show All Departments</option>';
  state.departments.forEach(d => {
    deptFilter.innerHTML += `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`;
  });

  // Populate assignee dropdown
  const assigneeSelect = document.getElementById('task-assignee');
  
  const updateAssigneeDropdown = () => {
    const selectedDept = deptFilter.value;
    assigneeSelect.innerHTML = '<option value="">Unassigned</option>';
    
    // Filter active users by department
    const usersList = state.users.filter(u => 
      u.status === 'active' && 
      (selectedDept === 'all' || u.department === selectedDept)
    );
    
    usersList.forEach(u => {
      assigneeSelect.innerHTML += `<option value="${u.id}">${escapeHTML(u.name)} (${escapeHTML(u.department || 'Engineering')})</option>`;
    });
  };

  deptFilter.addEventListener('change', updateAssigneeDropdown);
  updateAssigneeDropdown();

  // Enable/Disable details based on creator vs assignee role
  const titleField = document.getElementById('task-title');
  const descField = document.getElementById('task-description');
  const projField = document.getElementById('task-project');
  const priorityField = document.getElementById('task-priority');
  const dateField = document.getElementById('task-duedate');
  const statusField = document.getElementById('task-status');

  // Populate Operator dropdown
  const opSelect = document.getElementById('task-allocated-operator');
  if (opSelect) {
    opSelect.innerHTML = '<option value="">Select Operator...</option>' +
      state.users.map(u => `<option value="${escapeHTML(u.name)}">${escapeHTML(u.name)}</option>`).join('');
  }

  const startDateField = document.getElementById('task-startdate');
  const opField = document.getElementById('task-allocated-operator');
  const roleField = document.getElementById('task-operator-role');
  const durationField = document.getElementById('task-mapped-duration');

  const enableAllFields = () => {
    titleField.disabled = false;
    descField.disabled = false;
    projField.disabled = false;
    priorityField.disabled = false;
    dateField.disabled = false;
    statusField.disabled = false;
    deptFilter.disabled = false;
    assigneeSelect.disabled = false;
    if (startDateField) startDateField.disabled = false;
    if (opField) opField.disabled = false;
    if (roleField) roleField.disabled = false;
    if (durationField) durationField.disabled = false;
  };

  const disableEditFieldsExceptStatus = () => {
    titleField.disabled = true;
    descField.disabled = true;
    projField.disabled = true;
    priorityField.disabled = true;
    dateField.disabled = true;
    deptFilter.disabled = true;
    assigneeSelect.disabled = true;
    if (startDateField) startDateField.disabled = true;
    if (opField) opField.disabled = true;
    if (roleField) roleField.disabled = true;
    if (durationField) durationField.disabled = true;
    statusField.disabled = false; // status is always editable
  };

  enableAllFields();

  if (taskId) {
    document.getElementById('task-modal-title').textContent = 'Edit Task Details';
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('task-id-field').value = task.id;
    document.getElementById('task-project').value = task.projectId;
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-description').value = task.description;
    
    const targetUser = state.users.find(u => u.id === task.assigneeId);
    if (targetUser && targetUser.department) {
      deptFilter.value = targetUser.department;
      updateAssigneeDropdown();
    }
    document.getElementById('task-assignee').value = task.assigneeId || '';
    document.getElementById('task-priority').value = task.priority;
    document.getElementById('task-status').value = task.status;
    document.getElementById('task-duedate').value = task.dueDate || '';
    if (startDateField) startDateField.value = task.startDate || '';
    if (opField) opField.value = task.allocatedOperator || '';
    if (roleField) roleField.value = task.operatorRole || 'None';
    if (durationField) durationField.value = task.mappedDuration || '';

    // Permissions logic
    const isCreator = task.createdBy === state.currentUser.id;
    const isAssignee = task.assigneeId === state.currentUser.id;

    if (!isManager && isAssignee && !isCreator) {
      disableEditFieldsExceptStatus();
    }
  } else {
    document.getElementById('task-modal-title').textContent = 'Create Task';
    document.getElementById('task-id-field').value = '';
    if (startDateField) startDateField.value = '';
    if (opField) opField.value = '';
    if (roleField) roleField.value = 'None';
    if (durationField) durationField.value = '';
    
    const currentFilter = document.getElementById('board-project-filter').value;
    if (currentFilter !== 'all') {
      document.getElementById('task-project').value = currentFilter;
    }
  }

  modal.classList.add('active');
}

// Project Creation/Edition Modal
async function openProjectFormModal(projId = null) {
  const modal = document.getElementById('modal-project-form');
  const form = document.getElementById('project-form');
  form.reset();

  const activeMembers = state.users.filter(u => u.status === 'active' && u.role !== 'admin');
  const listContainer = document.getElementById('project-members-checkboxes');
  listContainer.innerHTML = '';

  if (activeMembers.length === 0) {
    listContainer.innerHTML = '<p class="empty-text">No active members to assign.</p>';
  } else {
    activeMembers.forEach(user => {
      const label = document.createElement('label');
      label.className = 'checkbox-item';
      label.innerHTML = `
        <input type="checkbox" name="members" value="${user.id}">
        <span>${escapeHTML(user.name)} (${escapeHTML(user.role.replace('_', ' '))})</span>
      `;
      listContainer.appendChild(label);
    });
  }

  if (projId) {
    document.getElementById('project-modal-title').textContent = 'Edit Project';
    const proj = state.projects.find(p => p.id === projId);
    if (!proj) return;

    document.getElementById('project-id-field').value = proj.id;
    document.getElementById('project-name').value = proj.name;
    document.getElementById('project-description').value = proj.description;
    document.getElementById('project-startdate').value = proj.startDate;
    document.getElementById('project-enddate').value = proj.endDate;
    document.getElementById('project-customer-name').value = proj.customerName || '';

    if (proj.members) {
      proj.members.forEach(memberId => {
        const cb = listContainer.querySelector(`input[value="${memberId}"]`);
        if (cb) cb.checked = true;
      });
    }
  } else {
    document.getElementById('project-modal-title').textContent = 'Create Project';
    document.getElementById('project-id-field').value = '';
  }

  modal.classList.add('active');
}

// User Creation/Edition Modal
function openUserFormModal(userId = null) {
  const modal = document.getElementById('modal-user-form');
  const form = document.getElementById('user-form');
  form.reset();

  document.getElementById('user-error').classList.add('hidden');

  const deptSelect = document.getElementById('user-dept');
  deptSelect.innerHTML = '';
  state.departments.forEach(d => {
    deptSelect.innerHTML += `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`;
  });
  
  const roleSelect = document.getElementById('user-role');
  Array.from(roleSelect.options).forEach(opt => opt.disabled = false);

  if (state.currentUser.role === 'department_head') {
    deptSelect.value = state.currentUser.department;
    deptSelect.disabled = true; // Lock to their department
    // Disable admin roles for Dept Head
    Array.from(roleSelect.options).forEach(opt => {
      if (['admin', 'superadmin', 'owner', 'project_manager', 'md'].includes(opt.value)) {
        opt.disabled = true;
      }
    });
  } else {
    deptSelect.disabled = false;
  }

  if (userId) {
    document.getElementById('user-modal-title').textContent = 'Edit User Settings';
    const user = state.users.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('user-id-field').value = user.id;
    document.getElementById('user-name').value = user.name;
    document.getElementById('user-email').value = user.email;
    
    document.getElementById('user-password').required = false;
    document.getElementById('user-password-label').textContent = 'Password';
    document.getElementById('user-password-help').classList.remove('hidden');
    
    document.getElementById('user-dept').value = user.department || 'Engineering';
    document.getElementById('user-role').value = user.role;
    document.getElementById('user-status').value = user.status;
    
    // Load granular module permissions
    const perms = user.permissions || {};
    const isDeptPurchasing = user.department === 'Purchasing';
    const isManagerRole = user.role === 'admin' || user.role === 'superadmin' || user.role === 'owner' || user.role === 'project_manager' || user.role === 'operations_head' || user.role === 'md';

    document.getElementById('user-perm-projects').checked = perms.projects !== false;
    document.getElementById('user-perm-bom').checked = perms.bom !== undefined ? perms.bom === true : (isDeptPurchasing || isManagerRole);
    document.getElementById('user-perm-rfq').checked = perms.rfq !== undefined ? perms.rfq === true : isManagerRole;
    document.getElementById('user-perm-pr').checked = perms.pr !== undefined ? perms.pr === true : (isManagerRole || isDeptPurchasing);
  } else {
    document.getElementById('user-modal-title').textContent = 'Add New Coworker';
    document.getElementById('user-id-field').value = '';
    
    // Default checkboxes for new user
    document.getElementById('user-perm-projects').checked = true;
    document.getElementById('user-perm-bom').checked = false;
    document.getElementById('user-perm-rfq').checked = false;
    document.getElementById('user-perm-pr').checked = true;
    
    document.getElementById('user-password').required = true;
    document.getElementById('user-password-label').textContent = 'Password *';
    document.getElementById('user-password-help').classList.add('hidden');
  }

  modal.classList.add('active');
}

// Task Details Viewer Modal
async function openTaskDetailsModal(taskId) {
  state.selectedTaskId = taskId;
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  const modal = document.getElementById('modal-task-details');
  const proj = state.projects.find(p => p.id === task.projectId);

  document.getElementById('detail-task-project').textContent = proj ? proj.name : 'Shared Tasks';
  document.getElementById('detail-task-title').textContent = task.title;
  document.getElementById('detail-task-desc').textContent = task.description || 'No description provided for this task.';
  
  let assigneeName = 'Unassigned';
  if (task.assigneeId) {
    const u = state.users.find(item => item.id === task.assigneeId);
    if (u) assigneeName = u.name;
  }
  document.getElementById('detail-task-assignee').textContent = assigneeName;

  const priorityPill = document.getElementById('detail-task-priority');
  priorityPill.textContent = task.priority;
  priorityPill.className = `priority-pill pill-${task.priority}`;
  
  document.getElementById('detail-task-duedate').textContent = task.dueDate ? formatDateFull(task.dueDate) : 'No due date';
  document.getElementById('detail-task-created').textContent = new Date(task.createdAt).toLocaleDateString();

  document.getElementById('detail-task-status-select').value = task.status;

  document.getElementById('detail-task-startdate').textContent = task.startDate ? formatDateFull(task.startDate) : 'No Start Date';
  document.getElementById('detail-task-operator').textContent = task.allocatedOperator ? `${task.allocatedOperator} (${task.operatorRole || 'None'})` : 'Unassigned';
  document.getElementById('detail-task-duration').textContent = task.mappedDuration ? `${task.mappedDuration} Hours` : 'No duration mapped';

  // Check overlap warning
  const warningBanner = document.getElementById('detail-task-overlap-warning');
  if (warningBanner) {
    const hasOverlap = checkTaskOverlapConflict(task);
    if (hasOverlap) {
      warningBanner.classList.remove('hidden');
    } else {
      warningBanner.classList.add('hidden');
    }
  }

  document.getElementById('attachment-file-name').textContent = 'No file chosen';
  document.getElementById('attachment-file-input').value = '';

  renderTaskComments(taskId);
  renderTaskAttachments(task);

  modal.classList.add('active');
}

async function renderTaskComments(taskId) {
  const listContainer = document.getElementById('detail-comments-list');
  listContainer.innerHTML = '<div class="empty-text">Loading comments...</div>';

  try {
    const comments = await apiCall(`/api/tasks/${taskId}/comments`);
    listContainer.innerHTML = '';
    
    if (comments.length === 0) {
      listContainer.innerHTML = '<p class="empty-text">No comments yet. Write something below!</p>';
      return;
    }

    comments.forEach(c => {
      const bubble = document.createElement('div');
      bubble.className = 'comment-bubble';
      bubble.innerHTML = `
        <div class="comment-bubble-header">
          <span>${escapeHTML(c.userName)}</span>
          <span>${formatTimeAgo(c.createdAt)}</span>
        </div>
        <div>${escapeHTML(c.text)}</div>
      `;
      listContainer.appendChild(bubble);
    });
    listContainer.scrollTop = listContainer.scrollHeight;

  } catch (err) {
    listContainer.innerHTML = `<div class="error-message">Failed to load comments: ${err.message}</div>`;
  }
}

function renderTaskAttachments(task) {
  const container = document.getElementById('detail-attachments-list');
  container.innerHTML = '';

  if (!task.attachments || task.attachments.length === 0) {
    container.innerHTML = '<p class="empty-text">No files attached to this task.</p>';
    return;
  }

  task.attachments.forEach(file => {
    const div = document.createElement('div');
    div.className = 'attachment-file-item';
    const sizeKB = Math.round(file.size / 102.4) / 10;
    div.innerHTML = `
      <div>
        <a href="/uploads/${file.filename}" target="_blank" download>${escapeHTML(file.originalname)}</a>
        <span class="file-meta">(&lt;${sizeKB} KB) • by ${escapeHTML(file.uploadedBy)}</span>
      </div>
      <div class="date-val">${formatTimeAgo(file.uploadedAt)}</div>
    `;
    container.appendChild(div);
  });
}

// Delete project
async function confirmDeleteProject(projId) {
  if (!confirm('Are you sure you want to delete this project? ALL tasks and comments under this project will be deleted permanently.')) return;
  try {
    await apiCall(`/api/projects/${projId}`, 'DELETE');
    await fetchProjects();
    renderProjects();
  } catch (err) {
    alert('Error deleting project: ' + err.message);
  }
}

// Export Timeline stages to Excel (HTML-XLS with Gantt chart)
function exportTimelineToExcel() {
  let activeProjId = document.getElementById('board-project-filter').value;
  if (!activeProjId || activeProjId === 'all') {
    if (state.projects.length === 0) { alert('No projects available to export.'); return; }
    activeProjId = state.projects[0].id;
    document.getElementById('board-project-filter').value = activeProjId;
    handleProjectFilterChange(activeProjId);
  }
  const proj = state.projects.find(p => p.id === activeProjId);
  if (!proj) { alert('Please select a project from the dropdown first.'); return; }

  const timeline = proj.timeline || DEFAULT_TIMELINE_STAGES;
  const companyName = state.settings.companyName || 'PRO-MFG';
  const customerName = proj.customerName || '';

  // Build Gantt bar cells (table-based Gantt that renders in Excel)
  const validStages = timeline.filter(s => s.startDate && s.endDate && s.duration > 0);
  let minTime = Infinity, maxTime = -Infinity;
  const oneDay = 24 * 60 * 60 * 1000;
  validStages.forEach(s => {
    const st = new Date(s.startDate).getTime();
    const en = new Date(s.endDate).getTime();
    if (st < minTime) minTime = st;
    if (en > maxTime) maxTime = en;
  });
  const totalDays = validStages.length > 0 ? Math.ceil((maxTime - minTime) / oneDay) + 1 : 1;

  // Generate milestone table rows
  let dataRows = '';
  timeline.forEach((stage, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    const prog = stage.progress || 0;
    const progColor = prog === 100 ? '#10b981' : prog >= 50 ? '#6366f1' : '#f59e0b';
    dataRows += `
      <tr>
        <td style="background:${bg}; font-weight:600; color:#1e293b;">${escapeHTML(stage.name)}</td>
        <td style="background:${bg}; text-align:center;">${stage.startDate || '—'}</td>
        <td style="background:${bg}; text-align:center;">${stage.endDate || '—'}</td>
        <td style="background:${bg}; text-align:center;">${stage.duration || 0}</td>
        <td style="background:${bg}; text-align:center; font-weight:700; color:${progColor};">${prog}%</td>
      </tr>`;
  });

  // Generate Gantt chart rows (table-cell based so Excel renders bars)
  let ganttRows = '';
  if (validStages.length > 0) {
    // Header row with date markers (every ~10 days)
    ganttRows += '<tr><td style="background:#1e293b; color:#fff; font-weight:700; width:180px;">Stage / Milestone</td>';
    const markers = Math.min(10, totalDays);
    for (let i = 0; i < markers; i++) {
      const dayOffset = Math.round((i / markers) * totalDays);
      const markerDate = new Date(minTime + dayOffset * oneDay);
      const label = markerDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      ganttRows += `<td style="background:#1e293b; color:#94a3b8; font-size:10px; text-align:center; padding:4px;">${label}</td>`;
    }
    ganttRows += '</tr>';

    timeline.forEach((stage, idx) => {
      const rowBg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
      ganttRows += `<tr><td style="background:${rowBg}; font-weight:600; font-size:11px; color:#334155; border-right:2px solid #cbd5e1; padding:4px 8px;">${escapeHTML(stage.name)}</td>`;

      for (let i = 0; i < markers; i++) {
        const segStart = minTime + Math.round((i / markers) * totalDays) * oneDay;
        const segEnd   = minTime + Math.round(((i + 1) / markers) * totalDays) * oneDay;

        let cellBg = rowBg;
        let cellContent = '';

        if (stage.startDate && stage.endDate && stage.duration > 0) {
          const stageStart = new Date(stage.startDate).getTime();
          const stageEnd   = new Date(stage.endDate).getTime();
          if (stageStart < segEnd && stageEnd > segStart) {
            const prog = stage.progress || 0;
            // Planned bar (light indigo)
            cellBg = '#c7d2fe';
            cellContent = '';
            // If progress covers this segment
            const progEnd = stageStart + (stageEnd - stageStart) * (prog / 100);
            if (progEnd > segStart) {
              cellBg = '#6366f1';  // Actual progress (solid indigo)
              cellContent = `<span style="color:#fff;font-size:9px;font-weight:700;">${prog > 0 && i === Math.floor(markers/2) ? prog+'%' : ''}</span>`;
            }
          }
        }
        ganttRows += `<td style="background:${cellBg}; text-align:center; height:22px; border:1px solid #e2e8f0;">${cellContent}</td>`;
      }
      ganttRows += '</tr>';
    });
  }

  // Build full HTML/XLS content
  const totalStages = timeline.length;
  const completedStages = timeline.filter(s => s.progress === 100).length;
  const avgProgress = totalStages > 0 ? Math.round(timeline.reduce((a, s) => a + (s.progress || 0), 0) / totalStages) : 0;

  const xlsContent = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:x="urn:schemas-microsoft-com:office:excel">
  <Worksheet ss:Name="Timeline Report">
    <Table>
    </Table>
  </Worksheet>
</Workbook>`;

  // Since XML Excel format has limitations with colors, use HTML-based Excel instead
  const htmlXls = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
  <x:ExcelWorksheet><x:Name>Timeline Plan</x:Name><x:WorksheetOptions>
  <x:Print><x:ValidPrinterInfo/><x:Orientation>Landscape</x:Orientation><x:FitWidth>1</x:FitWidth><x:FitHeight>0</x:FitHeight></x:Print>
  </x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 10px; }
    .title-cell { font-size: 18pt; font-weight: bold; color: #1e293b; border: none; }
    .subtitle-cell { font-size: 10pt; color: #6366f1; border: none; }
    .section-header { background: #1e293b; color: #ffffff; font-weight: bold; font-size: 11pt; }
    .col-header { background: #334155; color: #ffffff; font-weight: bold; }
  </style>
</head>
<body>
<table>
  <!-- Title Block -->
  <tr><td colspan="5" class="title-cell">${escapeHTML(proj.name)}</td></tr>
  <tr><td colspan="5" class="subtitle-cell">${companyName} Project Timeline Report${customerName ? ' — Customer: ' + escapeHTML(customerName) : ''}</td></tr>
  <tr><td colspan="5" class="subtitle-cell">Generated: ${new Date().toLocaleDateString('en-US', { dateStyle: 'full' })} &nbsp;|&nbsp; Schedule: ${proj.startDate || 'N/A'} to ${proj.endDate || 'N/A'}</td></tr>
  <tr><td colspan="5" style="border:none; height:8px;"></td></tr>

  <!-- Summary Row -->
  <tr>
    <td style="background:#f1f5f9; font-weight:bold;">Overall Progress</td>
    <td style="font-weight:bold; color:#6366f1;">${avgProgress}%</td>
    <td style="background:#f1f5f9; font-weight:bold;">Milestones Cleared</td>
    <td style="font-weight:bold;">${completedStages} of ${totalStages}</td>
    <td style="background:#f1f5f9;"></td>
  </tr>
  <tr><td colspan="5" style="border:none; height:8px;"></td></tr>

  <!-- Section: Milestone Data Table -->
  <tr><td colspan="5" class="section-header">📋 MILESTONE SCHEDULE</td></tr>
  <tr>
    <th class="col-header">Milestone Name</th>
    <th class="col-header" style="text-align:center;">Start Date</th>
    <th class="col-header" style="text-align:center;">End Date</th>
    <th class="col-header" style="text-align:center;">Duration (Days)</th>
    <th class="col-header" style="text-align:center;">Actual Progress (%)</th>
  </tr>
  ${dataRows}
  <tr><td colspan="5" style="border:none; height:16px;"></td></tr>

  <!-- Section: Gantt Chart -->
  ${validStages.length > 0 ? `
  <tr><td colspan="${10 + 1}" class="section-header">📊 GANTT CHART — Planned vs. Actual Progress</td></tr>
  ${ganttRows}
  ` : '<tr><td colspan="5" style="color:#94a3b8; text-align:center; padding:16px;">No dates set — Gantt chart unavailable.</td></tr>'}

  <tr><td colspan="5" style="border:none; height:20px;"></td></tr>
  <tr><td colspan="5" style="border:none; color:#94a3b8; font-size:9pt;">Report generated by Project &amp; Task Management • Powered by ${companyName}</td></tr>
</table>
</body>
</html>`;

  const blob = new Blob([htmlXls], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', `timeline_${proj.name.replace(/[^a-z0-9]/gi, '_').substring(0,40)}.xls`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Export Timeline stages and Gantt view to PDF via print window
function exportTimelineToPDF() {
  let activeProjId = document.getElementById('board-project-filter').value;
  if (!activeProjId || activeProjId === 'all') {
    if (state.projects.length === 0) { alert('No projects available.'); return; }
    activeProjId = state.projects[0].id;
    document.getElementById('board-project-filter').value = activeProjId;
    handleProjectFilterChange(activeProjId);
  }
  const proj = state.projects.find(p => p.id === activeProjId);
  if (!proj) { alert('Please select a project.'); return; }

  const timeline = proj.timeline || DEFAULT_TIMELINE_STAGES;
  const totalStages = timeline.length;
  const completedStages = timeline.filter(s => s.progress === 100).length;
  const totalProgress = timeline.reduce((acc, stage) => acc + (stage.progress || 0), 0);
  const avgProgress = totalStages > 0 ? Math.round(totalProgress / totalStages) : 0;

  const printWindow = window.open('', '_blank', 'width=1100,height=850');
  
  // PDF Header: Customer logo + name at top. No PRO-MFG logo shown.
  const companyName = state.settings.companyName || 'PRO-MFG';
  const customerLogoFilename = proj.customerLogo;
  const customerName = proj.customerName || '';

  // Customer header block (shown prominently at top)
  const customerHeaderHtml = customerName
    ? `
      <div class="customer-block">
        ${customerLogoFilename ? `<img src="/uploads/${customerLogoFilename}" class="customer-logo" alt="${escapeHTML(customerName)} Logo">` : ''}
        <div class="customer-info">
          <div class="customer-label">Customer</div>
          <div class="customer-name">${escapeHTML(customerName)}</div>
        </div>
      </div>
    `
    : `<div class="customer-block"><div class="customer-info"><div class="customer-label">Internal Project</div></div></div>`;

  // Not used anymore but keep variable to avoid errors
  const companyLogoHtml = '';
  const customerLogoHtml = '';

  // Generate Table rows
  let rowsHtml = '';
  timeline.forEach(stage => {
    rowsHtml += `
      <tr>
        <td style="font-weight:600;">${escapeHTML(stage.name)}</td>
        <td>${stage.startDate || 'N/A'}</td>
        <td>${stage.endDate || 'N/A'}</td>
        <td style="text-align:right;">${stage.duration || 0}</td>
        <td style="text-align:right; font-weight:700;">${stage.progress || 0}%</td>
      </tr>
    `;
  });

  // Calculate Gantt Timeline details for printing
  const validStages = timeline.filter(s => s.startDate && s.endDate && s.duration > 0);
  let ganttPrintHtml = '<div class="empty-state">No timeline dates set to generate Gantt plan.</div>';

  if (validStages.length > 0) {
    let minTime = Infinity;
    let maxTime = -Infinity;
    validStages.forEach(s => {
      const start = new Date(s.startDate).getTime();
      const end = new Date(s.endDate).getTime();
      if (start < minTime) minTime = start;
      if (end > maxTime) maxTime = end;
    });

    const oneDay = 24 * 60 * 60 * 1000;
    const totalDays = Math.ceil((maxTime - minTime) / oneDay) + 1;

    ganttPrintHtml = '<div class="gantt-table">';
    timeline.forEach(stage => {
      let barMarkup = '';
      if (stage.startDate && stage.endDate && stage.duration > 0) {
        const start = new Date(stage.startDate).getTime();
        const end = new Date(stage.endDate).getTime();
        const offsetDays = Math.ceil((start - minTime) / oneDay);
        const durationDays = Math.ceil((end - start) / oneDay) + 1;
        const leftPct = (offsetDays / totalDays) * 100;
        const widthPct = (durationDays / totalDays) * 100;

        barMarkup = `
          <div class="gantt-bar-fill" style="left: ${leftPct}%; width: ${widthPct}%;">
            <div class="gantt-bar-progress" style="width: ${stage.progress || 0}%;"></div>
            <span class="gantt-bar-label">	ext-align:${durationDays}d (${stage.progress || 0}%)</span>
          </div>
        `;
      }
      ganttPrintHtml += `
        <div class="gantt-row">
          <div class="gantt-stage-name">${escapeHTML(stage.name)}</div>
          <div class="gantt-bar-container">${barMarkup}</div>
        </div>
      `;
    });
    ganttPrintHtml += '</div>';
  }

  printWindow.document.write(`
    <html>
    <head>
      <title>Project Timeline Report - ${escapeHTML(proj.name)}</title>
      <style>
        @page { size: A4 landscape; margin: 12mm 15mm; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        body {
          font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;
          color: #0f172a;
          padding: 24px 32px;
          margin: 0;
          background-color: #ffffff;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        .customer-block {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .customer-logo {
          max-height: 64px;
          max-width: 180px;
          object-fit: contain;
          border-radius: 6px;
        }
        .customer-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .customer-label {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: #94a3b8;
        }
        .customer-name {
          font-size: 1.6rem;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.2;
        }
        .report-meta {
          text-align: right;
        }
        .report-label {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: #94a3b8;
        }
        .report-date {
          font-size: 1rem;
          font-weight: 600;
          color: #334155;
        }
        .project-details {
          margin-bottom: 30px;
        }
        .project-details h1 {
          font-size: 2rem;
          margin: 0 0 10px 0;
          color: #0f172a;
        }
        .project-details p {
          margin: 4px 0;
          color: #475569;
          font-size: 0.95rem;
        }
        .dashboard-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 30px;
        }
        .metric-card {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px;
          background-color: #f8fafc;
        }
        .metric-card h4 {
          margin: 0 0 6px 0;
          font-size: 0.85rem;
          color: #677489;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .metric-card .value {
          font-size: 1.5rem;
          font-weight: 700;
          color: #0f172a;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 40px;
        }
        th, td {
          border: 1px solid #cbd5e1;
          padding: 10px 12px;
          text-align: left;
          font-size: 0.9rem;
        }
        th {
          background-color: #f1f5f9;
          color: #334155;
          font-weight: 600;
        }
        .gantt-section {
          page-break-inside: avoid;
        }
        .gantt-section h3 {
          font-size: 1.25rem;
          margin-bottom: 16px;
          color: #0f172a;
        }
        .gantt-table {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          overflow: hidden;
        }
        .gantt-row {
          display: flex;
          border-bottom: 1px solid #e2e8f0;
          height: 40px;
          align-items: center;
        }
        .gantt-row:last-child {
          border-bottom: none;
        }
        .gantt-stage-name {
          width: 180px;
          padding: 0 12px;
          font-size: 0.8rem;
          font-weight: 600;
          color: #334155;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          border-right: 1px solid #e2e8f0;
        }
        .gantt-bar-container {
          flex: 1;
          position: relative;
          height: 100%;
          background-color: #f8fafc;
        }
        .gantt-bar-fill {
          position: absolute;
          top: 8px;
          height: 24px;
          background-color: rgba(99, 102, 241, 0.15);
          border: 1px solid #6366f1;
          border-radius: 4px;
          display: flex;
          align-items: center;
          overflow: hidden;
        }
        .gantt-bar-progress {
          height: 100%;
          background-color: #6366f1;
        }
        .gantt-bar-label {
          position: absolute;
          left: 8px;
          color: #312e81;
          font-size: 0.75rem;
          font-weight: 700;
        }
        .empty-state {
          padding: 20px;
          text-align: center;
          color: #64748b;
          font-size: 0.9rem;
          border: 1px dashed #cbd5e1;
          border-radius: 8px;
        }
        .footer {
          margin-top: 50px;
          border-top: 1px solid #e2e8f0;
          padding-top: 16px;
          text-align: center;
          font-size: 0.8rem;
          color: #64748b;
        }
      </style>
    </head>
    <body>
      <div class="header">
        ${customerHeaderHtml}
        <div class="report-meta">
          <div class="report-label">Timeline Report</div>
          <div class="report-date">${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}</div>
        </div>
      </div>

      <div class="project-details">
        <h1>${escapeHTML(proj.name)}</h1>
        <p>${escapeHTML(proj.description || 'No description provided.')}</p>
        <p style="margin-top: 8px;">Planned Work Schedule: <strong>${proj.startDate || 'N/A'}</strong> to <strong>${proj.endDate || 'N/A'}</strong></p>
      </div>

      <div class="dashboard-row">
        <div class="metric-card">
          <h4>Overall Progress</h4>
          <div class="value">${avgProgress}%</div>
        </div>
        <div class="metric-card">
          <h4>Milestones Cleared</h4>
          <div class="value">${completedStages} of ${totalStages}</div>
        </div>
        <div class="metric-card">
          <h4>Report Generated</h4>
          <div class="value" style="font-size: 1.1rem; line-height: 2.1rem;">${new Date().toLocaleDateString('en-US', { dateStyle: 'medium' })}</div>
        </div>
      </div>

      <h3>Milestones Schedule & Progress</h3>
      <table>
        <thead>
          <tr>
            <th>Milestone Name</th>
            <th>Planned Start</th>
            <th>Planned End</th>
            <th style="text-align:right;">Duration (Days)</th>
            <th style="text-align:right;">Actual Progress</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="gantt-section">
        <h3>Planned Timeline vs. Actual Progress (Gantt Chart)</h3>
        ${ganttPrintHtml}
      </div>

      <div class="footer">
        ${escapeHTML(proj.name)} — Timeline Report &nbsp;|&nbsp; Confidential &nbsp;|&nbsp; ${new Date().toLocaleDateString()}
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
            window.close();
          }, 300);
        }
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}


// Dashboard metric card click navigation
function navigateToDashboardCard(view, statusFilter) {
  if (view === 'projects') {
    navigateTo('projects');
    return;
  }

  if (view === 'tasks') {
    navigateTo('tasks');

    // After a short delay (let the view render), switch to list view and apply status filter
    setTimeout(() => {
      // Switch to List View so status filter is visible
      const viewTypeSelect = document.getElementById('board-view-type');
      if (viewTypeSelect) {
        viewTypeSelect.value = 'list';
        renderKanbanBoard();
      }

      // Scroll to and highlight the relevant kanban column in board view
      if (statusFilter) {
        // For list view: filter tasks by status
        const col = document.getElementById('col-' + statusFilter);
        if (col) {
          viewTypeSelect.value = 'board';
          renderKanbanBoard();
          setTimeout(() => {
            col.scrollIntoView({ behavior: 'smooth', block: 'start' });
            col.style.transition = 'box-shadow 0.3s ease';
            col.style.boxShadow = '0 0 0 3px var(--primary-color)';
            setTimeout(() => { col.style.boxShadow = ''; }, 2000);
          }, 150);
        }
      }
    }, 100);
  }
}

function setupEventListeners() {
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  document.querySelectorAll('.nav-link, .mobile-nav-item').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        const viewId = href.substring(1);
        navigateTo(viewId);
      }
    });
  });

  document.querySelectorAll('.project-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      navigateToSubTab(tabName);
    });
  });

  // Switch between login / signup views
  document.getElementById('link-go-signup').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-card').classList.add('hidden');
    document.getElementById('signup-card').classList.remove('hidden');
    document.getElementById('signup-error').classList.add('hidden');
  });

  document.getElementById('link-go-login').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('signup-card').classList.add('hidden');
    document.getElementById('login-card').classList.remove('hidden');
    document.getElementById('login-error').classList.add('hidden');
  });

  document.getElementById('link-restart-signup').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('otp-card').classList.add('hidden');
    document.getElementById('signup-card').classList.remove('hidden');
  });

  // PR Trackers listeners
  const btnCreatePR = document.getElementById('btn-create-pr');
  if (btnCreatePR) btnCreatePR.addEventListener('click', openPRFormModal);
  
  const btnAddPRRow = document.getElementById('btn-pr-add-row');
  if (btnAddPRRow) btnAddPRRow.addEventListener('click', addPRItemRow);
  
  const prForm = document.getElementById('pr-form');
  if (prForm) prForm.addEventListener('submit', onPRFormSubmit);
  
  const prProjFilter = document.getElementById('pr-project-filter');
  if (prProjFilter) prProjFilter.addEventListener('change', renderPRTable);
  
  const prStatFilter = document.getElementById('pr-status-filter');
  if (prStatFilter) prStatFilter.addEventListener('change', renderPRTable);

  // Login Submit
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.classList.add('hidden');

    try {
      const data = await apiCall('/api/auth/login', 'POST', { email, password });
      state.token = data.token;
      state.currentUser = data.user;
      localStorage.setItem('pm_token', data.token);
      
      await fetchSettings();
      showApp();
      initSocket();
      navigateTo('portal');
      apiCall('/api/notifications/check-due-dates', 'POST').catch(console.error);
    } catch (err) {
      errorEl.textContent = err.message || 'Invalid email or password.';
      errorEl.classList.remove('hidden');
    }
  });

  // Sign Up Submit
  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const department = document.getElementById('signup-dept').value;
    const errorEl = document.getElementById('signup-error');
    errorEl.classList.add('hidden');

    try {
      const resData = await apiCall('/api/auth/signup', 'POST', { name, email, password, department });
      signupEmail = email;
      
      // Navigate to OTP verification card
      document.getElementById('signup-card').classList.add('hidden');
      document.getElementById('otp-card').classList.remove('hidden');
      document.getElementById('otp-email-display').value = email;
      
      // Auto-fill OTP if provided by server (Beta/Demo mode without real email SMTP)
      if (resData && resData.demoOtp) {
        document.getElementById('otp-code').value = resData.demoOtp;
      } else {
        document.getElementById('otp-code').value = '';
      }
      
      document.getElementById('otp-error').classList.add('hidden');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  });

  // OTP Verification Submit
  document.getElementById('otp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const otp = document.getElementById('otp-code').value;
    const errorEl = document.getElementById('otp-error');
    errorEl.classList.add('hidden');

    try {
      const data = await apiCall('/api/auth/verify-otp', 'POST', { email: signupEmail, otp });
      state.token = data.token;
      state.currentUser = data.user;
      localStorage.setItem('pm_token', data.token);
      
      await fetchSettings();
      showApp();
      initSocket();
      navigateTo('portal');
      apiCall('/api/notifications/check-due-dates', 'POST').catch(console.error);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  });

  document.getElementById('btn-logout').addEventListener('click', logout);

  const bell = document.getElementById('btn-notifications');
  const dropdown = document.getElementById('notification-dropdown');
  
  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.classList.contains('hidden') && !dropdown.contains(e.target) && e.target !== bell) {
      dropdown.classList.add('hidden');
    }
  });

  document.getElementById('btn-clear-notifications').addEventListener('click', async () => {
    try {
      await apiCall('/api/notifications/read-all', 'POST');
      await fetchNotifications();
      renderNotifications();
    } catch (err) {
      console.error(err);
    }
  });

  document.getElementById('project-search-input').addEventListener('input', renderProjects);

  document.getElementById('board-project-filter').addEventListener('change', (e) => {
    const selected = e.target.value;
    renderKanbanBoard();
    handleProjectFilterChange(selected);
  });

  const boardAssigneeFilter = document.getElementById('board-assignee-filter');
  if (boardAssigneeFilter) {
    boardAssigneeFilter.addEventListener('change', renderKanbanBoard);
  }

  const boardPriorityFilter = document.getElementById('board-priority-filter');
  if (boardPriorityFilter) {
    boardPriorityFilter.addEventListener('change', renderKanbanBoard);
  }
  
  document.getElementById('board-view-type').addEventListener('change', renderKanbanBoard);

  document.querySelectorAll('.btn-close-modal, .btn-close-modal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    });
  });

  document.getElementById('btn-delete-task').addEventListener('click', async () => {
    if (!state.selectedTaskId) return;
    if (!confirm('Are you sure you want to delete this task permanently?')) return;
    try {
      await apiCall(`/api/tasks/${state.selectedTaskId}`, 'DELETE');
      document.getElementById('modal-task-details').classList.remove('active');
      await fetchTasks();
      renderKanbanBoard();
    } catch (err) {
      alert('Failed to delete task: ' + err.message);
    }
  });

  // User form
  document.getElementById('user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('user-id-field').value;
    const name = document.getElementById('user-name').value;
    const email = document.getElementById('user-email').value;
    const password = document.getElementById('user-password').value;
    let department = document.getElementById('user-dept').value;
    if (state.currentUser.role === 'department_head') {
      department = state.currentUser.department; // enforce localized department
    }
    const role = document.getElementById('user-role').value;
    const status = document.getElementById('user-status').value;
    
    // Read module permission checkboxes (Force all true for admins)
    const isAdminRole = role === 'admin' || role === 'superadmin' || role === 'owner';
    const permissions = isAdminRole ? { projects: true, bom: true, rfq: true, pr: true } : {
      projects: document.getElementById('user-perm-projects').checked,
      bom: document.getElementById('user-perm-bom').checked,
      rfq: document.getElementById('user-perm-rfq').checked,
      pr: document.getElementById('user-perm-pr').checked
    };
    
    const body = { name, email, role, department, status, permissions };
    if (password) body.password = password;

    try {
      if (userId) {
        await apiCall(`/api/users/${userId}`, 'PUT', body);
      } else {
        await apiCall('/api/users', 'POST', body);
      }
      
      document.getElementById('modal-user-form').classList.remove('active');
      await fetchUsers();
      renderTeam();
    } catch (err) {
      const errorMsg = document.getElementById('user-error');
      errorMsg.textContent = err.message;
      errorMsg.classList.remove('hidden');
    }
  });

  // Project form (Handles Customer Logo Uploads)
  document.getElementById('project-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const projId = document.getElementById('project-id-field').value;
    const name = document.getElementById('project-name').value;
    const description = document.getElementById('project-description').value;
    const startDate = document.getElementById('project-startdate').value;
    const endDate = document.getElementById('project-enddate').value;
    const customerName = document.getElementById('project-customer-name').value;
    
    const checkboxes = document.querySelectorAll('#project-members-checkboxes input[type="checkbox"]:checked');
    const members = Array.from(checkboxes).map(cb => cb.value);

    const body = { name, description, startDate, endDate, members, customerName };

    try {
      let savedProject;
      if (projId) {
        savedProject = await apiCall(`/api/projects/${projId}`, 'PUT', body);
      } else {
        savedProject = await apiCall('/api/projects', 'POST', body);
      }

      // Handle customer logo upload if file is selected
      const logoInput = document.getElementById('project-customer-logo');
      if (logoInput.files.length > 0) {
        const formData = new FormData();
        formData.append('customerLogo', logoInput.files[0]);
        await apiCall(`/api/projects/${savedProject.id}/customer-logo`, 'POST', formData, true);
      }
      
      document.getElementById('modal-project-form').classList.remove('active');
      await fetchProjects();
      renderProjects();
    } catch (err) {
      alert(err.message);
    }
  });

  // Task form
  document.getElementById('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const taskId = document.getElementById('task-id-field').value;
    const projectId = document.getElementById('task-project').value;
    const title = document.getElementById('task-title').value;
    const description = document.getElementById('task-description').value;
    const assigneeId = document.getElementById('task-assignee').value;
    const priority = document.getElementById('task-priority').value;
    const status = document.getElementById('task-status').value;
    const dueDate = document.getElementById('task-duedate').value;

    const body = { 
      projectId, 
      title, 
      description, 
      assigneeId, 
      priority, 
      status, 
      dueDate,
      startDate: document.getElementById('task-startdate')?.value || '',
      allocatedOperator: document.getElementById('task-allocated-operator')?.value || '',
      operatorRole: document.getElementById('task-operator-role')?.value || 'None',
      mappedDuration: parseFloat(document.getElementById('task-mapped-duration')?.value) || 0
    };

    try {
      if (taskId) {
        await apiCall(`/api/tasks/${taskId}`, 'PUT', body);
      } else {
        await apiCall('/api/tasks', 'POST', body);
      }
      
      document.getElementById('modal-task-form').classList.remove('active');
      await fetchTasks();
      renderKanbanBoard();
    } catch (err) {
      alert(err.message);
    }
  });

  // Super Admin add department form submit
  document.getElementById('department-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('new-dept-name');
    const name = input.value.trim();
    if (!name) return;

    try {
      await apiCall('/api/departments', 'POST', { name });
      input.value = '';
      await fetchDepartments();
      renderDepartmentsCRUD();
    } catch (err) {
      alert(err.message);
    }
  });

  // Super Admin Branding configuration forms submit
  document.getElementById('branding-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const companyName = document.getElementById('company-name-input').value.trim();
    if (!companyName) return;

    try {
      await apiCall('/api/settings', 'PUT', { companyName });
      alert('Company Name updated successfully!');
      await fetchSettings();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('branding-logo-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('company-logo-file-input');
    if (fileInput.files.length === 0) return;

    const formData = new FormData();
    formData.append('companyLogo', fileInput.files[0]);

    try {
      await apiCall('/api/settings/logo', 'POST', formData, true);
      alert('Company Logo uploaded successfully!');
      fileInput.value = '';
      await fetchSettings();
      renderTeam();
    } catch (err) {
      alert(err.message);
    }
  });

  // Detail status selector
  document.getElementById('detail-task-status-select').addEventListener('change', async (e) => {
    const newStatus = e.target.value;
    const taskId = state.selectedTaskId;
    if (!taskId) return;

    try {
      await apiCall(`/api/tasks/${taskId}`, 'PUT', { status: newStatus });
      await fetchTasks();
      
      const task = state.tasks.find(t => t.id === taskId);
      if (task) task.status = newStatus;
      
      renderKanbanBoard();
    } catch (err) {
      alert(err.message);
    }
  });

  // Comments
  document.getElementById('comment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('comment-input');
    const text = input.value.trim();
    const taskId = state.selectedTaskId;
    if (!text || !taskId) return;

    try {
      await apiCall(`/api/tasks/${taskId}/comments`, 'POST', { text });
      input.value = '';
      renderTaskComments(taskId);
    } catch (err) {
      alert(err.message);
    }
  });

  // Attachment display
  const fileInput = document.getElementById('attachment-file-input');
  const fileNameText = document.getElementById('attachment-file-name');
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      fileNameText.textContent = fileInput.files[0].name;
    } else {
      fileNameText.textContent = 'No file chosen';
    }
  });

  // File Upload
  document.getElementById('attachment-upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const taskId = state.selectedTaskId;
    if (!taskId || fileInput.files.length === 0) return;

    const formData = new FormData();
    formData.append('attachment', fileInput.files[0]);

    try {
      const data = await apiCall(`/api/tasks/${taskId}/attachments`, 'POST', formData, true);
      alert('File uploaded successfully!');
      
      const task = state.tasks.find(t => t.id === taskId);
      if (task) {
        if (!task.attachments) task.attachments = [];
        task.attachments.push(data.attachment);
      }
      
      fileInput.value = '';
      fileNameText.textContent = 'No file chosen';
      renderTaskAttachments(task);
      
    } catch (err) {
      alert('Failed to upload file: ' + err.message);
    }
  });

  document.getElementById('btn-create-project').addEventListener('click', () => openProjectFormModal());
  document.getElementById('btn-create-user').addEventListener('click', () => openUserFormModal());
  document.getElementById('btn-create-task').addEventListener('click', () => openTaskFormModal());

  // Excel & PDF timeline exports listeners
  document.getElementById('btn-export-excel').addEventListener('click', exportTimelineToExcel);
  document.getElementById('btn-export-pdf').addEventListener('click', exportTimelineToPDF);

  initKanbanDropzones();
  setupBillingModal();

  // Hide permission checkboxes if role is Super Admin / Admin / Owner
  document.getElementById('user-role')?.addEventListener('change', (e) => {
    const val = e.target.value;
    const permGroup = document.getElementById('user-permissions-group');
    if (permGroup) {
      if (val === 'admin' || val === 'superadmin' || val === 'owner') {
        permGroup.classList.add('hidden');
      } else {
        permGroup.classList.remove('hidden');
      }
    }
  });



  // BOM Project selector change
  document.getElementById('bom-project-select')?.addEventListener('change', async (e) => {
    const projectId = e.target.value;
    const globalSelect = document.getElementById('global-project-select');
    if (globalSelect) {
      globalSelect.value = projectId;
    }
    if (projectId) {
      await fetchBOMItems(projectId);
    } else {
      state.bomItems = [];
    }
    renderBOMDashboard();
    renderBOMTable();
  });

  // BOM Category / Status Filters
  document.getElementById('bom-filter-category')?.addEventListener('change', () => {
    renderBOMDashboard();
    renderBOMTable();
  });
  document.getElementById('bom-filter-status')?.addEventListener('change', () => {
    renderBOMDashboard();
    renderBOMTable();
  });

  // Inline BOM Status change dropdown listener
  document.addEventListener('change', async (e) => {
    if (e.target.classList.contains('bom-status-row-select')) {
      const bomId = e.target.getAttribute('data-id');
      const newStatus = e.target.value;
      await handleBOMStatusChange(bomId, newStatus);
    }
  });

  // BOM manual modal trigger
  document.getElementById('btn-add-bom-item')?.addEventListener('click', () => {
    const projectId = document.getElementById('bom-project-select').value;
    if (!projectId) {
      alert('Please select a project first.');
      return;
    }
    document.getElementById('bom-form').reset();
    document.getElementById('bom-id-field').value = '';
    document.getElementById('bom-winner').value = '';
    document.getElementById('bom-modal-title').textContent = 'Add BOM Item';
    document.getElementById('bom-error').classList.add('hidden');
    document.getElementById('modal-bom').classList.add('active');
  });

  // BOM Form submit
  document.getElementById('bom-form')?.addEventListener('submit', handleBOMSubmit);

  // Edit / Delete BOM manual buttons
  document.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.btn-edit-bom');
    if (editBtn) {
      const bomId = editBtn.getAttribute('data-id');
      handleBOMEdit(bomId);
    }
    const delBtn = e.target.closest('.btn-delete-bom');
    if (delBtn) {
      const bomId = delBtn.getAttribute('data-id');
      await handleBOMDelete(bomId);
    }
  });

  // Export BOM CSV button
  document.getElementById('btn-export-bom')?.addEventListener('click', exportBOMToCSV);
  document.getElementById('btn-download-bom-template')?.addEventListener('click', downloadBOMTemplate);

  // CSV Bulk Import Change
  document.getElementById('bom-csv-file')?.addEventListener('change', async (e) => {
    const projectId = document.getElementById('bom-project-select').value;
    if (!projectId) {
      alert('Please select a project first.');
      e.target.value = '';
      return;
    }
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const csvText = evt.target.result;
      const parsedItems = parseCSVForBOM(csvText);
      if (parsedItems.length === 0) {
        alert('No valid items found in CSV.');
        return;
      }
      try {
        await apiCall('/api/projects/' + projectId + '/bom/import', 'POST', { items: parsedItems });
        alert('Successfully imported BOM items.');
        await fetchBOMItems(projectId);
        renderBOMDashboard();
        renderBOMTable();
      } catch (err) {
        console.error('Error importing BOM items:', err);
        alert('Failed to import BOM CSV.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });
}

// ==================== DATE/TIME UTILITIES ====================
function formatDateMini(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateFull(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatRoleTitle(role) {
  if (!role) return '';
  const r = role.toLowerCase();
  if (r === 'md') return 'MD';
  if (r === 'admin') return 'Admin';
  if (r === 'superadmin') return 'Super Admin';
  if (r === 'project_manager') return 'Project Manager';
  if (r === 'operations_head') return 'Operations Head';
  if (r === 'member') return 'Member';
  if (r === 'owner') return 'Owner';
  return role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// Date difference checker
function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString();
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


// Subscription & Admin Approval Logic
async function approveUser(id) {
  if (!confirm('Approve this user and upgrade them to Pro Plan?')) return;
  try {
    await apiCall(`/api/users/${id}/approve`, 'POST');
    await fetchUsers();
    renderTeam();
  } catch (err) {
    alert(err.message);
  }
}

async function denyUser(id) {
  if (!confirm('Deny/Deactivate this user?')) return;
  try {
    await apiCall(`/api/users/${id}/deny`, 'POST');
    await fetchUsers();
    renderTeam();
  } catch (err) {
    alert(err.message);
  }
}

function setupBillingModal() {
  const trialBanner = document.getElementById('trial-sidebar-banner');
  if (trialBanner) {
    trialBanner.addEventListener('click', () => {
      document.getElementById('modal-billing').classList.add('active');
      renderBillingPlans();
    });
  }

  const btnBilling = document.getElementById('btn-billing');
  if (btnBilling) {
    btnBilling.addEventListener('click', () => {
      document.getElementById('modal-billing').classList.add('active');
      renderBillingPlans();
    });
  }

  // Handle Monthly/Yearly toggle click
  const toggleYearly = document.getElementById('billing-toggle-yearly');
  const toggleMonthly = document.getElementById('billing-toggle-monthly');
  
  if (toggleYearly && toggleMonthly) {
    toggleYearly.addEventListener('click', () => {
      toggleYearly.classList.add('active');
      toggleMonthly.classList.remove('active');
      updatePlanPrices('yearly');
    });
    toggleMonthly.addEventListener('click', () => {
      toggleMonthly.classList.add('active');
      toggleYearly.classList.remove('active');
      updatePlanPrices('monthly');
    });
  }

  function updatePlanPrices(mode) {
    document.querySelectorAll('.pricing-card').forEach(card => {
      const priceVal = card.querySelector('.price-val');
      if (priceVal) {
        const val = priceVal.getAttribute(`data-${mode}`);
        if (val) priceVal.textContent = val;
      }
    });
  }

  function renderBillingPlans() {
    const currentPlan = state.currentUser.plan || 'Free Trial';

    // Reset all cards
    document.querySelectorAll('.pricing-card').forEach(card => {
      card.classList.remove('active-plan-card');
      const badge = card.querySelector('.pricing-card-badge');
      if (badge && badge.textContent === '✓ Current Plan') {
        badge.textContent = card.id === 'card-Starter' ? '14-Day Free Trial' : (card.id === 'card-Growth' ? 'Most Popular' : 'Best Value');
      }
      const btn = card.querySelector('.btn-select-plan');
      if (btn) {
        btn.disabled = false;
        const planName = btn.getAttribute('data-plan');
        if (planName === 'Starter') {
          btn.style.background = 'transparent';
          btn.style.border = '2px solid #4f46e5';
          btn.style.color = '#4f46e5';
        } else if (planName === 'Growth') {
          btn.style.background = '#d97706';
          btn.style.border = '2px solid #d97706';
          btn.style.color = '#ffffff';
        } else if (planName === 'Business') {
          btn.style.background = '#0284c7';
          btn.style.border = '2px solid #0284c7';
          btn.style.color = '#ffffff';
        } else if (planName === 'Enterprise') {
          btn.style.background = '#0f172a';
          btn.style.border = '2px solid #0f172a';
          btn.style.color = '#ffffff';
          btn.textContent = 'Contact Sales';
        }
        if (planName !== 'Enterprise') {
          btn.textContent = `Get ${planName}`;
        }
      }
    });

    // Mark current active plan card
    const activeCard = document.getElementById(`card-${currentPlan}`);
    if (activeCard) {
      activeCard.classList.add('active-plan-card');
      let badge = activeCard.querySelector('.pricing-card-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'pricing-card-badge';
        activeCard.appendChild(badge);
      }
      badge.textContent = '✓ Current Plan';
      const btn = activeCard.querySelector('.btn-select-plan');
      if (btn) {
        btn.textContent = '✓ Current Plan';
        btn.disabled = true;
        btn.style.background = '#10b981';
        btn.style.border = '2px solid #10b981';
        btn.style.color = '#ffffff';
      }
    }

    // Set toggle state to yearly by default
    if (toggleYearly) {
      toggleYearly.click();
    }
  }

  // Hook select plan buttons
  document.querySelectorAll('.btn-select-plan').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const plan = btn.getAttribute('data-plan');
      const mrr = parseInt(btn.getAttribute('data-mrr'), 10);
      
      if (plan === 'Enterprise') {
        alert(`Thank you for your interest in our Enterprise setup! Our team will contact you at ${state.currentUser.email} to provide a custom quote.`);
        return;
      }

      const billText = document.getElementById('billing-toggle-yearly').classList.contains('active') 
        ? `₹${plan === 'Starter' ? '2,999' : (plan === 'Growth' ? '7,999' : '14,999')}/month, billed annually`
        : `₹${plan === 'Starter' ? '3,599' : (plan === 'Growth' ? '9,599' : '17,999')}/month, billed monthly`;

      if (!confirm(`Are you sure you want to upgrade to the ${plan} plan (${billText})?`)) {
        return;
      }

      btn.textContent = 'Processing...';
      btn.disabled = true;

      try {
        const res = await apiCall('/api/org/checkout', 'POST', { plan, mrr });
        alert(`Payment successful! Your organization workspace is now upgraded to the ${plan} Plan.`);
        state.currentUser = res.user;
        showApp(); // Re-render permissions
        document.getElementById('modal-billing').classList.remove('active');
      } catch (err) {
        alert(err.message);
        btn.textContent = `Get ${plan}`;
        btn.disabled = false;
      }
    });
  });
}

// ==================== REAL-TIME WEBSOCKETS ====================
let socket;
function initSocket() {
  if (socket) return;
  if (typeof io === 'undefined') {
    console.warn('Socket.io client library not loaded.');
    return;
  }
  
  socket = io({
    auth: { token: state.token }
  });

  socket.on('connect', () => {
    console.log('Connected to real-time server');
  });

  socket.on('data_updated', async () => {
    console.log('Real-time update received');
    // Silently fetch fresh data
    await Promise.all([
      fetchProjects(),
      fetchTasks(),
      fetchUsers(),
      fetchDepartments(),
      fetchSettings()
    ]);
    
    // Refresh the currently active view
    const activeNav = document.querySelector('.nav-link.active');
    if (activeNav) {
      const target = activeNav.getAttribute('data-target');
      if (target === 'view-dashboard') renderDashboard();
      else if (target === 'view-projects') renderProjects();
      else if (target === 'view-tasks') renderTaskBoard();
      else if (target === 'view-team') renderTeamSettings();
      else if (target === 'view-rfq') { renderRFQDashboard(); renderRFQTable(); renderRFQCharts(); }
      else if (target === 'view-pr') {
        await fetchPRs();
        renderPRDashboard();
        renderPRTable();
      }
      else if (target === 'view-bom') {
        const projectId = document.getElementById('bom-project-select')?.value;
        if (projectId) {
          await fetchBOMItems(projectId);
        } else {
          state.bomItems = [];
        }
        renderBOMDashboard();
        renderBOMTable();
      }
    }

    // Refresh notifications
    fetchNotifications().then(renderNotifications).catch(console.error);
    
    // Refresh task details modal if open
    const detailModal = document.getElementById('modal-task-details');
    if (detailModal && detailModal.classList.contains('active')) {
      const activeTitle = document.getElementById('detail-task-title').textContent;
      const t = state.tasks.find(x => x.title === activeTitle);
      if (t) {
        renderTaskDetailsComments(t);
        renderTaskDetailsAttachments(t);
      }
    }
  });
}

// ==================== RFQ TRACKING MODULE ====================
let rfqState = { rfqs: [], editingId: null, charts: {} };
const RFQ_STATUSES = ['New','Under Review','Engineering','Costing','Waiting for Vendor','Quote Ready','Submitted','Won','Lost','Closed'];
const RFQ_OPEN_STATUSES = ['New','Under Review','Engineering','Costing','Waiting for Vendor','Quote Ready'];
const RFQ_DONE_STATUSES = ['Won','Closed'];

async function fetchRFQs() {
  rfqState.rfqs = await apiCall('/api/rfqs');
}

function navigateToRFQ() {
  fetchRFQs().then(() => {
    populateRFQCustomerFilter();
    renderRFQDashboard();
    renderRFQTable();
    renderRFQCharts();
  }).catch(console.error);
}

function populateRFQCustomerFilter() {
  const select = document.getElementById('rfq-filter-customer');
  if (!select) return;
  const currentVal = select.value;
  const customers = [...new Set(rfqState.rfqs.map(r => r.customerName).filter(Boolean))].sort();
  select.innerHTML = '<option value="">All Customers</option>' + 
    customers.map(cust => `<option value="${escapeHTML(cust)}">${escapeHTML(cust)}</option>`).join('');
  select.value = currentVal;
}

function renderRFQDashboard() {
  populateRFQCustomerFilter();
  const rfqs = rfqState.rfqs;
  const today = new Date(); today.setHours(0,0,0,0);
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);

  document.getElementById('rfq-stat-total').textContent = rfqs.length;
  document.getElementById('rfq-stat-open').textContent = rfqs.filter(r => RFQ_OPEN_STATUSES.includes(r.status)).length;
  document.getElementById('rfq-stat-submitted').textContent = rfqs.filter(r => r.status === 'Submitted').length;
  document.getElementById('rfq-stat-won').textContent = rfqs.filter(r => r.status === 'Won').length;
  document.getElementById('rfq-stat-lost').textContent = rfqs.filter(r => r.status === 'Lost').length;
  document.getElementById('rfq-stat-due-week').textContent = rfqs.filter(r => {
    if (!r.dueDate) return false;
    const d = new Date(r.dueDate); d.setHours(0,0,0,0);
    return d >= today && d <= weekEnd;
  }).length;
}

function rfqStatusClass(status) {
  const map = {
    'New':'rfq-s-new','Under Review':'rfq-s-review','Engineering':'rfq-s-engineering',
    'Costing':'rfq-s-costing','Waiting for Vendor':'rfq-s-vendor','Quote Ready':'rfq-s-ready',
    'Submitted':'rfq-s-submitted','Won':'rfq-s-won','Lost':'rfq-s-lost','Closed':'rfq-s-closed'
  };
  return map[status] || 'rfq-s-new';
}

function rfqRowClass(rfq) {
  if (RFQ_DONE_STATUSES.includes(rfq.status)) return 'rfq-row-done';
  if (!rfq.dueDate) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(rfq.dueDate); due.setHours(0,0,0,0);
  const diff = Math.ceil((due - today) / (1000*60*60*24));
  if (diff < 0) return 'rfq-row-overdue';
  if (diff <= 3) return 'rfq-row-soon';
  return '';
}

function getFilteredSortedRFQs() {
  const search = (document.getElementById('rfq-search')?.value || '').toLowerCase();
  const filterCustomer = document.getElementById('rfq-filter-customer')?.value || '';
  const filterStatus = document.getElementById('rfq-filter-status')?.value || '';
  const filterPriority = document.getElementById('rfq-filter-priority')?.value || '';
  const sortBy = document.getElementById('rfq-sort')?.value || 'dueDate';
  const PRIORITY_ORDER = { 'High': 0, 'Medium': 1, 'Low': 2 };

  let list = rfqState.rfqs.filter(r => {
    const matchSearch = !search ||
      (r.rfqNumber||'').toLowerCase().includes(search) ||
      (r.customerName||'').toLowerCase().includes(search) ||
      (r.projectTitle||'').toLowerCase().includes(search);
    const matchCustomer = !filterCustomer || r.customerName === filterCustomer;
    const matchStatus = !filterStatus || r.status === filterStatus;
    const matchPriority = !filterPriority || r.priority === filterPriority;
    return matchSearch && matchCustomer && matchStatus && matchPriority;
  });

  list.sort((a, b) => {
    if (sortBy === 'dueDate') return new Date(a.dueDate||0) - new Date(b.dueDate||0);
    if (sortBy === 'createdAt') return new Date(b.createdAt||0) - new Date(a.createdAt||0);
    if (sortBy === 'priority') return (PRIORITY_ORDER[a.priority]||1) - (PRIORITY_ORDER[b.priority]||1);
    if (sortBy === 'status') return (a.status||'').localeCompare(b.status||'');
    return 0;
  });
  return list;
}

function renderRFQTable() {
  const tbody = document.getElementById('rfq-tbody');
  if (!tbody) return;
  const list = getFilteredSortedRFQs();

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:40px;color:var(--text-secondary);">No RFQs match your filters.</td></tr>';
    return;
  }

  const fmt = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '�';

  tbody.innerHTML = list.map(r => {
    const rowCls = rfqRowClass(r);
    const stCls = rfqStatusClass(r.status);
    const pCls = r.priority === 'High' ? 'rfq-p-high' : r.priority === 'Low' ? 'rfq-p-low' : 'rfq-p-medium';
    const prog = Math.min(100, Math.max(0, parseInt(r.progress)||0));
    const dueStr = r.dueDate ? fmt(r.dueDate) : '�';
    const isOverdue = rowCls === 'rfq-row-overdue';
    const isSoon = rowCls === 'rfq-row-soon';
    return `<tr class="${rowCls}" data-rfq-id="${r.id}">
      <td><strong>${escapeHTML(r.rfqNumber||'')}</strong></td>
      <td>${escapeHTML(r.customerName||'')}</td>
      <td>${escapeHTML(r.projectTitle||'')}</td>
      <td>${fmt(r.receivedDate)}</td>
      <td style="font-weight:600; color:${isOverdue?'#ef4444':isSoon?'#f59e0b':'inherit'}">${dueStr}${isOverdue?' ??':isSoon?' ??':''}</td>
      <td><span class="${pCls}">${escapeHTML(r.priority||'Medium')}</span></td>
      <td>${escapeHTML(r.owner||'�')}</td>
      <td><span class="rfq-status-badge ${stCls}">${escapeHTML(r.status||'New')}</span></td>
      <td>
        <div class="rfq-progress-wrap">
          <div class="rfq-progress-bar"><div class="rfq-progress-fill" style="width:${prog}%"></div></div>
          <span class="rfq-progress-text">${prog}%</span>
        </div>
      </td>
      <td style="max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHTML(r.nextAction||'')}">${escapeHTML(r.nextAction||'�')}</td>
      <td style="max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHTML(r.remarks||'')}">${escapeHTML(r.remarks||'�')}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-secondary" style="padding:4px 10px;font-size:0.75rem;margin-right:4px;" onclick="openEditRFQ('${r.id}')">Edit</button>
        <button class="btn btn-danger" style="padding:4px 10px;font-size:0.75rem;" onclick="deleteRFQ('${r.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

function renderRFQCharts() {
  if (typeof Chart === 'undefined') return;

  const rfqs = rfqState.rfqs;
  const isDark = document.body.classList.contains('dark-theme');
  const textColor = isDark ? '#cbd5e1' : '#334155';
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';

  Chart.defaults.font.family = "'Inter', 'Outfit', sans-serif";
  Chart.defaults.color = textColor;

  // ─── 1. Status Donut Chart ───────────────────────────────────────────
  const statusCounts = {};
  RFQ_STATUSES.forEach(s => { statusCounts[s] = rfqs.filter(r => r.status === s).length; });
  const statusColorsMap = {
    'New': '#6366f1', 'Under Review': '#f59e0b', 'Engineering': '#8b5cf6',
    'Costing': '#ec4899', 'Waiting for Vendor': '#f97316', 'Quote Ready': '#06b6d4',
    'Submitted': '#3b82f6', 'Won': '#22c55e', 'Lost': '#ef4444', 'Closed': '#94a3b8'
  };
  const statusColors = RFQ_STATUSES.map(s => statusColorsMap[s] || '#6366f1');

  if (rfqState.charts.status) rfqState.charts.status.destroy();
  const ctxStatus = document.getElementById('chart-rfq-status')?.getContext('2d');
  if (ctxStatus) {
    rfqState.charts.status = new Chart(ctxStatus, {
      type: 'doughnut',
      data: {
        labels: RFQ_STATUSES,
        datasets: [{
          data: Object.values(statusCounts),
          backgroundColor: statusColors,
          borderColor: isDark ? '#1e293b' : '#ffffff',
          borderWidth: 3,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, pointStyleWidth: 10, font: { size: 10.5 } } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total ? Math.round(ctx.parsed / total * 100) : 0;
                return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  // ─── 2. Win / Loss Pie Chart ─────────────────────────────────────────
  const won = rfqs.filter(r => r.status === 'Won').length;
  const lost = rfqs.filter(r => r.status === 'Lost').length;
  const inProgress = rfqs.length - won - lost;

  if (rfqState.charts.winrate) rfqState.charts.winrate.destroy();
  const ctxWin = document.getElementById('chart-rfq-winrate')?.getContext('2d');
  if (ctxWin) {
    rfqState.charts.winrate = new Chart(ctxWin, {
      type: 'doughnut',
      data: {
        labels: ['Won', 'Lost', 'In Progress'],
        datasets: [{
          data: [won, lost, inProgress],
          backgroundColor: ['#22c55e', '#ef4444', '#94a3b8'],
          borderColor: isDark ? '#1e293b' : '#ffffff',
          borderWidth: 3,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { padding: 14, usePointStyle: true, font: { size: 10.5 } } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total ? Math.round(ctx.parsed / total * 100) : 0;
                return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  // ─── 3. Priority Breakdown Pie ────────────────────────────────────────
  const priorities = { High: 0, Medium: 0, Low: 0 };
  rfqs.forEach(r => { if (r.priority && priorities[r.priority] !== undefined) priorities[r.priority]++; });

  if (rfqState.charts.priority) rfqState.charts.priority.destroy();
  const ctxPri = document.getElementById('chart-rfq-priority')?.getContext('2d');
  if (ctxPri) {
    rfqState.charts.priority = new Chart(ctxPri, {
      type: 'doughnut',
      data: {
        labels: ['High', 'Medium', 'Low'],
        datasets: [{
          data: [priorities.High, priorities.Medium, priorities.Low],
          backgroundColor: ['#ef4444', '#f59e0b', '#22c55e'],
          borderColor: isDark ? '#1e293b' : '#ffffff',
          borderWidth: 3,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { padding: 14, usePointStyle: true, font: { size: 10.5 } } }
        }
      }
    });
  }

  // ─── 4. Customer Bar Chart (gradient) ────────────────────────────────
  const customerCounts = {};
  rfqs.forEach(r => { const c = r.customerName || 'Unknown'; customerCounts[c] = (customerCounts[c] || 0) + 1; });
  const custLabels = Object.keys(customerCounts).slice(0, 10);
  const custData = custLabels.map(k => customerCounts[k]);

  if (rfqState.charts.customer) rfqState.charts.customer.destroy();
  const ctxCust = document.getElementById('chart-rfq-customer')?.getContext('2d');
  if (ctxCust) {
    const gradCust = ctxCust.createLinearGradient(0, 0, 0, 200);
    gradCust.addColorStop(0, 'rgba(99,102,241,0.9)');
    gradCust.addColorStop(1, 'rgba(99,102,241,0.3)');
    rfqState.charts.customer = new Chart(ctxCust, {
      type: 'bar',
      data: {
        labels: custLabels,
        datasets: [{ label: 'RFQs', data: custData, backgroundColor: gradCust, borderRadius: 6, borderSkipped: false }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 30, font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: gridColor } }
        }
      }
    });
  }

  // ─── 5. Owner Horizontal Bar ─────────────────────────────────────────
  const ownerCounts = {};
  rfqs.forEach(r => { const o = r.owner || 'Unassigned'; ownerCounts[o] = (ownerCounts[o] || 0) + 1; });
  const ownerLabels = Object.keys(ownerCounts).slice(0, 8);
  const ownerData = ownerLabels.map(k => ownerCounts[k]);

  if (rfqState.charts.owner) rfqState.charts.owner.destroy();
  const ctxOwner = document.getElementById('chart-rfq-owner')?.getContext('2d');
  if (ctxOwner) {
    const gradOwner = ctxOwner.createLinearGradient(250, 0, 0, 0);
    gradOwner.addColorStop(0, 'rgba(16,185,129,0.9)');
    gradOwner.addColorStop(1, 'rgba(16,185,129,0.3)');
    rfqState.charts.owner = new Chart(ctxOwner, {
      type: 'bar',
      data: {
        labels: ownerLabels,
        datasets: [{ label: 'RFQs', data: ownerData, backgroundColor: gradOwner, borderRadius: 6, borderSkipped: false }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: gridColor } },
          y: { grid: { display: false }, ticks: { font: { size: 10.5 } } }
        }
      }
    });
  }

  // ─── 6. Monthly Trend Line Chart ─────────────────────────────────────
  const monthCounts = {};
  rfqs.forEach(r => {
    if (r.receivedDate) {
      const d = new Date(r.receivedDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthCounts[key] = (monthCounts[key] || 0) + 1;
    }
  });
  const sortedMonths = Object.keys(monthCounts).sort();
  const monthLabels = sortedMonths.map(m => {
    const [yr, mo] = m.split('-');
    return new Date(yr, mo - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
  });

  if (rfqState.charts.monthly) rfqState.charts.monthly.destroy();
  const ctxMonthly = document.getElementById('chart-rfq-monthly')?.getContext('2d');
  if (ctxMonthly) {
    const gradLine = ctxMonthly.createLinearGradient(0, 0, 0, 180);
    gradLine.addColorStop(0, 'rgba(59,130,246,0.35)');
    gradLine.addColorStop(1, 'rgba(59,130,246,0.01)');
    rfqState.charts.monthly = new Chart(ctxMonthly, {
      type: 'line',
      data: {
        labels: monthLabels.length ? monthLabels : ['No Data'],
        datasets: [{
          label: 'RFQs Received',
          data: sortedMonths.map(m => monthCounts[m]),
          borderColor: '#3b82f6',
          backgroundColor: gradLine,
          borderWidth: 2.5,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: '#3b82f6',
          pointBorderColor: isDark ? '#1e293b' : '#fff',
          pointBorderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: gridColor } }
        }
      }
    });
  }
}

function openAddRFQ() {
  rfqState.editingId = null;
  document.getElementById('rfq-modal-title').textContent = 'Add New RFQ';
  document.getElementById('rfq-form').reset();
  document.getElementById('rfq-id-field').value = '';
  document.getElementById('rfq-progress').value = 0;
  document.getElementById('rfq-received').value = new Date().toISOString().split('T')[0];
  // Populate owner dropdown
  const ownerSel = document.getElementById('rfq-owner');
  ownerSel.innerHTML = state.users.map(u => `<option value="${escapeHTML(u.name)}">${escapeHTML(u.name)}</option>`).join('');
  document.getElementById('rfq-error').classList.add('hidden');
  document.getElementById('modal-rfq').classList.add('active');
}

function openEditRFQ(rfqId) {
  const rfq = rfqState.rfqs.find(r => r.id === rfqId);
  if (!rfq) return;
  rfqState.editingId = rfqId;
  document.getElementById('rfq-modal-title').textContent = 'Edit RFQ � ' + rfq.rfqNumber;
  document.getElementById('rfq-id-field').value = rfq.id;
  document.getElementById('rfq-customer').value = rfq.customerName || '';
  document.getElementById('rfq-project').value = rfq.projectTitle || '';
  document.getElementById('rfq-received').value = rfq.receivedDate || '';
  document.getElementById('rfq-due').value = rfq.dueDate || '';
  document.getElementById('rfq-priority').value = rfq.priority || 'Medium';
  document.getElementById('rfq-status').value = rfq.status || 'New';
  document.getElementById('rfq-progress').value = rfq.progress || 0;
  document.getElementById('rfq-next-action').value = rfq.nextAction || '';
  document.getElementById('rfq-remarks').value = rfq.remarks || '';
  // Populate owner dropdown
  const ownerSel = document.getElementById('rfq-owner');
  ownerSel.innerHTML = state.users.map(u => `<option value="${escapeHTML(u.name)}" ${u.name === rfq.owner ? 'selected' : ''}>${escapeHTML(u.name)}</option>`).join('');
  document.getElementById('rfq-error').classList.add('hidden');
  document.getElementById('modal-rfq').classList.add('active');
}

async function deleteRFQ(rfqId) {
  if (!confirm('Delete this RFQ permanently?')) return;
  try {
    await apiCall('/api/rfqs/' + rfqId, 'DELETE');
    await fetchRFQs();
    renderRFQDashboard();
    renderRFQTable();
    renderRFQCharts();
  } catch (e) { alert(e.message); }
}

function exportRFQsToExcel() {
  const list = getFilteredSortedRFQs();
  const headers = ['RFQ Number','Customer Name','Project','Received Date','Due Date','Priority','Owner','Status','Progress %','Next Action','Remarks'];
  const rows = list.map(r => [
    r.rfqNumber||'', r.customerName||'', r.projectTitle||'',
    r.receivedDate||'', r.dueDate||'', r.priority||'Medium',
    r.owner||'', r.status||'New', r.progress||0,
    r.nextAction||'', r.remarks||''
  ]);
  let csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'RFQ_Export_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click(); URL.revokeObjectURL(url);
}

// RFQ Form Submit
document.addEventListener('DOMContentLoaded', () => {
  const rfqForm = document.getElementById('rfq-form');
  if (rfqForm) {
    rfqForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('rfq-error');
      errEl.classList.add('hidden');
      const payload = {
        customerName: document.getElementById('rfq-customer').value.trim(),
        projectTitle: document.getElementById('rfq-project').value.trim(),
        receivedDate: document.getElementById('rfq-received').value,
        dueDate: document.getElementById('rfq-due').value,
        priority: document.getElementById('rfq-priority').value,
        owner: document.getElementById('rfq-owner').value,
        status: document.getElementById('rfq-status').value,
        progress: parseInt(document.getElementById('rfq-progress').value)||0,
        nextAction: document.getElementById('rfq-next-action').value.trim(),
        remarks: document.getElementById('rfq-remarks').value.trim()
      };
      try {
        if (rfqState.editingId) {
          await apiCall('/api/rfqs/' + rfqState.editingId, 'PUT', payload);
        } else {
          await apiCall('/api/rfqs', 'POST', payload);
        }
        document.getElementById('modal-rfq').classList.remove('active');
        await fetchRFQs();
        renderRFQDashboard();
        renderRFQTable();
        renderRFQCharts();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });
  }

  // Add RFQ button
  document.getElementById('btn-add-rfq')?.addEventListener('click', openAddRFQ);

  // Export button
  document.getElementById('btn-rfq-export')?.addEventListener('click', exportRFQsToExcel);

  // Search & filter live update
  ['rfq-search','rfq-filter-customer','rfq-filter-status','rfq-filter-priority','rfq-sort'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', renderRFQTable);
    document.getElementById(id)?.addEventListener('change', renderRFQTable);
  });
});


// ==================== TASK TIMELINE & OVERLAP LOGIC ====================

// Check if a task has scheduling conflicts with other tasks assigned to the same operator
function checkTaskOverlapConflict(task) {
  if (!task.startDate || !task.dueDate || !task.allocatedOperator) return false;
  
  const start = new Date(task.startDate).getTime();
  const end = new Date(task.dueDate).getTime();
  
  // Find all other tasks for the same operator in the same project
  const otherTasks = state.tasks.filter(t => 
    t.id !== task.id &&
    t.projectId === task.projectId &&
    t.allocatedOperator === task.allocatedOperator &&
    t.startDate &&
    t.dueDate
  );
  
  for (const t of otherTasks) {
    const tStart = new Date(t.startDate).getTime();
    const tEnd = new Date(t.dueDate).getTime();
    
    // Check interval collision (start1 <= end2 && end1 >= start2)
    if (start <= tEnd && end >= tStart) {
      return true;
    }
  }
  return false;
}

// Render task timeline Gantt chart with operator allocation and conflicts
function renderTaskTimelineChart() {
  const container = document.getElementById('task-gantt-chart-container');
  if (!container) return;
  container.innerHTML = '';

  const activeProjectId = document.getElementById('board-project-filter')?.value;
  if (!activeProjectId || activeProjectId === 'all') {
    container.innerHTML = '<div class="empty-state">Select a specific project from the dropdown filter above to view task timeline.</div>';
    return;
  }

  // Filter tasks belonging to active project that have start and due dates
  const projectTasks = state.tasks.filter(t => t.projectId === activeProjectId && t.startDate && t.dueDate);

  if (projectTasks.length === 0) {
    container.innerHTML = '<div class="empty-state">No tasks with Start Date and Due Date set. Edit tasks on the board to map schedules.</div>';
    return;
  }

  // Find overall timeline bounds
  let minTime = Infinity;
  let maxTime = -Infinity;

  projectTasks.forEach(t => {
    const start = new Date(t.startDate).getTime();
    const end = new Date(t.dueDate).getTime();
    if (start < minTime) minTime = start;
    if (end > maxTime) maxTime = end;
  });

  const oneDay = 24 * 60 * 60 * 1000;
  const totalDays = Math.ceil((maxTime - minTime) / oneDay) + 1;

  const ganttGrid = document.createElement('div');
  ganttGrid.className = 'gantt-grid';

  const headerRow = document.createElement('div');
  headerRow.className = 'gantt-header-row';
  
  const scaleContainer = document.createElement('div');
  scaleContainer.className = 'gantt-scale';

  const tickCount = 5;
  for (let i = 0; i < tickCount; i++) {
    const tickTime = minTime + (maxTime - minTime) * (i / (tickCount - 1));
    const tickDate = new Date(tickTime);
    const tickStr = tickDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const percent = (i / (tickCount - 1)) * 100;
    
    scaleContainer.innerHTML += '<div class="gantt-scale-tick" style="left: ' + percent + '%">' + tickStr + '</div>';
  }

  headerRow.innerHTML = '<div>Task / Operator</div>';
  headerRow.appendChild(scaleContainer);
  ganttGrid.appendChild(headerRow);

  projectTasks.forEach(task => {
    const row = document.createElement('div');
    row.className = 'gantt-row';

    const conflict = checkTaskOverlapConflict(task);

    const taskLabelDiv = document.createElement('div');
    taskLabelDiv.className = 'gantt-stage-name';
    taskLabelDiv.style.display = 'flex';
    taskLabelDiv.style.flexDirection = 'column';
    taskLabelDiv.style.gap = '2px';
    
    let labelHtml = '<strong>' + escapeHTML(task.title) + '</strong>';
    if (task.allocatedOperator) {
      labelHtml += '<span style="font-size:0.75rem; color:var(--text-secondary);">' + escapeHTML(task.allocatedOperator) + ' (' + escapeHTML(task.operatorRole || 'None') + ')</span>';
    } else {
      labelHtml += '<span style="font-size:0.75rem; color:#f59e0b;">Unassigned</span>';
    }
    
    if (conflict) {
      labelHtml += '<span class="overlap-warning-badge">⚠️ Overlap Conflict</span>';
    }
    taskLabelDiv.innerHTML = labelHtml;

    const barContainer = document.createElement('div');
    barContainer.className = 'gantt-bar-container';

    const start = new Date(task.startDate).getTime();
    const end = new Date(task.dueDate).getTime();
    const offsetDays = Math.ceil((start - minTime) / oneDay);
    const durationDays = Math.ceil((end - start) / oneDay) + 1;

    const leftPct = (offsetDays / totalDays) * 100;
    const widthPct = (durationDays / totalDays) * 100;

    const barFill = document.createElement('div');
    barFill.className = 'gantt-bar-fill' + (conflict ? ' conflict-overlap' : '');
    barFill.style.left = leftPct + '%';
    barFill.style.width = widthPct + '%';
    
    // Assign color by task status
    if (task.status === 'done') {
      barFill.style.backgroundColor = '#10b981'; // Green
    } else if (task.status === 'inprogress') {
      barFill.style.backgroundColor = '#3b82f6'; // Blue
    } else {
      barFill.style.backgroundColor = '#94a3b8'; // Slate
    }

    // actual progress (mapped to done = 100%, inprogress = 50%, todo = 0% as base fallback)
    const progressPct = task.status === 'done' ? 100 : task.status === 'inprogress' ? 50 : 0;
    const progressBar = document.createElement('div');
    progressBar.className = 'gantt-bar-progress';
    progressBar.style.width = progressPct + '%';
    if (conflict) {
      progressBar.style.backgroundColor = '#ef4444';
    }
    
    const barLabel = document.createElement('span');
    barLabel.className = 'gantt-bar-label';
    const durationLabel = task.mappedDuration ? task.mappedDuration + 'h' : durationDays + 'd';
    barLabel.textContent = durationLabel + ' (' + task.status.toUpperCase() + ')';

    barFill.appendChild(progressBar);
    barFill.appendChild(barLabel);
    
    const tooltipText = task.title + '\nOperator: ' + (task.allocatedOperator || 'Unassigned') + ' (' + (task.operatorRole || 'None') + ')\nPlanned: ' + task.startDate + ' to ' + task.dueDate + ' (' + durationDays + ' days)\nDuration Mapped: ' + (task.mappedDuration || 0) + ' Hours\nStatus: ' + task.status.toUpperCase() + (conflict ? '\n⚠️ SCHEDULING CONFLICT: This operator is double-booked!' : '');
    barFill.title = tooltipText;
    
    // Clicking on timeline bar opens details modal
    barFill.style.cursor = 'pointer';
    barFill.addEventListener('click', () => {
      openTaskDetailsModal(task.id);
    });

    barContainer.appendChild(barFill);
    row.appendChild(taskLabelDiv);
    row.appendChild(barContainer);
    ganttGrid.appendChild(row);
  });

  container.appendChild(ganttGrid);
}


// ==================== ADVANCED REPORTS MODULE ====================
let reportCharts = {};
let generatedReportData = { category: 'rfq', periodLabel: '', rows: [], summary: {} };

function initReportControls() {
  const yearSelect = document.getElementById('report-select-year');
  if (yearSelect) {
    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = '';
    for (let y = currentYear; y >= currentYear - 3; y--) {
      yearSelect.innerHTML += '<option value="' + y + '">' + y + '</option>';
    }
  }

  const categorySel = document.getElementById('report-select-category');
  const freqSel = document.getElementById('report-select-frequency');
  
  if (categorySel) categorySel.addEventListener('change', updateReportPeriodOptions);
  if (freqSel) freqSel.addEventListener('change', updateReportPeriodOptions);
  
  document.getElementById('btn-generate-report')?.addEventListener('click', generatePerformanceReport);
  document.getElementById('btn-export-report-excel')?.addEventListener('click', exportReportToCSV);
  document.getElementById('btn-export-report-pdf')?.addEventListener('click', printReportPDF);

  updateReportPeriodOptions();
}

function updateReportPeriodOptions() {
  const freq = document.getElementById('report-select-frequency')?.value || 'monthly';
  const periodSel = document.getElementById('report-select-period-detail');
  const lblPeriod = document.getElementById('lbl-report-period-detail');
  const wrapperPeriod = document.getElementById('wrapper-report-period-detail');

  if (!periodSel || !lblPeriod || !wrapperPeriod) return;

  if (freq === 'yearly') {
    wrapperPeriod.classList.add('hidden');
    return;
  }
  wrapperPeriod.classList.remove('hidden');

  if (freq === 'monthly') {
    lblPeriod.textContent = 'Month';
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    periodSel.innerHTML = months.map((m, idx) => '<option value="' + idx + '">' + m + '</option>').join('');
  } else if (freq === 'quarterly') {
    lblPeriod.textContent = 'Quarter';
    periodSel.innerHTML = '<option value="Q1">Q1 (Jan - Mar)</option><option value="Q2">Q2 (Apr - Jun)</option><option value="Q3">Q3 (Jul - Sep)</option><option value="Q4">Q4 (Oct - Dec)</option>';
  } else if (freq === 'midyear') {
    lblPeriod.textContent = 'Half-Year';
    periodSel.innerHTML = '<option value="H1">H1 (Jan - Jun)</option><option value="H2">H2 (Jul - Dec)</option>';
  }
}

async function generatePerformanceReport() {
  const category = document.getElementById('report-select-category').value;
  const freq = document.getElementById('report-select-frequency').value;
  const year = parseInt(document.getElementById('report-select-year').value);
  const periodVal = document.getElementById('report-select-period-detail')?.value;

  document.getElementById('report-empty-state').classList.add('hidden');
  document.getElementById('report-results-container').classList.remove('hidden');
  
  const csvBtn = document.getElementById('btn-export-report-excel');
  const pdfBtn = document.getElementById('btn-export-report-pdf');
  if (csvBtn) csvBtn.classList.remove('hidden');
  if (pdfBtn) pdfBtn.classList.remove('hidden');

  if (category === 'rfq') {
    await generateRFQReport(freq, year, periodVal);
  } else {
    await generateTaskReport(freq, year, periodVal);
  }
}

// Check if a date string falls inside the selected period filter bounds
function isDateInPeriod(dateStr, freq, year, periodVal) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (d.getFullYear() !== year) return false;
  
  const m = d.getMonth(); // 0-11
  
  if (freq === 'yearly') return true;
  
  if (freq === 'monthly') {
    return m === parseInt(periodVal);
  }
  
  if (freq === 'quarterly') {
    if (periodVal === 'Q1') return m >= 0 && m <= 2;
    if (periodVal === 'Q2') return m >= 3 && m <= 5;
    if (periodVal === 'Q3') return m >= 6 && m <= 8;
    if (periodVal === 'Q4') return m >= 9 && m <= 11;
  }
  
  if (freq === 'midyear') {
    if (periodVal === 'H1') return m >= 0 && m <= 5;
    if (periodVal === 'H2') return m >= 6 && m <= 11;
  }
  return false;
}

function getPeriodLabel(freq, year, periodVal) {
  if (freq === 'yearly') return 'Year ' + year;
  if (freq === 'monthly') {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return months[parseInt(periodVal)] + ' ' + year;
  }
  return periodVal + ' ' + year;
}

// RFQ PERFORMANCE REPORT GENERATION
async function generateRFQReport(freq, year, periodVal) {
  await fetchRFQs();
  const rfqs = rfqState.rfqs;
  const periodLabel = getPeriodLabel(freq, year, periodVal);
  
  // Filter matching RFQs
  const filtered = rfqs.filter(r => isDateInPeriod(r.receivedDate || r.createdAt, freq, year, periodVal));

  const total = filtered.length;
  const won = filtered.filter(r => r.status === 'Won').length;
  const lost = filtered.filter(r => r.status === 'Lost').length;
  const closed = won + lost;
  const conversionRate = closed > 0 ? Math.round((won / closed) * 100) : 0;
  const openCount = filtered.filter(r => RFQ_OPEN_STATUSES.includes(r.status)).length;
  const submittedCount = filtered.filter(r => r.status === 'Submitted').length;

  generatedReportData = {
    category: 'rfq',
    periodLabel,
    rows: filtered,
    summary: { total, won, lost, closed, conversionRate, openCount, submittedCount }
  };

  // Render Metrics
  const summaryCards = document.getElementById('report-summary-cards');
  summaryCards.innerHTML = '<div class="rfq-stat-card"><div class="rfq-stat-val">' + total + '</div><div class="rfq-stat-label">Total RFQs</div></div>' +
    '<div class="rfq-stat-card rfq-open"><div class="rfq-stat-val">' + openCount + '</div><div class="rfq-stat-label">Open RFQs</div></div>' +
    '<div class="rfq-stat-card rfq-submitted"><div class="rfq-stat-val">' + submittedCount + '</div><div class="rfq-stat-label">Submitted</div></div>' +
    '<div class="rfq-stat-card rfq-won"><div class="rfq-stat-val">' + won + '</div><div class="rfq-stat-label">Won RFQs</div></div>' +
    '<div class="rfq-stat-card rfq-lost"><div class="rfq-stat-val">' + lost + '</div><div class="rfq-stat-label">Lost RFQs</div></div>' +
    '<div class="rfq-stat-card rfq-due"><div class="rfq-stat-val">' + conversionRate + '%</div><div class="rfq-stat-label">Conversion Rate</div></div>';

  // Render Headers
  document.getElementById('report-chart-title-1').textContent = 'RFQs by Status (' + periodLabel + ')';
  document.getElementById('report-chart-title-2').textContent = 'RFQ Conversion Funnel';

  // Render Charts
  renderRFQReportCharts(filtered);

  // Render Table
  const thead = document.getElementById('report-table-thead');
  thead.innerHTML = '<tr><th>RFQ #</th><th>Customer Name</th><th>Project Description</th><th>Received Date</th><th>Due Date</th><th>Priority</th><th>Owner</th><th>Status</th><th>Progress</th></tr>';

  const tbody = document.getElementById('report-table-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-secondary);">No RFQs found for ' + periodLabel + '.</td></tr>';
    return;
  }

  const fmt = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) : '—';
  tbody.innerHTML = filtered.map(r => '<tr>' +
    '<td><strong>' + escapeHTML(r.rfqNumber || '') + '</strong></td>' +
    '<td>' + escapeHTML(r.customerName || '') + '</td>' +
    '<td>' + escapeHTML(r.projectTitle || '') + '</td>' +
    '<td>' + fmt(r.receivedDate) + '</td>' +
    '<td>' + fmt(r.dueDate) + '</td>' +
    '<td><span class="rfq-status-badge rfq-p-' + (r.priority||'medium').toLowerCase() + '">' + escapeHTML(r.priority || 'Medium') + '</span></td>' +
    '<td>' + escapeHTML(r.owner || '—') + '</td>' +
    '<td><span class="rfq-status-badge ' + rfqStatusClass(r.status) + '">' + escapeHTML(r.status || 'New') + '</span></td>' +
    '<td>' + (r.progress || 0) + '%</td>' +
    '</tr>').join('');
}

function renderRFQReportCharts(filtered) {
  if (typeof Chart === 'undefined') return;

  // Chart 1: Status distribution
  const statusCounts = {};
  RFQ_STATUSES.forEach(s => { statusCounts[s] = filtered.filter(r => r.status === s).length; });
  
  if (reportCharts.c1) reportCharts.c1.destroy();
  const ctx1 = document.getElementById('chart-report-1')?.getContext('2d');
  if (ctx1) {
    reportCharts.c1 = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: RFQ_STATUSES,
        datasets: [{
          data: Object.values(statusCounts),
          backgroundColor: ['#6366f1','#f59e0b','#8b5cf6','#ec4899','#f97316','#10b981','#3b82f6','#22c55e','#ef4444','#6b7280']
        }]
      },
      options: { responsive: true, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 9 } } } } }
    });
  }

  // Chart 2: RFQ Conversion Funnel
  const totalReceived = filtered.length;
  const submittedOrFinal = filtered.filter(r => ['Submitted', 'Won', 'Lost', 'Closed'].includes(r.status)).length;
  const inProgressCosting = filtered.filter(r => ['Under Review', 'Engineering', 'Costing', 'Waiting for Vendor', 'Quote Ready'].includes(r.status)).length;
  const estimatedCount = inProgressCosting + submittedOrFinal;
  const wonOrders = filtered.filter(r => ['Won', 'Closed'].includes(r.status)).length;

  const funnelLabels = ['1. Received RFQs', '2. Costed / Estimated', '3. Submitted Quotes', '4. Won Orders'];
  const funnelData = [totalReceived, estimatedCount, submittedOrFinal, wonOrders];

  if (reportCharts.c2) reportCharts.c2.destroy();
  const ctx2 = document.getElementById('chart-report-2')?.getContext('2d');
  if (ctx2) {
    reportCharts.c2 = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: funnelLabels,
        datasets: [{
          label: 'RFQ Volume',
          data: funnelData,
          backgroundColor: ['#6366f1', '#a855f7', '#3b82f6', '#10b981'],
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                const val = context.raw;
                const pct = totalReceived > 0 ? Math.round((val / totalReceived) * 100) : 0;
                return val + ' RFQs (' + pct + '% of total)';
              }
            }
          }
        },
        scales: {
          x: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });
  }
}

// TASK TRACKER PERFORMANCE REPORT GENERATION
async function generateTaskReport(freq, year, periodVal) {
  await fetchTasks();
  const tasks = state.tasks;
  const periodLabel = getPeriodLabel(freq, year, periodVal);

  const filtered = tasks.filter(t => isDateInPeriod(t.dueDate || t.createdAt, freq, year, periodVal));

  const total = filtered.length;
  const completed = filtered.filter(t => t.status === 'done').length;
  const inProgress = filtered.filter(t => t.status === 'inprogress').length;
  const todo = filtered.filter(t => t.status === 'todo').length;
  
  const nowStr = new Date().toISOString().split('T')[0];
  const overdue = filtered.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < nowStr).length;

  // Calculate sum of mapped operator duration hours
  const totalDurationHours = filtered.reduce((acc, t) => acc + (parseFloat(t.mappedDuration) || 0), 0);

  generatedReportData = {
    category: 'task',
    periodLabel,
    rows: filtered,
    summary: { total, completed, inProgress, todo, overdue, totalDurationHours }
  };

  // Render Metrics
  const summaryCards = document.getElementById('report-summary-cards');
  summaryCards.innerHTML = '<div class="rfq-stat-card"><div class="rfq-stat-val">' + total + '</div><div class="rfq-stat-label">Total Allocated</div></div>' +
    '<div class="rfq-stat-card rfq-won"><div class="rfq-stat-val">' + completed + '</div><div class="rfq-stat-label">Completed</div></div>' +
    '<div class="rfq-stat-card rfq-open"><div class="rfq-stat-val">' + inProgress + '</div><div class="rfq-stat-label">In Progress</div></div>' +
    '<div class="rfq-stat-card rfq-submitted"><div class="rfq-stat-val">' + todo + '</div><div class="rfq-stat-label">To Do</div></div>' +
    '<div class="rfq-stat-card rfq-lost"><div class="rfq-stat-val" style="color:#ef4444;">' + overdue + '</div><div class="rfq-stat-label">Overdue Tasks</div></div>' +
    '<div class="rfq-stat-card rfq-due"><div class="rfq-stat-val">' + totalDurationHours + 'h</div><div class="rfq-stat-label">Total Mapped Hours</div></div>';

  // Render Headers
  document.getElementById('report-chart-title-1').textContent = 'Tasks by Status (' + periodLabel + ')';
  document.getElementById('report-chart-title-2').textContent = 'Workload Distribution by Operator Designation';

  // Render Charts
  renderTaskReportCharts(filtered);

  // Render Table
  const thead = document.getElementById('report-table-thead');
  thead.innerHTML = '<tr><th>Task Title</th><th>Project</th><th>Start Date</th><th>Due Date</th><th>Operator</th><th>Designation Role</th><th>Duration</th><th>Status</th><th>Conflict</th></tr>';

  const tbody = document.getElementById('report-table-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-secondary);">No tasks found for ' + periodLabel + '.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(t => {
    const proj = state.projects.find(p => p.id === t.projectId);
    const projName = proj ? proj.name : 'Unknown Project';
    const isConflict = checkTaskOverlapConflict(t);
    return '<tr class="' + (isConflict ? 'rfq-row-soon' : '') + '">' +
      '<td><strong>' + escapeHTML(t.title) + '</strong></td>' +
      '<td>' + escapeHTML(projName) + '</td>' +
      '<td>' + (t.startDate || '—') + '</td>' +
      '<td>' + (t.dueDate || '—') + '</td>' +
      '<td>' + escapeHTML(t.allocatedOperator || '—') + '</td>' +
      '<td><span class="rfq-status-badge rfq-s-new">' + escapeHTML(t.operatorRole || 'None') + '</span></td>' +
      '<td>' + (t.mappedDuration ? t.mappedDuration + ' hrs' : '—') + '</td>' +
      '<td><span class="rfq-status-badge ' + (t.status === 'done' ? 'rfq-s-ready' : t.status === 'inprogress' ? 'rfq-s-submitted' : 'rfq-s-closed') + '">' + t.status.toUpperCase() + '</span></td>' +
      '<td style="color:#ef4444; font-weight:bold;">' + (isConflict ? '⚠️ Overlap' : 'OK') + '</td>' +
      '</tr>';
  }).join('');
}

function renderTaskReportCharts(filtered) {
  if (typeof Chart === 'undefined') return;

  // Chart 1: Status Distribution
  const counts = {
    'To Do': filtered.filter(t => t.status === 'todo').length,
    'In Progress': filtered.filter(t => t.status === 'inprogress').length,
    'Completed': filtered.filter(t => t.status === 'done').length
  };

  if (reportCharts.c1) reportCharts.c1.destroy();
  const ctx1 = document.getElementById('chart-report-1')?.getContext('2d');
  if (ctx1) {
    reportCharts.c1 = new Chart(ctx1, {
      type: 'pie',
      data: {
        labels: Object.keys(counts),
        datasets: [{
          data: Object.values(counts),
          backgroundColor: ['#6b7280', '#3b82f6', '#10b981']
        }]
      },
      options: { responsive: true, plugins: { legend: { position: 'right' } } }
    });
  }

  // Chart 2: Workload by operator role
  const roleHours = {
    'Fitter': 0, 'Welder': 0, 'Milling Operator': 0, 'Drilling & VMC': 0, 'Assembly Operator': 0, 'None': 0
  };
  filtered.forEach(t => {
    const role = t.operatorRole || 'None';
    roleHours[role] = (roleHours[role] || 0) + (parseFloat(t.mappedDuration) || 0);
  });

  if (reportCharts.c2) reportCharts.c2.destroy();
  const ctx2 = document.getElementById('chart-report-2')?.getContext('2d');
  if (ctx2) {
    reportCharts.c2 = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: Object.keys(roleHours),
        datasets: [{
          label: 'Total Mapped Hours',
          data: Object.values(roleHours),
          backgroundColor: '#8b5cf6'
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }

  // Chart 3: Workload by Member
  const memberHours = {};
  filtered.forEach(t => {
    const member = t.allocatedOperator || 'Unassigned';
    memberHours[member] = (memberHours[member] || 0) + (parseFloat(t.mappedDuration) || 0);
  });

  if (reportCharts.c3) reportCharts.c3.destroy();
  const ctx3 = document.getElementById('chart-report-3')?.getContext('2d');
  if (ctx3) {
    reportCharts.c3 = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: Object.keys(memberHours),
        datasets: [{
          label: 'Total Mapped Hours',
          data: Object.values(memberHours),
          backgroundColor: '#06b6d4'
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }
}

// EXPORT PERFORMANCE REPORT TO EXCEL CSV
function exportReportToCSV() {
  const data = generatedReportData;
  if (!data || data.rows.length === 0) return;

  let csvContent = '';
  if (data.category === 'rfq') {
    const headers = ['RFQ Number', 'Customer Name', 'Project Description', 'Received Date', 'Due Date', 'Priority', 'Owner', 'Status', 'Progress %', 'Remarks'];
    const rows = data.rows.map(r => [
      r.rfqNumber||'', r.customerName||'', r.projectTitle||'', r.receivedDate||'', r.dueDate||'', r.priority||'Medium', r.owner||'', r.status||'New', r.progress||0, r.remarks||''
    ]);
    csvContent = [headers, ...rows].map(row => row.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n');
  } else {
    const headers = ['Task Title', 'Project Name', 'Start Date', 'Due Date', 'Allocated Operator', 'Operator Designation Role', 'Mapped Duration Hours', 'Status'];
    const rows = data.rows.map(t => {
      const proj = state.projects.find(p => p.id === t.projectId);
      return [
        t.title||'', proj ? proj.name : 'Unknown', t.startDate||'', t.dueDate||'', t.allocatedOperator||'', t.operatorRole||'None', t.mappedDuration||0, t.status||'todo'
      ];
    });
    csvContent = [headers, ...rows].map(row => row.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n');
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = data.category.toUpperCase() + '_Report_' + data.periodLabel.replace(/\s+/g, '_') + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// PRINT REPORT PDF
function printReportPDF() {
  const category = document.getElementById('report-select-category').value;
  const printWindow = window.open('', '_blank');
  
  const companyName = state.settings.companyName || 'PRO-MFG';
  const logoHtml = state.settings.companyLogo 
    ? '<img src="/uploads/' + state.settings.companyLogo + '" style="max-height:50px; max-width:180px; object-fit:contain; float:right;">'
    : '';

  let tableRowsHtml = '';
  if (category === 'rfq') {
    tableRowsHtml = generatedReportData.rows.map(r => '<tr>' +
      '<td><strong>' + (r.rfqNumber||'') + '</strong></td>' +
      '<td>' + (r.customerName||'') + '</td>' +
      '<td>' + (r.projectTitle||'') + '</td>' +
      '<td>' + (r.receivedDate||'') + '</td>' +
      '<td>' + (r.dueDate||'') + '</td>' +
      '<td>' + (r.priority||'Medium') + '</td>' +
      '<td>' + (r.owner||'') + '</td>' +
      '<td>' + (r.status||'New') + '</td>' +
      '<td>' + (r.progress||0) + '%</td>' +
      '</tr>').join('');
  } else {
    tableRowsHtml = generatedReportData.rows.map(t => {
      const proj = state.projects.find(p => p.id === t.projectId);
      return '<tr>' +
        '<td><strong>' + (t.title||'') + '</strong></td>' +
        '<td>' + (proj ? proj.name : 'Unknown') + '</td>' +
        '<td>' + (t.startDate||'') + '</td>' +
        '<td>' + (t.dueDate||'') + '</td>' +
        '<td>' + (t.allocatedOperator||'') + '</td>' +
        '<td>' + (t.operatorRole||'None') + '</td>' +
        '<td>' + (t.mappedDuration ? t.mappedDuration + 'h' : '—') + '</td>' +
        '<td>' + t.status.toUpperCase() + '</td>' +
        '</tr>';
    }).join('');
  }

  const reportTitle = category === 'rfq' ? 'RFQ Performance Report' : 'Task Tracker Performance Report';
  
  let summaryMetricsHtml = '';
  if (category === 'rfq') {
    const s = generatedReportData.summary;
    summaryMetricsHtml = '<div class="summary-metric">Total RFQs: <strong>' + s.total + '</strong></div>' +
      '<div class="summary-metric">Open: <strong>' + s.openCount + '</strong></div>' +
      '<div class="summary-metric">Submitted: <strong>' + s.submittedCount + '</strong></div>' +
      '<div class="summary-metric">Won: <strong>' + s.won + '</strong></div>' +
      '<div class="summary-metric">Lost: <strong>' + s.lost + '</strong></div>' +
      '<div class="summary-metric">Conversion Rate: <strong>' + s.conversionRate + '%</strong></div>';
  } else {
    const s = generatedReportData.summary;
    summaryMetricsHtml = '<div class="summary-metric">Total Tasks: <strong>' + s.total + '</strong></div>' +
      '<div class="summary-metric">Completed: <strong>' + s.completed + '</strong></div>' +
      '<div class="summary-metric">In Progress: <strong>' + s.inProgress + '</strong></div>' +
      '<div class="summary-metric">To Do: <strong>' + s.todo + '</strong></div>' +
      '<div class="summary-metric">Overdue: <strong>' + s.overdue + '</strong></div>' +
      '<div class="summary-metric">Total Mapped Hours: <strong>' + s.totalDurationHours + 'h</strong></div>';
  }

  // Get base64 images of charts
  const chartImg1 = document.getElementById('chart-report-1')?.toDataURL('image/png');
  const chartImg2 = document.getElementById('chart-report-2')?.toDataURL('image/png');
  const chartImg3 = document.getElementById('chart-report-3')?.toDataURL('image/png');

  const chartsHtml = (chartImg1 || chartImg2 || chartImg3) ? '<div style="display:flex; justify-content:space-around; margin-bottom:40px; margin-top:20px;">' +
    (chartImg1 ? '<div style="text-align:center;"><h4 style="margin-bottom:8px;">Status Distribution</h4><img src="' + chartImg1 + '" style="max-height:160px; max-width:250px; object-fit:contain;"></div>' : '') +
    (chartImg2 ? '<div style="text-align:center;"><h4 style="margin-bottom:8px;">Workload / Designation</h4><img src="' + chartImg2 + '" style="max-height:160px; max-width:250px; object-fit:contain;"></div>' : '') +
    (chartImg3 ? '<div style="text-align:center;"><h4 style="margin-bottom:8px;">Workload / Member</h4><img src="' + chartImg3 + '" style="max-height:160px; max-width:250px; object-fit:contain;"></div>' : '') +
    '</div>' : '';

  printWindow.document.write('<html><head><title>' + reportTitle + ' - ' + generatedReportData.periodLabel + '</title>' +
    '<style>' +
    'body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; padding: 20px; color: #1e293b; font-size: 10pt; line-height:1.5; }' +
    '.header { border-bottom: 2px solid #3b82f6; padding-bottom: 12px; margin-bottom: 30px; }' +
    '.header h1 { margin: 0 0 4px 0; font-size: 1.6rem; color: #1e3a8a; }' +
    '.header p { margin: 0; color: #64748b; font-size: 0.9rem; font-weight: 500; }' +
    '.summary-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 30px; }' +
    '.summary-metric { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 8px; border-radius: 6px; text-align: center; font-size: 0.8rem; }' +
    '.summary-metric strong { display: block; font-size: 1.1rem; color: #1e3a8a; margin-top: 4px; }' +
    'table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 8.5pt; }' +
    'th { background: #1e293b; color: white; padding: 8px 10px; text-align: left; text-transform: uppercase; font-weight: 600; font-size: 0.72rem; }' +
    'td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }' +
    'tr:nth-child(even) td { background: #f8fafc; }' +
    '.footer { margin-top: 40px; border-top: 1px solid #cbd5e1; padding-top: 10px; font-size: 8pt; color: #94a3b8; display:flex; justify-content:space-between; }' +
    '</style></head><body>' +
    logoHtml +
    '<div class="header"><h1>' + reportTitle + '</h1><p>Period: ' + generatedReportData.periodLabel + ' | Organization: ' + companyName + '</p></div>' +
    '<div class="summary-grid">' + summaryMetricsHtml + '</div>' +
    chartsHtml +
    '<h3>Detailed Listing</h3><table><thead>' +
    (category === 'rfq' 
      ? '<tr><th>RFQ #</th><th>Customer</th><th>Project Description</th><th>Received</th><th>Due Date</th><th>Priority</th><th>Owner</th><th>Status</th><th>Progress</th></tr>'
      : '<tr><th>Task Title</th><th>Project Name</th><th>Start Date</th><th>Due Date</th><th>Operator</th><th>Role</th><th>Duration</th><th>Status</th></tr>') +
    '</thead><tbody>' + tableRowsHtml + '</tbody></table>' +
    '<div class="footer"><div>Report generated automatically by Project & Task Management - ' + companyName + '</div><div>Page 1 of 1</div></div>' +
    '<script>window.onload = function() { setTimeout(function() { window.print(); window.close(); }, 500); }</script>' +
    '</body></html>');
}


// ==================== BOM TRACKING CONTROLLER ====================
async function fetchBOMItems(projectId) {
  if (!projectId) {
    state.bomItems = [];
    return [];
  }
  try {
    state.bomItems = await apiCall('/api/projects/' + projectId + '/bom');
    return state.bomItems;
  } catch (err) {
    console.error('Error fetching BOM items:', err);
    alert('Failed to fetch BOM items.');
    return [];
  }
}

function populateBOMProjectDropdown() {
  const select = document.getElementById('bom-project-select');
  if (!select) return;
  
  const currentVal = select.value;
  select.innerHTML = '<option value="">Select Project...</option>' + 
    state.projects.map(p => '<option value="' + p.id + '">' + escapeHTML(p.name) + '</option>').join('');
  
  if (currentVal && state.projects.some(p => p.id === currentVal)) {
    select.value = currentVal;
  } else if (state.projects.length > 0) {
    // Select first project automatically
    select.value = state.projects[0].id;
  }
}

function renderBOMDashboard() {
  const items = state.bomItems;
  
  // Filters
  const catFilter = document.getElementById('bom-filter-category')?.value || '';
  const statusFilter = document.getElementById('bom-filter-status')?.value || '';
  
  const filtered = items.filter(item => {
    if (catFilter && item.category !== catFilter) return false;
    if (statusFilter && item.status !== statusFilter) return false;
    return true;
  });

  const total = filtered.length;
  const ordered = filtered.filter(item => ['PO Placed', 'Received', 'Issued'].includes(item.status)).length;
  const received = filtered.filter(item => ['Received', 'Issued'].includes(item.status)).length;
  
  const completionPct = total > 0 ? Math.round((received / total) * 100) : 0;
  // Cost based on Winning Supplier Price * Quantity
  const totalEstCost = filtered.reduce((sum, item) => sum + (getWinningPrice(item) * (parseFloat(item.quantity) || 1)), 0);
  
  document.getElementById('bom-stat-total').textContent = total;
  document.getElementById('bom-stat-ordered').textContent = ordered;
  document.getElementById('bom-stat-received').textContent = received;
  document.getElementById('bom-stat-completion').textContent = completionPct + '%';
  document.getElementById('bom-stat-cost').textContent = '₹' + totalEstCost.toLocaleString('en-IN');
}

function renderBOMTable() {
  const tbody = document.getElementById('bom-table-tbody');
  if (!tbody) return;

  const projectId = document.getElementById('bom-project-select')?.value;
  if (!projectId) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-secondary);">Select a project above to load BOM items.</td></tr>';
    return;
  }

  const catFilter = document.getElementById('bom-filter-category')?.value || '';
  const statusFilter = document.getElementById('bom-filter-status')?.value || '';
  
  const filtered = state.bomItems.filter(item => {
    if (catFilter && item.category !== catFilter) return false;
    if (statusFilter && item.status !== statusFilter) return false;
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-secondary);">No BOM items found.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const isOverdue = item.status !== 'Received' && item.status !== 'Issued' && item.targetDate && item.targetDate < new Date().toISOString().split('T')[0];
    
    // Status Dropdown options
    const statuses = ['Draft', 'Awaiting Approval', 'Approved', 'Enquiry Sent', 'PO Placed', 'Received', 'Issued'];
    const selectOptions = statuses.map(s => '<option value="' + s + '"' + (s === item.status ? ' selected' : '') + '>' + s + '</option>').join('');

    // Format Awarded Winner
    const hasWinner = item.winner && item.winner !== 'None';
    const winnerHtml = hasWinner
      ? '<strong>' + escapeHTML(getWinnerName(item)) + '</strong><br>' +
        '₹' + (getWinnerPrice(item) * (parseFloat(item.quantity)||1)).toLocaleString() + '<br>' +
        '<small style="color:var(--text-secondary);">Del: ' + escapeHTML(getWinnerDelivery(item)) + '</small>'
      : '<span style="color:#ef4444; font-weight:bold; font-size:0.75rem;">Under Review</span>';

    return '<tr class="' + (isOverdue ? 'bom-overdue' : '') + '">' +
      '<td><strong>' + escapeHTML(item.itemCode || '—') + '</strong></td>' +
      '<td>' + escapeHTML(item.description || '—') + '</td>' +
      '<td><span class="rfq-status-badge rfq-s-new">' + escapeHTML(item.category || 'Raw Material') + '</span></td>' +
      '<td><strong>' + (item.quantity || 1) + '</strong> <small>' + escapeHTML(item.unit || 'Nos') + '</small></td>' +
      '<td>' + winnerHtml + '</td>' +
      '<td style="' + (isOverdue ? 'color:#ef4444; font-weight:bold;' : '') + '">' + (item.targetDate || '—') + (isOverdue ? ' ⚠️' : '') + '</td>' +
      '<td>' +
        '<select class="bom-status-row-select" data-id="' + item.id + '" style="padding:4px 8px; border-radius:4px; border:1px solid var(--border-color); font-size:0.75rem; background:var(--card-bg); color:var(--text-primary); font-weight:600;">' +
          selectOptions +
        '</select>' +
      '</td>' +
      '<td>' +
        '<div style="display:flex; gap:6px;">' +
          '<button class="btn-icon btn-edit-bom" data-id="' + item.id + '" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>' +
          '<button class="btn-icon text-danger btn-delete-bom" data-id="' + item.id + '" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>' +
        '</div>' +
      '</td>' +
      '</tr>';
  }).join('');
}

async function handleBOMSubmit(e) {
  e.preventDefault();
  const projectId = document.getElementById('bom-project-select').value;
  if (!projectId) {
    alert('Please select a project first.');
    return;
  }

  const bomId = document.getElementById('bom-id-field').value;
  const payload = {
    itemCode: document.getElementById('bom-item-code').value.trim(),
    category: document.getElementById('bom-category').value,
    description: document.getElementById('bom-description').value.trim(),
    quantity: parseFloat(document.getElementById('bom-quantity').value) || 1,
    unit: document.getElementById('bom-unit').value.trim(),
    targetDate: document.getElementById('bom-target-date').value,
    status: document.getElementById('bom-status').value,
    
    // Supplier Quotes
    supplierA_name: document.getElementById('bom-supA-name').value.trim(),
    supplierA_price: parseFloat(document.getElementById('bom-supA-price').value) || 0,
    supplierA_leadTime: document.getElementById('bom-supA-delivery').value.trim(),
    supplierA_payment: document.getElementById('bom-supA-payment').value.trim(),
    
    supplierB_name: document.getElementById('bom-supB-name').value.trim(),
    supplierB_price: parseFloat(document.getElementById('bom-supB-price').value) || 0,
    supplierB_leadTime: document.getElementById('bom-supB-delivery').value.trim(),
    supplierB_payment: document.getElementById('bom-supB-payment').value.trim(),
    
    supplierC_name: document.getElementById('bom-supC-name').value.trim(),
    supplierC_price: parseFloat(document.getElementById('bom-supC-price').value) || 0,
    supplierC_leadTime: document.getElementById('bom-supC-delivery').value.trim(),
    supplierC_payment: document.getElementById('bom-supC-payment').value.trim(),
    
    winner: document.getElementById('bom-winner').value
  };

  try {
    if (bomId) {
      await apiCall('/api/bom/' + bomId, 'PUT', payload);
      alert('BOM Item updated successfully.');
    } else {
      await apiCall('/api/projects/' + projectId + '/bom', 'POST', payload);
      alert('BOM Item added successfully.');
    }
    
    // Correct modal closing call
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    await fetchBOMItems(projectId);
    renderBOMDashboard();
    renderBOMTable();
  } catch (err) {
    console.error('Error saving BOM item:', err);
    document.getElementById('bom-error').textContent = err.message || 'Error saving item.';
    document.getElementById('bom-error').classList.remove('hidden');
  }
}

async function handleBOMStatusChange(bomId, newStatus) {
  try {
    await apiCall('/api/bom/' + bomId, 'PUT', { status: newStatus });
    alert('Status updated successfully.');
    
    
    const projectId = document.getElementById('bom-project-select').value;
    await fetchBOMItems(projectId);
    renderBOMDashboard();
    renderBOMTable();
  } catch (err) {
    console.error('Error updating status:', err);
    alert('Failed to update status.');
  }
}

async function handleBOMDelete(bomId) {
  if (!confirm('Are you sure you want to delete this BOM item?')) return;
  try {
    await apiCall('/api/bom/' + bomId, 'DELETE');
    alert('BOM Item deleted.');
    
    
    const projectId = document.getElementById('bom-project-select').value;
    await fetchBOMItems(projectId);
    renderBOMDashboard();
    renderBOMTable();
  } catch (err) {
    console.error('Error deleting item:', err);
    alert('Failed to delete BOM item.');
  }
}

function handleBOMEdit(bomId) {
  const item = state.bomItems.find(i => i.id === bomId);
  if (!item) return;

  document.getElementById('bom-id-field').value = item.id;
  document.getElementById('bom-item-code').value = item.itemCode || '';
  document.getElementById('bom-category').value = item.category || 'Raw Material';
  document.getElementById('bom-description').value = item.description || '';
  document.getElementById('bom-quantity').value = item.quantity || 1;
  document.getElementById('bom-unit').value = item.unit || 'Nos';
  document.getElementById('bom-target-date').value = item.targetDate || '';
  document.getElementById('bom-status').value = item.status || 'Draft';

  // Supplier A
  document.getElementById('bom-supA-name').value = item.supplierA_name || '';
  document.getElementById('bom-supA-price').value = item.supplierA_price || '';
  document.getElementById('bom-supA-delivery').value = item.supplierA_leadTime || '';
  document.getElementById('bom-supA-payment').value = item.supplierA_payment || '';

  // Supplier B
  document.getElementById('bom-supB-name').value = item.supplierB_name || '';
  document.getElementById('bom-supB-price').value = item.supplierB_price || '';
  document.getElementById('bom-supB-delivery').value = item.supplierB_leadTime || '';
  document.getElementById('bom-supB-payment').value = item.supplierB_payment || '';

  // Supplier C
  document.getElementById('bom-supC-name').value = item.supplierC_name || '';
  document.getElementById('bom-supC-price').value = item.supplierC_price || '';
  document.getElementById('bom-supC-delivery').value = item.supplierC_leadTime || '';
  document.getElementById('bom-supC-payment').value = item.supplierC_payment || '';

  document.getElementById('bom-winner').value = item.winner || '';

  document.getElementById('bom-modal-title').textContent = 'Edit BOM Item';
  document.getElementById('bom-error').classList.add('hidden');
  
  // Correct modal opening call
  document.getElementById('modal-bom').classList.add('active');
}

function exportBOMToCSV() {
  const projectId = document.getElementById('bom-project-select').value;
  if (!projectId) return;
  
  const proj = state.projects.find(p => p.id === projectId);
  const projName = proj ? proj.name : 'Project';
  
  const headers = [
    'Item Code', 'Description', 'Category', 'Quantity', 'Unit', 'Target Lead Date', 'Status',
    'Supplier A Name', 'Supplier A Price', 'Supplier A Lead Time', 'Supplier A Payment',
    'Supplier B Name', 'Supplier B Price', 'Supplier B Lead Time', 'Supplier B Payment',
    'Supplier C Name', 'Supplier C Price', 'Supplier C Lead Time', 'Supplier C Payment',
    'Winner'
  ];
  const rows = state.bomItems.map(item => [
    item.itemCode||'', item.description||'', item.category||'Raw Material', item.quantity||1, item.unit||'Nos', item.targetDate||'', item.status||'Draft',
    item.supplierA_name||'', item.supplierA_price||0, item.supplierA_leadTime||'', item.supplierA_payment||'',
    item.supplierB_name||'', item.supplierB_price||0, item.supplierB_leadTime||'', item.supplierB_payment||'',
    item.supplierC_name||'', item.supplierC_price||0, item.supplierC_leadTime||'', item.supplierC_payment||'',
    item.winner||''
  ]);
  
  const csvContent = [headers, ...rows].map(row => row.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'BOM_' + projName.replace(/\s+/g, '_') + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function downloadBOMTemplate() {
  const headers = [
    'Item Code', 'Description', 'Category', 'Quantity', 'Unit', 'Target Lead Date', 'Status',
    'Supplier A Name', 'Supplier A Price', 'Supplier A Lead Time', 'Supplier A Payment',
    'Supplier B Name', 'Supplier B Price', 'Supplier B Lead Time', 'Supplier B Payment',
    'Supplier C Name', 'Supplier C Price', 'Supplier C Lead Time', 'Supplier C Payment',
    'Winner'
  ];

  const sampleRows = [
    [
      'RM-ALU-6061', 'Aluminum Plate 6061-T6 (20mm x 500mm x 500mm)', 'Raw Material', '10', 'Nos', '2026-08-15', 'Draft',
      'Hindalco Industries', '12500', '5 days', 'Net 30',
      'Jindal Aluminium', '12100', '7 days', 'Net 45',
      'National Aluminium', '12800', '4 days', 'Advance',
      'Supplier B'
    ],
    [
      'FAST-M8-30', 'M8 x 30mm Stainless Steel Hex Socket Cap Screw', 'Hardware & Fasteners', '200', 'Nos', '2026-08-10', 'Draft',
      'Unbrako Fasteners', '12', '3 days', 'Net 15',
      'TVS Fasteners', '14', '2 days', 'Immediate',
      'Sundram Fasteners', '11', '5 days', 'Net 30',
      'Supplier C'
    ],
    [
      'ELE-SENS-PROX', 'Inductive Proximity Sensor M12 NPN NO', 'Electrical & Sensors', '4', 'Nos', '2026-08-20', 'Draft',
      'Omron Automation', '1850', '10 days', 'Net 30',
      'Pepperl+Fuchs', '1950', '5 days', 'Net 15',
      'Sick India', '2100', '3 days', 'Advance',
      'Supplier A'
    ]
  ];

  const csvContent = [headers, ...sampleRows]
    .map(row => row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'BOM_Import_Template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function parseCSVForBOM(csvText) {
  const lines = csvText.split('\n');
  if (lines.length < 2) return [];
  
  // Headers check (case-insensitive mapping)
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  
  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Simple CSV parser handling quotes
    const cols = [];
    let current = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cols.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cols.push(current.trim());
    
    const map = (name, defaultVal) => {
      const idx = headers.indexOf(name.toLowerCase());
      if (idx !== -1 && cols[idx] !== undefined) return cols[idx].replace(/^"|"$/g, '');
      return defaultVal;
    };

    items.push({
      itemCode: map('item code', map('part no', map('part number', ''))),
      description: map('description', map('item name', map('part name', ''))),
      category: map('category', 'Raw Material'),
      quantity: parseFloat(map('qty', map('quantity', '1'))) || 1,
      unit: map('unit', 'Nos'),
      targetDate: map('target date', map('target lead date', '')),
      status: map('status', 'Draft'),
      
      // Supplier Quotation Mappings
      supplierA_name: map('supplier a name', map('supplier a', '')),
      supplierA_price: parseFloat(map('supplier a price', map('price a', '0'))) || 0,
      supplierA_leadTime: map('supplier a lead time', map('lead time a', '')),
      supplierA_payment: map('supplier a payment', map('payment a', '')),
      
      supplierB_name: map('supplier b name', map('supplier b', '')),
      supplierB_price: parseFloat(map('supplier b price', map('price b', '0'))) || 0,
      supplierB_leadTime: map('supplier b lead time', map('lead time b', '')),
      supplierB_payment: map('supplier b payment', map('payment b', '')),
      
      supplierC_name: map('supplier c name', map('supplier c', '')),
      supplierC_price: parseFloat(map('supplier c price', map('price c', '0'))) || 0,
      supplierC_leadTime: map('supplier c lead time', map('lead time c', '')),
      supplierC_payment: map('supplier c payment', map('payment c', '')),
      
      winner: map('winner', map('winning supplier', 'None'))
    });
  }
  return items;
}

// Render Portal Grid with Lock Flags
function renderPortal() {
  const welcome = document.getElementById('portal-welcome-msg');
  if (welcome && state.currentUser) {
    welcome.textContent = `Welcome back, ${state.currentUser.name} (${state.currentUser.department} - ${state.currentUser.role.replace('_', ' ')}). Select a workspace module below.`;
  }
  
  const role = state.currentUser.role;
  const isOwner = (role === 'owner');
  const isAdmin = (role === 'admin' || isOwner || role === 'superadmin');
  
  // Projects Access Check
  const hasProjects = isAdmin || !state.currentUser.permissions || state.currentUser.permissions.projects === true;
  const projectCard = document.getElementById('portal-card-projects');
  if (projectCard) {
    if (hasProjects) {
      projectCard.style.opacity = '1';
      projectCard.style.pointerEvents = 'auto';
      projectCard.querySelector('button').textContent = 'Enter Workspace →';
      projectCard.querySelector('button').disabled = false;
      projectCard.onclick = () => navigateTo('dashboard');
    } else {
      projectCard.style.opacity = '0.55';
      projectCard.style.pointerEvents = 'none';
      projectCard.querySelector('button').textContent = '🔒 Restricted';
      projectCard.querySelector('button').disabled = true;
      projectCard.onclick = null;
    }
  }
  
  // BOM Access Check
  const hasBOM = isAdmin || (state.currentUser.permissions && state.currentUser.permissions.bom === true);
  const bomCard = document.getElementById('portal-card-bom');
  const bomLock = document.getElementById('portal-bom-lock-icon');
  if (bomCard) {
    if (hasBOM) {
      bomCard.style.opacity = '1';
      bomCard.style.pointerEvents = 'auto';
      if (bomLock) bomLock.style.display = 'none';
      bomCard.querySelector('button').textContent = 'Enter Workspace →';
      bomCard.querySelector('button').disabled = false;
      bomCard.onclick = () => navigateTo('bom');
    } else {
      bomCard.style.opacity = '0.55';
      if (bomLock) bomLock.style.display = 'inline';
      bomCard.querySelector('button').textContent = '🔒 Restricted';
      bomCard.querySelector('button').disabled = true;
      bomCard.onclick = () => alert('Access Denied: You do not have permissions to manage BOMs. Contact your Super Admin.');
    }
  }
  
  // RFQ Access Check
  const hasRFQ = isAdmin || (state.currentUser.permissions && state.currentUser.permissions.rfq === true);
  const rfqCard = document.getElementById('portal-card-rfq');
  const rfqLock = document.getElementById('portal-rfq-lock-icon');
  if (rfqCard) {
    if (hasRFQ) {
      rfqCard.style.opacity = '1';
      rfqCard.style.pointerEvents = 'auto';
      if (rfqLock) rfqLock.style.display = 'none';
      rfqCard.querySelector('button').textContent = 'Enter Workspace →';
      rfqCard.querySelector('button').disabled = false;
      rfqCard.onclick = () => navigateTo('rfq');
    } else {
      rfqCard.style.opacity = '0.55';
      if (rfqLock) rfqLock.style.display = 'inline';
      rfqCard.querySelector('button').textContent = '🔒 Restricted';
      rfqCard.querySelector('button').disabled = true;
      rfqCard.onclick = () => alert('Access Denied: You do not have permissions to access RFQ Tracker. Contact your Super Admin.');
    }
  }
  
  // PR Access Check
  const hasPR = isAdmin || (state.currentUser.permissions && state.currentUser.permissions.pr === true) || role === 'operations_head' || role === 'md';
  const prCard = document.getElementById('portal-card-pr');
  const prLock = document.getElementById('portal-pr-lock-icon');
  if (prCard) {
    if (hasPR) {
      prCard.style.opacity = '1';
      prCard.style.pointerEvents = 'auto';
      if (prLock) prLock.style.display = 'none';
      prCard.querySelector('button').textContent = 'Enter Workspace →';
      prCard.querySelector('button').disabled = false;
      prCard.onclick = () => navigateTo('pr');
    } else {
      prCard.style.opacity = '0.55';
      if (prLock) prLock.style.display = 'inline';
      prCard.querySelector('button').textContent = '🔒 Restricted';
      prCard.querySelector('button').disabled = true;
      prCard.onclick = () => alert('Access Denied: You do not have permissions to access PR Tracker. Contact your Super Admin.');
    }
  }

  // Customize company branding text
  const companyPortalTexts = document.querySelectorAll('.company-name-portal-text');
  const compName = state.settings.companyName || 'PRO-MFG';
  companyPortalTexts.forEach(el => {
    el.textContent = compName;
  });
}


// ==================== PURCHASE REQUISITIONS (PR) TRACKING ====================

function renderPRDashboard() {
  const allPRs = state.prs || [];
  
  const total = allPRs.length;
  const pendingOps = allPRs.filter(pr => pr.status === 'pending_ops').length;
  const pendingMD = allPRs.filter(pr => pr.status === 'pending_md').length;
  const approved = allPRs.filter(pr => pr.status === 'approved').length;
  const rejected = allPRs.filter(pr => pr.status === 'rejected').length;
  const completed = allPRs.filter(pr => pr.status === 'completed').length;
  
  const totalEl = document.getElementById('pr-stat-total');
  const opsEl = document.getElementById('pr-stat-ops');
  const mdEl = document.getElementById('pr-stat-md');
  const appEl = document.getElementById('pr-stat-approved');
  const rejEl = document.getElementById('pr-stat-rejected');
  const compEl = document.getElementById('pr-stat-completed');
  
  if (totalEl) totalEl.textContent = total;
  if (opsEl) opsEl.textContent = pendingOps;
  if (mdEl) mdEl.textContent = pendingMD;
  if (appEl) appEl.textContent = approved;
  if (rejEl) rejEl.textContent = rejected;
  if (compEl) compEl.textContent = completed;

  // Populate project filters
  const prProjectFilter = document.getElementById('pr-project-filter');
  if (prProjectFilter) {
    const selectedVal = prProjectFilter.value;
    prProjectFilter.innerHTML = '<option value="">All Projects</option>';
    state.projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === selectedVal) opt.selected = true;
      prProjectFilter.appendChild(opt);
    });
  }
}

function renderPRTable() {
  const tbody = document.getElementById('pr-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const projectFilter = document.getElementById('pr-project-filter')?.value;
  const statusFilter = document.getElementById('pr-status-filter')?.value;

  let filtered = state.prs || [];

  if (projectFilter) {
    filtered = filtered.filter(pr => pr.projectId === projectFilter);
  }
  if (statusFilter) {
    filtered = filtered.filter(pr => pr.status === statusFilter);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-secondary); padding: 20px;">No purchase requisitions found.</td></tr>`;
    return;
  }

  filtered.forEach(pr => {
    const project = state.projects.find(p => p.id === pr.projectId) || { name: 'Unknown Project' };
    const itemsCount = pr.items ? pr.items.length : 0;
    const totalCost = pr.items ? pr.items.reduce((sum, item) => sum + (parseFloat(item.qty) * parseFloat(item.estimatedPrice)), 0) : 0;

    let statusClass = 'pr-s-pending-ops';
    let statusText = 'Pending Ops Head';
    if (pr.status === 'pending_md') {
      statusClass = 'pr-s-pending-md';
      statusText = 'Pending MD';
    } else if (pr.status === 'approved') {
      statusClass = 'pr-s-approved';
      statusText = pr.assignedToName ? `Approved (To: ${pr.assignedToName})` : 'Approved';
    } else if (pr.status === 'rejected') {
      statusClass = 'pr-s-rejected';
      statusText = 'Rejected';
    } else if (pr.status === 'completed') {
      statusClass = 'pr-s-completed';
      statusText = `Ordered (${pr.poNumber})`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${pr.id}</strong></td>
      <td>${project.name}</td>
      <td>${pr.raisedByName || 'Unknown'}</td>
      <td>${itemsCount} items</td>
      <td>₹${totalCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
      <td><span class="pr-status-badge ${statusClass}">${statusText}</span></td>
      <td>${new Date(pr.createdAt).toLocaleDateString()}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="openPRDetailsModal('${pr.id}')">View Details</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openPRDetailsModal(prId) {
  const pr = state.prs.find(p => p.id === prId);
  if (!pr) return;

  const project = state.projects.find(p => p.id === pr.projectId) || { name: 'Unknown Project' };

  document.getElementById('detail-pr-title').textContent = `Requisition Details - ${pr.id}`;
  document.getElementById('detail-pr-project').textContent = project.name;
  document.getElementById('detail-pr-raisedby').textContent = pr.raisedByName;
  document.getElementById('detail-pr-date').textContent = new Date(pr.createdAt).toLocaleString();
  
  const statusLabel = document.getElementById('detail-pr-status');
  statusLabel.className = 'pr-status-badge';
  if (pr.status === 'pending_ops') {
    statusLabel.classList.add('pr-s-pending-ops');
    statusLabel.textContent = 'Pending Level 1 (Ops Head)';
  } else if (pr.status === 'pending_md') {
    statusLabel.classList.add('pr-s-pending-md');
    statusLabel.textContent = 'Pending Level 2 (MD)';
  } else if (pr.status === 'approved') {
    statusLabel.classList.add('pr-s-approved');
    statusLabel.textContent = 'Approved & Sent to Purchase';
  } else if (pr.status === 'rejected') {
    statusLabel.classList.add('pr-s-rejected');
    statusLabel.textContent = 'Rejected';
  } else if (pr.status === 'completed') {
    statusLabel.classList.add('pr-s-completed');
    statusLabel.textContent = `Ordered (PO: ${pr.poNumber})`;
  }

  // Populate items
  const tbody = document.getElementById('detail-pr-items-tbody');
  tbody.innerHTML = '';
  pr.items.forEach(item => {
    const rate = parseFloat(item.estimatedPrice) || 0;
    const qty = parseFloat(item.qty) || 0;
    const total = rate * qty;
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.description}</td>
      <td>${qty}</td>
      <td>${item.unit}</td>
      <td>₹	ext{₹} ${rate.toLocaleString('en-IN')}</td>
      <td>₹	ext{₹} ${total.toLocaleString('en-IN')}</td>
    `.replace('₹	ext{₹}', '₹').replace('₹	ext{₹}', '₹');
    tbody.appendChild(tr);
  });

  // Populate approvals history
  const opsContent = document.getElementById('detail-pr-ops-log-content');
  if (pr.opsHeadApproval) {
    opsContent.innerHTML = `
      <strong>Status:</strong> ${pr.opsHeadApproval.status.toUpperCase()}<br>
      <strong>By:</strong> ${pr.opsHeadApproval.approvedBy} on ${new Date(pr.opsHeadApproval.date).toLocaleDateString()}<br>
      <strong>Remarks:</strong> ${pr.opsHeadApproval.remarks || 'None'}
    `;
  } else {
    opsContent.innerHTML = 'No action taken yet.';
  }

  const mdContent = document.getElementById('detail-pr-md-log-content');
  if (pr.mdApproval) {
    mdContent.innerHTML = `
      <strong>Status:</strong> ${pr.mdApproval.status.toUpperCase()}<br>
      <strong>By:</strong> ${pr.mdApproval.approvedBy} on ${new Date(pr.mdApproval.date).toLocaleDateString()}<br>
      <strong>Remarks:</strong> ${pr.mdApproval.remarks || 'None'}
    `;
  } else {
    mdContent.innerHTML = 'No action taken yet.';
  }

  // Action box configuration
  const actionBox = document.getElementById('detail-pr-action-box');
  const remarksGroup = document.getElementById('detail-pr-remarks-group');
  const assigneeGroup = document.getElementById('detail-pr-assignee-group');
  const poGroup = document.getElementById('detail-pr-po-group');
  const btnApprove = document.getElementById('btn-pr-action-approve');
  const btnReject = document.getElementById('btn-pr-action-reject');
  const btnPO = document.getElementById('btn-pr-action-po');

  actionBox.style.display = 'none';
  remarksGroup.style.display = 'block';
  if (assigneeGroup) assigneeGroup.style.display = 'none';
  poGroup.style.display = 'none';
  btnApprove.style.display = 'inline-block';
  btnReject.style.display = 'inline-block';
  btnPO.style.display = 'none';

  const assigneeSelect = document.getElementById('detail-pr-assignee');
  if (assigneeSelect) {
    const purchasingUsers = state.users.filter(u => u.department === 'Purchasing');
    assigneeSelect.innerHTML = '<option value="">-- Any Purchasing Member --</option>' + 
      purchasingUsers.map(u => `<option value="${escapeHTML(u.name)}">${escapeHTML(u.name)}</option>`).join('');
  }

  document.getElementById('detail-pr-remarks').value = '';
  if (assigneeSelect) assigneeSelect.value = '';
  document.getElementById('detail-pr-po-number').value = '';

  const role = state.currentUser.role;
  const isPurchasing = state.currentUser.department === 'Purchasing';
  const isAdmin = role === 'admin' || role === 'owner' || role === 'superadmin';

  if (pr.status === 'pending_ops' && (role === 'operations_head' || isAdmin)) {
    actionBox.style.display = 'block';
    document.getElementById('detail-pr-action-title').textContent = 'Perform Level 1 (Operations Head) Action';
    btnApprove.onclick = () => handlePRAction('approve', pr.id);
    btnReject.onclick = () => handlePRAction('reject', pr.id);
  } else if (pr.status === 'pending_md' && (role === 'md' || isAdmin)) {
    actionBox.style.display = 'block';
    if (assigneeGroup) assigneeGroup.style.display = 'block';
    document.getElementById('detail-pr-action-title').textContent = 'Perform Level 2 (Managing Director) Action';
    btnApprove.onclick = () => handlePRAction('approve', pr.id);
    btnReject.onclick = () => handlePRAction('reject', pr.id);
  } else if (pr.status === 'approved' && (isPurchasing || isAdmin)) {
    actionBox.style.display = 'block';
    document.getElementById('detail-pr-action-title').textContent = 'Record Purchase & Issue PO';
    remarksGroup.style.display = 'none';
    poGroup.style.display = 'block';
    btnApprove.style.display = 'none';
    btnReject.style.display = 'none';
    btnPO.style.display = 'inline-block';
    btnPO.onclick = () => handlePRAction('po', pr.id);
  }

  document.getElementById('modal-pr-details').classList.add('active');
}

async function handlePRAction(action, prId) {
  const remarks = document.getElementById('detail-pr-remarks').value;
  const poNumber = document.getElementById('detail-pr-po-number').value;
  const assignedToName = document.getElementById('detail-pr-assignee')?.value || '';

  try {
    if (action === 'approve') {
      await apiCall(`/api/prs/${prId}/approve`, 'PUT', { remarks, assignedToName });
    } else if (action === 'reject') {
      await apiCall(`/api/prs/${prId}/reject`, 'PUT', { remarks });
    } else if (action === 'po') {
      if (!poNumber) {
        alert('PO number is required.');
        return;
      }
      await apiCall(`/api/prs/${prId}/po`, 'PUT', { poNumber });
    }

    document.getElementById('modal-pr-details').classList.remove('active');
    await fetchPRs();
    renderPRDashboard();
    renderPRTable();
    showToast('Requisition action recorded successfully.');
  } catch (err) {
    alert(err.message || 'Error processing action.');
  }
}

function openPRFormModal() {
  const projSelect = document.getElementById('pr-project');
  if (projSelect) {
    projSelect.innerHTML = '<option value="">-- Select Project --</option>';
    state.projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      projSelect.appendChild(opt);
    });
  }

  const tbody = document.getElementById('pr-items-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    addPRItemRow();
  }

  document.getElementById('pr-form-error')?.classList.add('hidden');
  document.getElementById('modal-pr-form')?.classList.add('active');
}

function addPRItemRow() {
  const tbody = document.getElementById('pr-items-tbody');
  if (!tbody) return;
  
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="pr-item-desc" required placeholder="Item description/specs..."></td>
    <td><input type="number" class="pr-item-qty" required style="width:80px;" min="0.01" step="any" value="1"></td>
    <td><input type="text" class="pr-item-unit" required style="width:70px;" value="Nos"></td>
    <td><input type="number" class="pr-item-rate" required style="width:100px;" min="0" value="0"></td>
    <td><button type="button" class="btn btn-danger btn-sm" onclick="this.closest('tr').remove()">&times;</button></td>
  `;
  tbody.appendChild(tr);
}

async function onPRFormSubmit(e) {
  e.preventDefault();
  const projectId = document.getElementById('pr-project').value;
  const rows = document.querySelectorAll('#pr-items-tbody tr');
  
  const items = [];
  rows.forEach(row => {
    const description = row.querySelector('.pr-item-desc').value;
    const qty = parseFloat(row.querySelector('.pr-item-qty').value) || 0;
    const unit = row.querySelector('.pr-item-unit').value;
    const estimatedPrice = parseFloat(row.querySelector('.pr-item-rate').value) || 0;
    
    if (description) {
      items.push({ description, qty, unit, estimatedPrice });
    }
  });

  if (items.length === 0) {
    alert('Please add at least one item.');
    return;
  }

  try {
    await apiCall('/api/prs', 'POST', { projectId, items });
    document.getElementById('modal-pr-form').classList.remove('active');
    await fetchPRs();
    renderPRDashboard();
    renderPRTable();
    showToast('Purchase Requisition raised successfully.');
  } catch (err) {
    const errEl = document.getElementById('pr-form-error');
    if (errEl) {
      errEl.textContent = err.message || 'Error submitting Requisition.';
      errEl.classList.remove('hidden');
    }
  }
}
