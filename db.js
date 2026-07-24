const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const dataDir = process.env.DATA_DIR || __dirname;

// Ensure the data directory exists (critical for Render Persistent Disk)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbFile = process.env.NODE_ENV === 'test'
  ? path.join(__dirname, 'database.test.sqlite')
  : path.join(dataDir, 'database.sqlite');

// Auto delete existing test database on test startup to ensure fresh test runs
if (process.env.NODE_ENV === 'test' && fs.existsSync(dbFile)) {
  try { fs.unlinkSync(dbFile); } catch (_) {}
}

const db = new Database(dbFile);

// Enable WAL mode for performance and concurrent readers
db.pragma('journal_mode = WAL');

// Automatic Schema Migration: Add missing columns to tasks table if they don't exist
try {
  const tableInfo = db.prepare("PRAGMA table_info(tasks)").all();
  const columns = tableInfo.map(c => c.name);
  if (!columns.includes('start_date')) {
    db.prepare("ALTER TABLE tasks ADD COLUMN start_date TEXT").run();
  }
  if (!columns.includes('allocated_operator')) {
    db.prepare("ALTER TABLE tasks ADD COLUMN allocated_operator TEXT").run();
  }
  if (!columns.includes('operator_role')) {
    db.prepare("ALTER TABLE tasks ADD COLUMN operator_role TEXT").run();
  }
  if (!columns.includes('mapped_duration')) {
    db.prepare("ALTER TABLE tasks ADD COLUMN mapped_duration REAL").run();
  }
} catch (err) {
  console.error("Migration error:", err.message);
}

// Self-initialization checking & seeding
const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
if (!tableExists) {
  console.log('Database tables not found. Initializing database with schema.sql...');
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    const statements = schemaSql.split(';').map(s => s.trim()).filter(s => s.length > 0);
    
    db.transaction(() => {
      // Create tables
      for (const stmt of statements) {
        db.prepare(stmt).run();
      }

      // Seed default multi-tenant organizations
      const ORG_ID = 'org_1';
      db.prepare(`
        INSERT INTO organizations (id, name, plan, status, mrr, trial_ends_at, payment_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ORG_ID,
        'Original Organization',
        'Pro Plan',
        'active',
        29.0,
        null,
        'paid',
        new Date().toISOString()
      );

      db.prepare(`
        INSERT INTO organizations (id, name, plan, status, mrr, trial_ends_at, payment_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'saas_platform',
        'SaaS Platform Owner',
        'Enterprise Plan',
        'active',
        0.0,
        null,
        'paid',
        new Date().toISOString()
      );

      const ownerHash = bcrypt.hashSync('owner123', 10);
      const adminHash = bcrypt.hashSync('admin123', 10);
      const pmHash = bcrypt.hashSync('admin123', 10);
      const userHash = bcrypt.hashSync('admin123', 10);

      db.prepare(`
        INSERT INTO users (id, org_id, name, email, password, role, department, status, created_at, permissions_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'owner_1',
        'saas_platform',
        'SaaS Owner',
        'owner@saas.com',
        ownerHash,
        'owner',
        'Platform',
        'active',
        new Date().toISOString(),
        '{}'
      );

      // Test users and dummy data removed to provide a clean slate

      const DEFAULT_DEPARTMENTS = [
        'Engineering',
        'Design',
        'Purchasing',
        'Fabrication',
        'Assembly',
        'Programming',
        'Quality Control',
        'Tool Room',
        'Management',
        'Operations'
      ];
      for (const dept of DEFAULT_DEPARTMENTS) {
        db.prepare('INSERT OR IGNORE INTO departments (name, org_id) VALUES (?, ?)').run(dept, ORG_ID);
      }
    })();
    
    // Migrations
    try { db.prepare('ALTER TABLE purchase_requisitions ADD COLUMN assigned_to_name TEXT').run(); } catch(e) {}
    
    console.log('✓ Database tables and seed data initialized successfully.');
  } else {
    console.error(`schema.sql not found at ${schemaPath}`);
  }
}

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

const DEFAULT_DEPARTMENTS = [
  'Engineering',
  'Design',
  'Purchasing',
  'Fabrication',
  'Assembly',
  'Programming',
  'Quality Control'
];

// Helper to convert underscore snake_case columns back to camelCase properties where needed
function mapUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    orgId: u.org_id,
    name: u.name,
    email: u.email,
    password: u.password,
    role: u.role,
    department: u.department,
    status: u.status,
    createdAt: u.created_at,
    permissions: JSON.parse(u.permissions_json || '{}')
  };
}

function mapProject(p) {
  if (!p) return null;
  return {
    id: p.id,
    orgId: p.org_id,
    name: p.name,
    description: p.description,
    startDate: p.start_date,
    endDate: p.end_date,
    customerName: p.customer_name,
    customerLogo: p.customer_logo,
    createdAt: p.created_at,
    members: JSON.parse(p.members_json || '[]'),
    timeline: JSON.parse(p.timeline_json || '[]')
  };
}

function mapTask(t) {
  if (!t) return null;
  return {
    id: t.id,
    orgId: t.org_id,
    projectId: t.project_id,
    title: t.title,
    description: t.description,
    assigneeId: t.assignee_id,
    primary: t.priority,
    priority: t.priority,
    status: t.status,
    dueDate: t.due_date,
    startDate: t.start_date || '',
    allocatedOperator: t.allocated_operator || '',
    operatorRole: t.operator_role || '',
    mappedDuration: t.mapped_duration || 0,
    createdBy: t.created_by,
    createdAt: t.created_at,
    attachments: JSON.parse(t.attachments_json || '[]')
  };
}

function mapRFQ(r) {
  if (!r) return null;
  return {
    id: r.id,
    orgId: r.org_id,
    rfqNumber: r.rfq_number,
    status: r.status,
    progress: r.progress,
    priority: r.priority,
    customerName: r.customer_name,
    projectTitle: r.project_title,
    receivedDate: r.received_date,
    dueDate: r.due_date,
    owner: r.owner,
    nextAction: r.next_action,
    remarks: r.remarks,
    createdAt: r.created_at
  };
}

function mapBOM(b) {
  if (!b) return null;
  return {
    id: b.id,
    orgId: b.org_id,
    projectId: b.project_id,
    itemCode: b.item_code,
    category: b.category,
    description: b.description,
    quantity: b.quantity,
    unit: b.unit,
    targetDate: b.target_date,
    status: b.status,
    supplierA_name: b.supplier_a_name,
    supplierA_price: b.supplier_a_price,
    supplierA_leadTime: b.supplier_a_lead_time,
    supplierA_payment: b.supplier_a_payment,
    supplierB_name: b.supplier_b_name,
    supplierB_price: b.supplier_b_price,
    supplierB_leadTime: b.supplier_b_lead_time,
    supplierB_payment: b.supplier_b_payment,
    supplierC_name: b.supplier_c_name,
    supplierC_price: b.supplier_c_price,
    supplierC_leadTime: b.supplier_c_lead_time,
    supplierC_payment: b.supplier_c_payment,
    winner: b.winner,
    createdAt: b.created_at
  };
}

function mapPR(p) {
  if (!p) return null;
  return {
    id: p.id,
    orgId: p.org_id,
    projectId: p.project_id,
    raisedById: p.raised_by_id,
    raisedByName: p.raised_by_name,
    status: p.status,
    createdAt: p.created_at,
    poNumber: p.po_number,
    items: JSON.parse(p.items_json || '[]'),
    opsHeadApproval: p.ops_head_approval_json ? JSON.parse(p.ops_head_approval_json) : null,
    mdApproval: p.md_approval_json ? JSON.parse(p.md_approval_json) : null,
    assignedToName: p.assigned_to_name || null
  };
}

function mapPendingSignup(p) {
  if (!p) return null;
  return {
    email: p.email,
    name: p.name,
    password: p.password,
    phone: p.phone,
    otp: p.otp,
    orgId: p.org_id,
    expiresAt: p.expires_at
  };
}

module.exports = {
  // SAAS OWNER METHODS
  getAllOrganizations: () => {
    return db.prepare('SELECT * FROM organizations').all();
  },
  getOrganizationById: (orgId) => {
    return db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId);
  },
  updateOrganization: (orgId, updates) => {
    const fields = [];
    const values = [];
    Object.keys(updates).forEach(key => {
      const dbKey = key === 'trialEndsAt' ? 'trial_ends_at' : (key === 'paymentStatus' ? 'payment_status' : key);
      fields.push(`${dbKey} = ?`);
      values.push(updates[key]);
    });
    values.push(orgId);
    db.prepare(`UPDATE organizations SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId);
  },
  getAllPlans: () => [
    { id: 'plan_starter', name: 'Starter Plan', price: 19, maxUsers: 10, features: ['tasks', 'projects'] },
    { id: 'plan_pro', name: 'Pro Plan', price: 29, maxUsers: 50, features: ['tasks', 'projects', 'reports', 'departments'] }
  ],
  getAllUsersAllOrgs: () => {
    return db.prepare('SELECT * FROM users').all().map(mapUser);
  },

  // ORG SETTINGS
  getSettings: (orgId) => {
    const s = db.prepare('SELECT * FROM settings WHERE org_id = ?').get(orgId);
    return s ? { orgId: s.org_id, companyName: s.company_name, company_logo: s.company_logo || '', companyLogo: s.company_logo || '' } : { orgId, companyName: 'PRO-MFG', companyLogo: '' };
  },
  
  updateSettings: (orgId, updates) => {
    const existing = db.prepare('SELECT * FROM settings WHERE org_id = ?').get(orgId);
    const companyName = updates.companyName !== undefined ? updates.companyName : (existing ? existing.company_name : 'PRO-MFG');
    const companyLogo = updates.companyLogo !== undefined ? updates.companyLogo : (existing ? existing.company_logo : '');

    db.prepare(`INSERT OR REPLACE INTO settings (org_id, company_name, company_logo) VALUES (?, ?, ?)`).run(orgId, companyName, companyLogo);
    return { orgId, companyName, companyLogo };
  },

  // USERS
  getUsers: (orgId) => {
    return db.prepare('SELECT * FROM users WHERE org_id = ?').all(orgId).map(mapUser);
  },
  getUserById: (id) => {
    return mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
  },
  getUserByEmail: (email) => {
    return mapUser(db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email));
  },
  
  createUser: (orgId, user) => {
    const activeCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE org_id = ? AND status = 'active'").get(orgId).count;
    if (activeCount >= 50 && user.status === 'active') {
      throw new Error('Limit reached: Maximum of 50 active user accounts allowed for this plan.');
    }
    
    const existing = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(user.email);
    if (existing) {
      throw new Error('Email is already in use.');
    }

    const id = user.id || ('u' + Date.now() + Math.floor(Math.random() * 100));
    const passwordHash = bcrypt.hashSync(user.password || 'password123', 10);
    const department = user.department || 'Engineering';
    const permissions = user.permissions || {
      projects: true,
      bom: department === 'Purchasing',
      rfq: user.role === 'admin' || user.role === 'owner' || user.role === 'project_manager' || user.role === 'department_head',
      pr: true
    };

    db.prepare(`
      INSERT INTO users (id, org_id, name, email, password, role, department, status, created_at, permissions_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      orgId,
      user.name,
      user.email,
      passwordHash,
      user.role,
      department,
      user.status || 'active',
      new Date().toISOString(),
      JSON.stringify(permissions)
    );

    return mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
  },

  updateUser: (orgId, id, updates) => {
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing && orgId !== 'saas_platform') throw new Error('User not found.');

    if (updates.email && updates.email.toLowerCase() !== existing.email.toLowerCase()) {
      const emailDup = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(updates.email);
      if (emailDup) throw new Error('Email is already in use.');
    }

    const fields = [];
    const values = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.email !== undefined) { fields.push('email = ?'); values.push(updates.email); }
    if (updates.password !== undefined && updates.password !== '') { 
      fields.push('password = ?'); 
      values.push(bcrypt.hashSync(updates.password, 10)); 
    }
    if (updates.role !== undefined) { fields.push('role = ?'); values.push(updates.role); }
    if (updates.department !== undefined) { fields.push('department = ?'); values.push(updates.department); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.permissions !== undefined) { fields.push('permissions_json = ?'); values.push(JSON.stringify(updates.permissions)); }

    if (fields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    return mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
  },

  deleteUser: (orgId, id) => {
    const existing = db.prepare('SELECT * FROM users WHERE id = ? AND org_id = ?').get(id, orgId);
    if (!existing) throw new Error('User not found.');
    db.prepare('DELETE FROM users WHERE id = ? AND org_id = ?').run(id, orgId);
    return true;
  },

  // PROJECTS
  getProjects: (orgId) => {
    return db.prepare('SELECT * FROM projects WHERE org_id = ?').all(orgId).map(mapProject);
  },
  getProjectById: (orgId, id) => {
    return mapProject(db.prepare('SELECT * FROM projects WHERE id = ? AND org_id = ?').get(id, orgId));
  },
  
  createProject: (orgId, project) => {
    const id = project.id || ('p' + Date.now() + Math.floor(Math.random() * 100));
    const members = project.members || [];
    const timeline = project.timeline || JSON.parse(JSON.stringify(DEFAULT_TIMELINE_STAGES));

    db.prepare(`
      INSERT INTO projects (id, org_id, name, description, start_date, end_date, customer_name, customer_logo, created_at, members_json, timeline_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      orgId,
      project.name,
      project.description || '',
      project.startDate || '',
      project.endDate || '',
      project.customerName || '',
      project.customerLogo || '',
      new Date().toISOString(),
      JSON.stringify(members),
      JSON.stringify(timeline)
    );

    return mapProject(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
  },

  updateProject: (orgId, id, updates) => {
    const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND org_id = ?').get(id, orgId);
    if (!existing) throw new Error('Project not found.');

    const fields = [];
    const values = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.startDate !== undefined) { fields.push('start_date = ?'); values.push(updates.startDate); }
    if (updates.endDate !== undefined) { fields.push('end_date = ?'); values.push(updates.endDate); }
    if (updates.customerName !== undefined) { fields.push('customer_name = ?'); values.push(updates.customerName); }
    if (updates.customerLogo !== undefined) { fields.push('customer_logo = ?'); values.push(updates.customerLogo); }
    if (updates.members !== undefined) { fields.push('members_json = ?'); values.push(JSON.stringify(updates.members)); }
    if (updates.timeline !== undefined) { fields.push('timeline_json = ?'); values.push(JSON.stringify(updates.timeline)); }

    if (fields.length > 0) {
      values.push(id);
      values.push(orgId);
      db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`).run(...values);
    }

    return mapProject(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
  },

  deleteProject: (orgId, id) => {
    db.prepare('DELETE FROM projects WHERE id = ? AND org_id = ?').run(id, orgId);
    db.prepare('DELETE FROM tasks WHERE project_id = ? AND org_id = ?').run(id, orgId);
    return true;
  },

  // TASKS
  getTasks: (orgId) => {
    return db.prepare('SELECT * FROM tasks WHERE org_id = ?').all(orgId).map(mapTask);
  },
  getTaskById: (orgId, id) => {
    return mapTask(db.prepare('SELECT * FROM tasks WHERE id = ? AND org_id = ?').get(id, orgId));
  },

  createTask: (orgId, task) => {
    const id = task.id || ('t' + Date.now() + Math.floor(Math.random() * 100));
    const attachments = task.attachments || [];

    db.prepare(`
      INSERT INTO tasks (id, org_id, project_id, title, description, assignee_id, priority, status, due_date, start_date, allocated_operator, operator_role, mapped_duration, created_by, created_at, attachments_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      orgId,
      task.projectId,
      task.title,
      task.description || '',
      task.assigneeId || '',
      task.priority || 'medium',
      task.status || 'todo',
      task.dueDate || '',
      task.startDate || '',
      task.allocatedOperator || '',
      task.operatorRole || '',
      task.mappedDuration || null,
      task.createdBy || '',
      new Date().toISOString(),
      JSON.stringify(attachments)
    );

    return mapTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
  },

  updateTask: (orgId, id, updates) => {
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND org_id = ?').get(id, orgId);
    if (!existing) throw new Error('Task not found.');

    const fields = [];
    const values = [];

    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.assigneeId !== undefined) { fields.push('assignee_id = ?'); values.push(updates.assigneeId); }
    if (updates.priority !== undefined) { fields.push('priority = ?'); values.push(updates.priority); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.dueDate !== undefined) { fields.push('due_date = ?'); values.push(updates.dueDate); }
    if (updates.startDate !== undefined) { fields.push('start_date = ?'); values.push(updates.startDate); }
    if (updates.allocatedOperator !== undefined) { fields.push('allocated_operator = ?'); values.push(updates.allocatedOperator); }
    if (updates.operatorRole !== undefined) { fields.push('operator_role = ?'); values.push(updates.operatorRole); }
    if (updates.mappedDuration !== undefined) { fields.push('mapped_duration = ?'); values.push(updates.mappedDuration); }
    if (updates.attachments !== undefined) { fields.push('attachments_json = ?'); values.push(JSON.stringify(updates.attachments)); }

    if (fields.length > 0) {
      values.push(id);
      values.push(orgId);
      db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`).run(...values);
    }

    return mapTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
  },

  deleteTask: (orgId, id) => {
    db.prepare('DELETE FROM tasks WHERE id = ? AND org_id = ?').run(id, orgId);
    db.prepare('DELETE FROM comments WHERE task_id = ? AND org_id = ?').run(id, orgId);
    return true;
  },

  // COMMENTS
  getCommentsByTaskId: (orgId, taskId) => {
    return db.prepare('SELECT * FROM comments WHERE task_id = ? AND org_id = ? ORDER BY created_at ASC').all(taskId, orgId);
  },

  createComment: (orgId, comment) => {
    const id = comment.id || ('c' + Date.now() + Math.floor(Math.random() * 100));
    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO comments (id, org_id, task_id, text, user_id, user_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      orgId,
      comment.taskId,
      comment.text,
      comment.userId,
      comment.userName,
      createdAt
    );

    return db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
  },

  // NOTIFICATIONS
  getNotificationsByUserId: (orgId, userId) => {
    return db.prepare('SELECT * FROM notifications WHERE user_id = ? AND org_id = ? ORDER BY created_at DESC').all(userId, orgId).map(n => ({
      id: n.id,
      orgId: n.org_id,
      userId: n.user_id,
      type: n.type,
      message: n.message,
      read: n.read === 1,
      createdAt: n.created_at
    }));
  },

  createNotification: (orgId, notification) => {
    const id = notification.id || ('n' + Date.now() + Math.floor(Math.random() * 100));
    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO notifications (id, org_id, user_id, type, message, read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      orgId,
      notification.userId,
      notification.type || '',
      notification.message,
      0,
      createdAt
    );

    const n = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    return {
      id: n.id,
      orgId: n.org_id,
      userId: n.user_id,
      type: n.type,
      message: n.message,
      read: false,
      createdAt: n.created_at
    };
  },

  markNotificationRead: (orgId, id, userId) => {
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ? AND org_id = ?').run(id, userId, orgId);
    const n = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    return n ? {
      id: n.id,
      orgId: n.org_id,
      userId: n.user_id,
      type: n.type,
      message: n.message,
      read: true,
      createdAt: n.created_at
    } : null;
  },

  markAllNotificationsRead: (orgId, userId) => {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND org_id = ?').run(userId, orgId);
    return true;
  },

  // DEPARTMENTS
  getDepartments: (orgId) => {
    return db.prepare('SELECT name FROM departments WHERE org_id = ?').all(orgId).map(d => d.name);
  },

  addDepartment: (orgId, name) => {
    const cleanName = name.trim();
    if (!cleanName) throw new Error('Department name cannot be empty.');
    
    const existing = db.prepare('SELECT * FROM departments WHERE LOWER(name) = LOWER(?) AND org_id = ?').get(cleanName, orgId);
    if (existing) throw new Error('Department already exists.');

    db.prepare('INSERT INTO departments (name, org_id) VALUES (?, ?)').run(cleanName, orgId);
    return db.prepare('SELECT name FROM departments WHERE org_id = ?').all(orgId).map(d => d.name);
  },

  deleteDepartment: (orgId, name) => {
    db.prepare('DELETE FROM departments WHERE LOWER(name) = LOWER(?) AND org_id = ?').run(name.trim(), orgId);
    return true;
  },

  // PENDING SIGNUPS
  createPendingSignup: (signup) => {
    const userExist = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(signup.email);
    if (userExist) throw new Error('Email is already registered.');

    db.prepare('DELETE FROM pending_signups WHERE LOWER(email) = LOWER(?)').run(signup.email);

    const newOrgId = 'org_' + Date.now();
    db.prepare(`
      INSERT INTO organizations (id, name, plan, status, mrr, trial_ends_at, payment_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newOrgId,
      signup.name + "'s Workspace",
      'Free Trial',
      'pending_approval',
      0,
      new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      'unpaid',
      new Date().toISOString()
    );

    DEFAULT_DEPARTMENTS.forEach(name => {
      db.prepare('INSERT OR IGNORE INTO departments (name, org_id) VALUES (?, ?)').run(name, newOrgId);
    });

    const expiresAt = Date.now() + 15 * 60 * 1000;
    db.prepare(`
      INSERT INTO pending_signups (email, name, password, phone, otp, org_id, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      signup.email,
      signup.name,
      signup.password,
      signup.phone || '',
      signup.otp,
      newOrgId,
      expiresAt
    );

    return mapPendingSignup(db.prepare('SELECT * FROM pending_signups WHERE email = ?').get(signup.email));
  },

  verifyOtp: (email, otp) => {
    const p = db.prepare('SELECT * FROM pending_signups WHERE LOWER(email) = LOWER(?)').get(email);
    if (!p || p.otp.toString() !== otp.toString() || p.expires_at < Date.now()) {
      throw new Error('Invalid or expired OTP verification code.');
    }

    const userExist = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
    if (userExist) throw new Error('Email is already in use.');

    const userId = 'u' + Date.now() + Math.floor(Math.random() * 100);
    const passwordHash = bcrypt.hashSync(p.password, 10);

    db.prepare(`
      INSERT INTO users (id, org_id, name, email, password, role, department, status, created_at, permissions_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      p.org_id,
      p.name,
      p.email,
      passwordHash,
      'admin', // first user is admin
      'Management',
      'pending_approval',
      new Date().toISOString(),
      JSON.stringify({ projects: true, bom: true, rfq: true, pr: true })
    );

    // Create default settings for this org
    db.prepare('INSERT OR REPLACE INTO settings (org_id, company_name, company_logo) VALUES (?, ?, ?)').run(p.org_id, 'PRO-MFG', '');

    db.prepare('DELETE FROM pending_signups WHERE LOWER(email) = LOWER(?)').run(email);

    return mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
  },

  // RFQS TRACKING
  getRFQs: (orgId) => {
    return db.prepare('SELECT * FROM rfqs WHERE org_id = ? ORDER BY created_at DESC').all(orgId).map(mapRFQ);
  },
  getRFQById: (orgId, id) => {
    return mapRFQ(db.prepare('SELECT * FROM rfqs WHERE id = ? AND org_id = ?').get(id, orgId));
  },
  createRFQ: (orgId, rfqData) => {
    const id = rfqData.id || ('rfq_' + Date.now() + Math.floor(Math.random() * 100));
    
    // Auto increment RFQ number
    const count = db.prepare('SELECT COUNT(*) as count FROM rfqs WHERE org_id = ?').get(orgId).count;
    const rfqNumber = rfqData.rfqNumber || ('RFQ-' + new Date().getFullYear() + '-' + String(count + 1).padStart(4, '0'));

    db.prepare(`
      INSERT INTO rfqs (id, org_id, rfq_number, status, progress, priority, customer_name, project_title, received_date, due_date, owner, next_action, remarks, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      orgId,
      rfqNumber,
      rfqData.status || 'Open',
      rfqData.progress || 0,
      rfqData.priority || 'Medium',
      rfqData.customerName || '',
      rfqData.projectTitle || '',
      rfqData.receivedDate || '',
      rfqData.dueDate || '',
      rfqData.owner || '',
      rfqData.nextAction || '',
      rfqData.remarks || '',
      new Date().toISOString()
    );

    return mapRFQ(db.prepare('SELECT * FROM rfqs WHERE id = ?').get(id));
  },
  updateRFQ: (orgId, id, updates) => {
    const existing = db.prepare('SELECT * FROM rfqs WHERE id = ? AND org_id = ?').get(id, orgId);
    if (!existing) throw new Error('RFQ not found.');

    const fields = [];
    const values = [];

    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.progress !== undefined) { fields.push('progress = ?'); values.push(updates.progress); }
    if (updates.priority !== undefined) { fields.push('priority = ?'); values.push(updates.priority); }
    if (updates.customerName !== undefined) { fields.push('customer_name = ?'); values.push(updates.customerName); }
    if (updates.projectTitle !== undefined) { fields.push('project_title = ?'); values.push(updates.projectTitle); }
    if (updates.receivedDate !== undefined) { fields.push('received_date = ?'); values.push(updates.receivedDate); }
    if (updates.dueDate !== undefined) { fields.push('due_date = ?'); values.push(updates.dueDate); }
    if (updates.owner !== undefined) { fields.push('owner = ?'); values.push(updates.owner); }
    if (updates.nextAction !== undefined) { fields.push('next_action = ?'); values.push(updates.nextAction); }
    if (updates.remarks !== undefined) { fields.push('remarks = ?'); values.push(updates.remarks); }

    if (fields.length > 0) {
      values.push(id);
      values.push(orgId);
      db.prepare(`UPDATE rfqs SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`).run(...values);
    }

    return mapRFQ(db.prepare('SELECT * FROM rfqs WHERE id = ?').get(id));
  },
  deleteRFQ: (orgId, id) => {
    db.prepare('DELETE FROM rfqs WHERE id = ? AND org_id = ?').run(id, orgId);
    return true;
  },

  // BOM TRACKING
  getBOMItems: (orgId, projectId) => {
    return db.prepare('SELECT * FROM bom_items WHERE org_id = ? AND project_id = ? ORDER BY created_at DESC').all(orgId, projectId).map(mapBOM);
  },
  getBOMItemById: (orgId, id) => {
    return mapBOM(db.prepare('SELECT * FROM bom_items WHERE id = ? AND org_id = ?').get(id, orgId));
  },
  createBOMItem: (orgId, bomData) => {
    const id = bomData.id || ('bom_' + Date.now() + Math.floor(Math.random() * 100));
    db.prepare(`
      INSERT INTO bom_items (
        id, org_id, project_id, item_code, category, description, quantity, unit, target_date, status, 
        supplier_a_name, supplier_a_price, supplier_a_lead_time, supplier_a_payment,
        supplier_b_name, supplier_b_price, supplier_b_lead_time, supplier_b_payment,
        supplier_c_name, supplier_c_price, supplier_c_lead_time, supplier_c_payment,
        winner, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      orgId,
      bomData.projectId,
      bomData.itemCode || '',
      bomData.category || '',
      bomData.description || '',
      bomData.quantity || 1,
      bomData.unit || 'Nos',
      bomData.targetDate || '',
      bomData.status || 'Draft',
      bomData.supplierA_name || '',
      bomData.supplierA_price || 0,
      bomData.supplierA_leadTime || '',
      bomData.supplierA_payment || '',
      bomData.supplierB_name || '',
      bomData.supplierB_price || 0,
      bomData.supplierB_leadTime || '',
      bomData.supplierB_payment || '',
      bomData.supplierC_name || '',
      bomData.supplierC_price || 0,
      bomData.supplierC_leadTime || '',
      bomData.supplierC_payment || '',
      bomData.winner || '',
      new Date().toISOString()
    );

    return mapBOM(db.prepare('SELECT * FROM bom_items WHERE id = ?').get(id));
  },
  updateBOMItem: (orgId, id, updates) => {
    const existing = db.prepare('SELECT * FROM bom_items WHERE id = ? AND org_id = ?').get(id, orgId);
    if (!existing) throw new Error('BOM item not found.');

    const fields = [];
    const values = [];

    if (updates.itemCode !== undefined) { fields.push('item_code = ?'); values.push(updates.itemCode); }
    if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.quantity !== undefined) { fields.push('quantity = ?'); values.push(updates.quantity); }
    if (updates.unit !== undefined) { fields.push('unit = ?'); values.push(updates.unit); }
    if (updates.targetDate !== undefined) { fields.push('target_date = ?'); values.push(updates.targetDate); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    
    if (updates.supplierA_name !== undefined) { fields.push('supplier_a_name = ?'); values.push(updates.supplierA_name); }
    if (updates.supplierA_price !== undefined) { fields.push('supplier_a_price = ?'); values.push(updates.supplierA_price); }
    if (updates.supplierA_leadTime !== undefined) { fields.push('supplier_a_lead_time = ?'); values.push(updates.supplierA_leadTime); }
    if (updates.supplierA_payment !== undefined) { fields.push('supplier_a_payment = ?'); values.push(updates.supplierA_payment); }
    
    if (updates.supplierB_name !== undefined) { fields.push('supplier_b_name = ?'); values.push(updates.supplierB_name); }
    if (updates.supplierB_price !== undefined) { fields.push('supplier_b_price = ?'); values.push(updates.supplierB_price); }
    if (updates.supplierB_leadTime !== undefined) { fields.push('supplier_b_lead_time = ?'); values.push(updates.supplierB_leadTime); }
    if (updates.supplierB_payment !== undefined) { fields.push('supplier_b_payment = ?'); values.push(updates.supplierB_payment); }
    
    if (updates.supplierC_name !== undefined) { fields.push('supplier_c_name = ?'); values.push(updates.supplierC_name); }
    if (updates.supplierC_price !== undefined) { fields.push('supplier_c_price = ?'); values.push(updates.supplierC_price); }
    if (updates.supplierC_leadTime !== undefined) { fields.push('supplier_c_lead_time = ?'); values.push(updates.supplierC_leadTime); }
    if (updates.supplierC_payment !== undefined) { fields.push('supplier_c_payment = ?'); values.push(updates.supplierC_payment); }
    
    if (updates.winner !== undefined) { fields.push('winner = ?'); values.push(updates.winner); }

    if (fields.length > 0) {
      values.push(id);
      values.push(orgId);
      db.prepare(`UPDATE bom_items SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`).run(...values);
    }

    return mapBOM(db.prepare('SELECT * FROM bom_items WHERE id = ?').get(id));
  },
  deleteBOMItem: (orgId, id) => {
    db.prepare('DELETE FROM bom_items WHERE id = ? AND org_id = ?').run(id, orgId);
    return true;
  },
  bulkImportBOM: (orgId, projectId, items) => {
    const insertStmt = db.prepare(`
      INSERT INTO bom_items (
        id, org_id, project_id, item_code, category, description, quantity, unit, target_date, status,
        supplier_a_name, supplier_a_price, supplier_a_lead_time, supplier_a_payment,
        supplier_b_name, supplier_b_price, supplier_b_lead_time, supplier_b_payment,
        supplier_c_name, supplier_c_price, supplier_c_lead_time, supplier_c_payment,
        winner, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const inserted = [];
    db.transaction(() => {
      for (const item of items) {
        const id = 'bom_' + Date.now() + Math.floor(Math.random() * 10000);
        const createdAt = new Date().toISOString();
        insertStmt.run(
          id,
          orgId,
          projectId,
          item.itemCode || '',
          item.category || 'Raw Material',
          item.description || '',
          item.quantity || 1,
          item.unit || 'Nos',
          item.targetDate || '',
          item.status || 'Draft',
          item.supplierA_name || '',
          item.supplierA_price || 0,
          item.supplierA_leadTime || '',
          item.supplierA_payment || '',
          item.supplierB_name || '',
          item.supplierB_price || 0,
          item.supplierB_leadTime || '',
          item.supplierB_payment || '',
          item.supplierC_name || '',
          item.supplierC_price || 0,
          item.supplierC_leadTime || '',
          item.supplierC_payment || '',
          item.winner || '',
          createdAt
        );
        inserted.push(mapBOM(db.prepare('SELECT * FROM bom_items WHERE id = ?').get(id)));
      }
    })();
    return inserted;
  },

  // PURCHASE REQUISITION (PR) METHODS
  getPRs: (orgId) => {
    return db.prepare('SELECT * FROM purchase_requisitions WHERE org_id = ? ORDER BY created_at DESC').all(orgId).map(mapPR);
  },
  getPRById: (orgId, id) => {
    return mapPR(db.prepare('SELECT * FROM purchase_requisitions WHERE id = ? AND org_id = ?').get(id, orgId));
  },
  createPR: (orgId, prData) => {
    // Generate sequential PR code
    const count = db.prepare('SELECT COUNT(*) as count FROM purchase_requisitions WHERE org_id = ?').get(orgId).count;
    const prCode = prData.id || ('PR-' + new Date().getFullYear() + '-' + String(count + 1).padStart(4, '0'));

    db.prepare(`
      INSERT INTO purchase_requisitions (
        id, org_id, project_id, raised_by_id, raised_by_name, status, created_at, po_number, 
        items_json, ops_head_approval_json, md_approval_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      prCode,
      orgId,
      prData.projectId,
      prData.raisedById,
      prData.raisedByName,
      'pending_ops',
      new Date().toISOString(),
      null,
      JSON.stringify(prData.items || []),
      null,
      null
    );

    return mapPR(db.prepare('SELECT * FROM purchase_requisitions WHERE id = ? AND org_id = ?').get(prCode, orgId));
  },
  updatePR: (orgId, id, updates) => {
    const existing = db.prepare('SELECT * FROM purchase_requisitions WHERE id = ? AND org_id = ?').get(id, orgId);
    if (!existing) throw new Error('PR not found.');

    const fields = [];
    const values = [];

    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.poNumber !== undefined) { fields.push('po_number = ?'); values.push(updates.poNumber); }
    if (updates.items !== undefined) { fields.push('items_json = ?'); values.push(JSON.stringify(updates.items)); }
    if (updates.opsHeadApproval !== undefined) { fields.push('ops_head_approval_json = ?'); values.push(JSON.stringify(updates.opsHeadApproval)); }
    if (updates.mdApproval !== undefined) { fields.push('md_approval_json = ?'); values.push(JSON.stringify(updates.mdApproval)); }
    if (updates.assignedToName !== undefined) { fields.push('assigned_to_name = ?'); values.push(updates.assignedToName); }

    if (fields.length > 0) {
      values.push(id);
      values.push(orgId);
      db.prepare(`UPDATE purchase_requisitions SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`).run(...values);
    }

    return mapPR(db.prepare('SELECT * FROM purchase_requisitions WHERE id = ? AND org_id = ?').get(id, orgId));
  },
  deletePR: (orgId, id) => {
    db.prepare('DELETE FROM purchase_requisitions WHERE id = ? AND org_id = ?').run(id, orgId);
    return true;
  }
};
