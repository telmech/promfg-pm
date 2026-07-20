const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'project-manager-secret-key-9988';

// Socket.io Authentication Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return next(new Error('Invalid token'));
    socket.user = user;
    if (user.orgId) {
      socket.join(user.orgId);
    }
    next();
  });
});

io.on('connection', (socket) => {
  // Client connected and joined their org room
});

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer Storage Configuration for File Attachments
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Body parser middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Broadcast middleware: Automatically emit 'data_updated' on successful mutation requests
app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function(body) {
    originalJson.call(this, body);
    if (['POST', 'PUT', 'DELETE'].includes(req.method) && res.statusCode >= 200 && res.statusCode < 300) {
      if (!req.path.startsWith('/api/auth') && req.user && req.user.orgId) {
        io.to(req.user.orgId).emit('data_updated');
      }
    }
  };
  next();
});

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

// Serve SPA frontend static files (supports both /public/ subfolder and root folder)
const publicDir = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
app.use(express.static(publicDir));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/owner', (req, res) => {
  const ownerPath = fs.existsSync(path.join(__dirname, 'public', 'owner.html'))
    ? path.join(__dirname, 'public', 'owner.html')
    : path.join(__dirname, 'owner.html');
  if (fs.existsSync(ownerPath)) return res.sendFile(ownerPath);
  res.status(404).send('Owner page not found.');
});

app.get('/', (req, res) => {
  const indexPath = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
    ? path.join(__dirname, 'public', 'index.html')
    : path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.status(404).send('Index page not found.');
});

// Mock Email Notification Helper
function sendMockEmail(userId, message) {
  try {
    const user = db.getUserById(userId);
    if (user && user.email) {
      console.log('\n============================================================');
      console.log(`[EMAIL SENDING MOCK]`);
      console.log(`To: ${user.name} <${user.email}>`);
      console.log(`Message: ${message}`);
      console.log('============================================================\n');
    }
  } catch (err) {
    console.error('Failed to send mock email:', err.message);
  }
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access token required.' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
    
    // Fetch live user status
    const user = db.getUserById(decoded.id);
    if (!user) return res.status(404).json({ error: 'User account not found.' });
    if (user.status !== 'active') return res.status(403).json({ error: 'Your account has been deactivated.' });
    
    req.user = user;
    next();
  });
}

// Super Admin Only Middleware
function requireSuperAdmin(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Access denied: Admin permissions required.' });
  }
  next();
}

// User Management Authorization (Super Admin / Admin / PM can add and edit users)
function requireUserManagementRights(req, res, next) {
  const role = req.user.role;
  if (role !== 'admin' && role !== 'owner' && role !== 'project_manager') {
    return res.status(403).json({ error: 'Access denied: Super Admin, Admin, or PM permissions required.' });
  }
  next();
}

// Admin / PM / Super Admin Authorization Middleware (Can create projects, tasks, timelines)
function requireAdminPMOrSuperAdmin(req, res, next) {
  const role = req.user.role;
  if (role !== 'admin' && role !== 'owner' && role !== 'project_manager') {
    return res.status(403).json({ error: 'Access denied: PM or Admin permissions required.' });
  }
  next();
}

// Strict Admin/Super Admin for deletions
function requireDeletionRights(req, res, next) {
  const role = req.user.role;
  if (role !== 'admin' && role !== 'owner') {
    return res.status(403).json({ error: 'Access denied: Only Super Admin or Admin can delete projects/users.' });
  }
  next();
}

// Granular project access middleware
function requireProjectAccess(req, res, next) {
  const isAdmin = req.user.role === 'admin' || req.user.role === 'owner';
  const hasProjectPermission = req.user.permissions
    ? req.user.permissions.projects === true
    : true; // Default to true if not set
    
  if (isAdmin || hasProjectPermission) {
    return next();
  }
  return res.status(403).json({ error: 'Access Denied: You do not have permissions to access Projects & Tasks.' });
}

// Granular RFQ access middleware
function requireRFQAccess(req, res, next) {
  const isAdmin = req.user.role === 'admin' || req.user.role === 'owner';
  const hasRFQPermission = req.user.permissions
    ? req.user.permissions.rfq === true
    : (req.user.role === 'project_manager' || req.user.department === 'Sales');
    
  if (isAdmin || hasRFQPermission) {
    return next();
  }
  return res.status(403).json({ error: 'Access Denied: You do not have permissions to access RFQ Tracker.' });
}

// Granular PR access middleware
function requirePRAccess(req, res, next) {
  const isAdmin = req.user.role === 'admin' || req.user.role === 'owner' || req.user.role === 'superadmin';
  const hasPRPermission = req.user.permissions
    ? req.user.permissions.pr === true
    : true; // Default to true
  if (isAdmin || hasPRPermission) {
    return next();
  }
  return res.status(403).json({ error: 'Access denied: You do not have permissions to access PR Tracker.' });
}


// --- API ROUTES ---

// 1. Auth Endpoints: Login & Signup
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.getUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ error: 'This account is deactivated.' });
  }

  const bcrypt = require('bcryptjs');
  const validPassword = bcrypt.compareSync(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Look up org for plan info
  const org = db.getOrganizationById(user.orgId) || {};

  // Sign Token — embed orgId so all subsequent requests are org-scoped
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, orgId: user.orgId },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
      department: user.department || 'Engineering',
      status: user.status,
      plan: org.plan || 'Free Trial',
      paymentStatus: org.paymentStatus || 'unpaid',
      trialEndsAt: org.trialEndsAt
    }
  });
});

app.post('/api/auth/signup', (req, res) => {
  const { name, email, password, department } = req.body;
  if (!name || !email || !password || !department) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  // Corporate Domain Validation: Enforce non-free emails (office mail id)
  const freeEmailDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'mail.com', 'live.com'];
  const emailDomain = email.split('@')[1]?.toLowerCase();
  if (!emailDomain || freeEmailDomains.includes(emailDomain)) {
    return res.status(400).json({ error: 'Corporate registration restriction: Please sign up with your corporate/office email address.' });
  }

  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit code
    
    db.createPendingSignup({
      name,
      email,
      password,
      department,
      otp
    });

    // Output OTP mock email to server logs
    console.log('\n============================================================');
    console.log(`[EMAIL SENDING MOCK]`);
    console.log(`To: ${name} <${email}>`);
    console.log(`Message: Welcome to Antigravity PM! Your 6-digit OTP verification code is: ${otp}`);
    console.log('============================================================\n');

    res.json({ message: 'Office verification OTP generated. Check your corporate inbox.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP verification code are required.' });
  }

  try {
    const user = db.verifyOtp(email, otp);
    const newOrg = db.getOrganizationById(user.orgId) || {};
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, orgId: user.orgId },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
        department: user.department,
        status: user.status,
        plan: newOrg.plan || 'Free Trial',
        paymentStatus: newOrg.paymentStatus || 'unpaid',
        trialEndsAt: newOrg.trialEndsAt
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Auth Endpoint: Get Current User Profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  const org = db.getOrganizationById(req.user.orgId) || {};
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
    orgId: req.user.orgId,
    department: req.user.department || 'Engineering',
    status: req.user.status,
    plan: org.plan || 'Free Trial',
    paymentStatus: org.paymentStatus || 'unpaid',
    trialEndsAt: org.trialEndsAt
  });
});


// 2. User Management APIs
app.get('/api/users', authenticateToken, (req, res) => {
  const users = db.getUsers(req.user.orgId).map(u => {
    const { password, ...safeUser } = u;
    return safeUser;
  });
  res.json(users);
});

app.post('/api/users', authenticateToken, requireUserManagementRights, (req, res) => {
  const { name, email, password, role, department, status, permissions } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    const newUser = db.createUser(req.user.orgId, {
      name,
      email,
      password,
      role,
      department: department || 'Engineering',
      status: status || 'active',
      permissions: permissions || { projects: true, bom: false, rfq: false }
    });
    
    const { password: _, ...safeUser } = newUser;
    res.status(201).json(safeUser);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/users/:id', authenticateToken, requireUserManagementRights, (req, res) => {
  const { name, email, password, role, department, status, permissions } = req.body;
  try {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (password !== undefined && password !== '') updates.password = password;
    if (role !== undefined) updates.role = role;
    if (department !== undefined) updates.department = department;
    if (status !== undefined) updates.status = status;
    if (permissions !== undefined) updates.permissions = permissions;

    const updated = db.updateUser(req.user.orgId, req.params.id, updates);
    const { password: _, ...safeUser } = updated;
    res.json(safeUser);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/users/:id', authenticateToken, requireUserManagementRights, requireDeletionRights, (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }
  try {
    db.deleteUser(req.user.orgId, req.params.id);
    res.json({ message: 'User deleted successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// 3. Departments APIs (Super Admin only can edit/add, anyone authenticated can view)
app.get('/api/departments/default', (req, res) => {
  res.json(['Engineering', 'Design', 'Purchasing', 'Fabrication', 'Assembly', 'Programming', 'Quality Control', 'Management']);
});

app.get('/api/departments', authenticateToken, (req, res) => {
  res.json(db.getDepartments(req.user.orgId));
});

app.post('/api/departments', authenticateToken, requireSuperAdmin, (req, res) => {
  const { name } = req.body;
  try {
    const updated = db.addDepartment(req.user.orgId, name);
    res.status(201).json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/departments/:name', authenticateToken, requireSuperAdmin, (req, res) => {
  try {
    db.deleteDepartment(req.user.orgId, req.params.name);
    res.json({ message: 'Department deleted successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// 4. Global Branding Settings APIs
app.get('/api/settings', authenticateToken, (req, res) => {
  res.json(db.getSettings(req.user.orgId));
});

app.put('/api/settings', authenticateToken, requireSuperAdmin, (req, res) => {
  const { companyName } = req.body;
  if (!companyName) return res.status(400).json({ error: 'Company Name is required.' });
  try {
    const updated = db.updateSettings(req.user.orgId, { companyName });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/settings/logo', authenticateToken, requireSuperAdmin, upload.single('companyLogo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No logo file uploaded.' });
  }
  try {
    const updated = db.updateSettings(req.user.orgId, { companyLogo: req.file.filename });
    res.json(updated);
  } catch (err) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    res.status(400).json({ error: err.message });
  }
});


// 5. Project Management APIs
app.get('/api/projects', authenticateToken, requireProjectAccess, (req, res) => {
  const allProjects = db.getProjects(req.user.orgId);
  const role = req.user.role;
  if (role === 'admin' || role === 'owner' || role === 'project_manager') {
    return res.json(allProjects);
  }
  const memberProjects = allProjects.filter(p => p.members && p.members.includes(req.user.id));
  res.json(memberProjects);
});

app.post('/api/projects', authenticateToken, requireProjectAccess, requireAdminPMOrSuperAdmin, (req, res) => {
  const { name, description, startDate, endDate, members, customerName } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name is required.' });

  try {
    const project = db.createProject(req.user.orgId, {
      name,
      description: description || '',
      startDate: startDate || '',
      endDate: endDate || '',
      members: members || [],
      customerName: customerName || '',
      customerLogo: ''
    });
    res.status(201).json(project);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/projects/:id', authenticateToken, requireProjectAccess, requireAdminPMOrSuperAdmin, (req, res) => {
  const { name, description, startDate, endDate, members, customerName } = req.body;
  try {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (startDate !== undefined) updates.startDate = startDate;
    if (endDate !== undefined) updates.endDate = endDate;
    if (members !== undefined) updates.members = members;
    if (customerName !== undefined) updates.customerName = customerName;

    const updated = db.updateProject(req.user.orgId, req.params.id, updates);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/projects/:id', authenticateToken, requireProjectAccess, requireAdminPMOrSuperAdmin, requireDeletionRights, (req, res) => {
  try {
    db.deleteProject(req.user.orgId, req.params.id);
    res.json({ message: 'Project deleted successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Project Customer Logo Upload API
app.post('/api/projects/:id/customer-logo', authenticateToken, requireAdminPMOrSuperAdmin, upload.single('customerLogo'), (req, res) => {
  const project = db.getProjectById(req.user.orgId, req.params.id);
  if (!project) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Project not found.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No logo file uploaded.' });
  }

  try {
    const updated = db.updateProject(req.user.orgId, project.id, { customerLogo: req.file.filename });
    res.json(updated);
  } catch (err) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    res.status(400).json({ error: err.message });
  }
});

// Project Timeline Update API
app.put('/api/projects/:id/timeline', authenticateToken, requireProjectAccess, requireAdminPMOrSuperAdmin, (req, res) => {
  const { timeline } = req.body;
  if (!Array.isArray(timeline)) {
    return res.status(400).json({ error: 'Timeline must be a valid list of stages.' });
  }

  try {
    const updated = db.updateProject(req.user.orgId, req.params.id, { timeline });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// 6. Task Management APIs (Now allows member task creation)
app.get('/api/tasks', authenticateToken, requireProjectAccess, (req, res) => {
  const allTasks = db.getTasks(req.user.orgId);
  const allProjects = db.getProjects(req.user.orgId);
  const role = req.user.role;
  
  if (role === 'admin' || role === 'owner' || role === 'project_manager') {
    return res.json(allTasks);
  }

  const allowedProjectIds = allProjects
    .filter(p => p.members && p.members.includes(req.user.id))
    .map(p => p.id);
    
  const filteredTasks = allTasks.filter(t => 
    t.assigneeId === req.user.id || t.createdBy === req.user.id || allowedProjectIds.includes(t.projectId)
  );
  
  res.json(filteredTasks);
});

app.post('/api/tasks', authenticateToken, requireProjectAccess, (req, res) => {
  const { projectId, title, description, assigneeId, priority, status, dueDate, startDate, allocatedOperator, operatorRole, mappedDuration } = req.body;
  if (!projectId || !title) {
    return res.status(400).json({ error: 'Project ID and Title are required.' });
  }

  const role = req.user.role;

  // Enforce member project assignment constraint
  if (role !== 'admin' && role !== 'owner' && role !== 'project_manager') {
    const project = db.getProjectById(req.user.orgId, projectId);
    if (!project || !project.members.includes(req.user.id)) {
      return res.status(403).json({ error: 'Access Denied: Members can only create tasks on projects they belong to.' });
    }
  }

  try {
    const task = db.createTask(req.user.orgId, {
      projectId,
      title,
      description: description || '',
      assigneeId: assigneeId || req.user.id, // defaults task assignee to creator
      priority: priority || 'medium',
      status: status || 'todo',
      dueDate: dueDate || '',
      startDate: startDate || '',
      allocatedOperator: allocatedOperator || '',
      operatorRole: operatorRole || 'None',
      mappedDuration: parseFloat(mappedDuration) || 0,
      createdBy: req.user.id, // save task creator profile
      attachments: []
    });

    if (task.assigneeId && task.assigneeId !== req.user.id) {
      const msg = `You have been assigned to task "${task.title}"`;
      db.createNotification(req.user.orgId, {
        userId: task.assigneeId,
        text: msg,
        type: 'assignment'
      });
      sendMockEmail(task.assigneeId, msg);
    }

    res.status(201).json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/tasks/:id', authenticateToken, requireProjectAccess, (req, res) => {
  const taskId = req.params.id;
  const currentTask = db.getTaskById(req.user.orgId, taskId);
  if (!currentTask) return res.status(404).json({ error: 'Task not found.' });

  const { projectId, title, description, assigneeId, priority, status, dueDate, startDate, allocatedOperator, operatorRole, mappedDuration } = req.body;
  const role = req.user.role;

  if (role !== 'admin' && role !== 'owner' && role !== 'project_manager') {
    const isCreator = currentTask.createdBy === req.user.id;
    const isAssignee = currentTask.assigneeId === req.user.id;

    if (!isCreator && !isAssignee) {
      return res.status(403).json({ error: 'Access denied: You do not have permissions for this task.' });
    }

    // Assignee who is NOT creator can only update status
    if (!isCreator && isAssignee) {
      if (projectId !== undefined || title !== undefined || description !== undefined || 
          assigneeId !== undefined || priority !== undefined || dueDate !== undefined ||
          startDate !== undefined || allocatedOperator !== undefined || operatorRole !== undefined || mappedDuration !== undefined) {
        return res.status(403).json({ error: 'Access denied: You can only edit details on tasks you created.' });
      }
    }
  }

  try {
    const oldAssigneeId = currentTask.assigneeId;
    const updates = {};
    
    if (status !== undefined) updates.status = status;
    
    // Managers or Creators can update details
    if (role === 'admin' || role === 'owner' || role === 'project_manager' || currentTask.createdBy === req.user.id) {
      if (projectId !== undefined) updates.projectId = projectId;
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (assigneeId !== undefined) updates.assigneeId = assigneeId;
      if (priority !== undefined) updates.priority = priority;
      if (dueDate !== undefined) updates.dueDate = dueDate;
      if (startDate !== undefined) updates.startDate = startDate;
      if (allocatedOperator !== undefined) updates.allocatedOperator = allocatedOperator;
      if (operatorRole !== undefined) updates.operatorRole = operatorRole;
      if (mappedDuration !== undefined) updates.mappedDuration = parseFloat(mappedDuration) || 0;
    }

    const updatedTask = db.updateTask(req.user.orgId, taskId, updates);

    if (assigneeId !== undefined && assigneeId !== oldAssigneeId && assigneeId !== '') {
      const msg = `Task "${updatedTask.title}" has been reassigned to you.`;
      db.createNotification(req.user.orgId, {
        userId: assigneeId,
        text: msg,
        type: 'assignment'
      });
      sendMockEmail(assigneeId, msg);

      if (oldAssigneeId) {
        db.createNotification(req.user.orgId, {
          userId: oldAssigneeId,
          text: `Task "${updatedTask.title}" has been reassigned to another teammate.`,
          type: 'assignment_removed'
        });
      }
    }

    if (status !== undefined && status !== currentTask.status && 
        role !== 'admin' && role !== 'owner' && role !== 'project_manager') {
      
      const managers = db.getUsers(req.user.orgId).filter(u => 
        (u.role === 'admin' || u.role === 'owner' || u.role === 'project_manager') && 
        u.status === 'active'
      );
      managers.forEach(mgr => {
        db.createNotification(req.user.orgId, {
          userId: mgr.id,
          text: `User "${req.user.name}" updated task "${updatedTask.title}" status to "${status.toUpperCase()}"`,
          type: 'status_update'
        });
      });
    }

    res.json(updatedTask);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', authenticateToken, requireProjectAccess, (req, res) => {
  const currentTask = db.getTaskById(req.user.orgId, req.params.id);
  if (!currentTask) return res.status(404).json({ error: 'Task not found.' });

  const role = req.user.role;
  const isManager = (role === 'admin' || role === 'owner' || role === 'project_manager');
  const isCreator = currentTask.createdBy === req.user.id;

  if (!isManager && !isCreator) {
    return res.status(403).json({ error: 'Access denied: You can only delete tasks you created.' });
  }

  try {
    db.deleteTask(req.user.orgId, req.params.id);
    res.json({ message: 'Task deleted successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// 7. Comments APIs
app.get('/api/tasks/:taskId/comments', authenticateToken, (req, res) => {
  const task = db.getTaskById(req.user.orgId, req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  const role = req.user.role;

  if (role !== 'admin' && role !== 'owner' && role !== 'project_manager') {
    const projects = db.getProjects(req.user.orgId);
    const isMemberOfProject = projects.some(p => p.id === task.projectId && p.members.includes(req.user.id));
    const isAssignee = task.assigneeId === req.user.id;
    const isCreator = task.createdBy === req.user.id;
    if (!isAssignee && !isCreator && !isMemberOfProject) {
      return res.status(403).json({ error: 'Access denied to task details.' });
    }
  }

  const comments = db.getCommentsByTaskId(req.user.orgId, req.params.taskId);
  res.json(comments);
});

app.post('/api/tasks/:taskId/comments', authenticateToken, (req, res) => {
  const task = db.getTaskById(req.user.orgId, req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Comment text is required.' });
  const role = req.user.role;

  if (role !== 'admin' && role !== 'owner' && role !== 'project_manager') {
    const projects = db.getProjects(req.user.orgId);
    const isMemberOfProject = projects.some(p => p.id === task.projectId && p.members.includes(req.user.id));
    const isAssignee = task.assigneeId === req.user.id;
    const isCreator = task.createdBy === req.user.id;
    if (!isAssignee && !isCreator && !isMemberOfProject) {
      return res.status(403).json({ error: 'Access denied.' });
    }
  }

  try {
    const comment = db.createComment(req.user.orgId, {
      taskId: req.params.taskId,
      userId: req.user.id,
      userName: req.user.name,
      text
    });

    const isManager = (role === 'admin' || role === 'owner' || role === 'project_manager');
    if (isManager && task.assigneeId) {
      db.createNotification(req.user.orgId, {
        userId: task.assigneeId,
        text: `Manager commented on task "${task.title}": "${text.substring(0, 30)}..."`,
        type: 'comment'
      });
    } else if (!isManager && task.assigneeId === req.user.id) {
      const managers = db.getUsers(req.user.orgId).filter(u => 
        (u.role === 'admin' || u.role === 'owner' || u.role === 'project_manager') && 
        u.status === 'active'
      );
      managers.forEach(mgr => {
        db.createNotification(req.user.orgId, {
          userId: mgr.id,
          text: `Member "${req.user.name}" commented on task "${task.title}"`,
          type: 'comment'
        });
      });
    }

    res.status(201).json(comment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// 8. File Attachment API
app.post('/api/tasks/:taskId/attachments', authenticateToken, upload.single('attachment'), (req, res) => {
  const task = db.getTaskById(req.user.orgId, req.params.taskId);
  if (!task) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Task not found.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  const role = req.user.role;

  if (role !== 'admin' && role !== 'owner' && role !== 'project_manager') {
    const projects = db.getProjects(req.user.orgId);
    const isMemberOfProject = projects.some(p => p.id === task.projectId && p.members.includes(req.user.id));
    const isAssignee = task.assigneeId === req.user.id;
    const isCreator = task.createdBy === req.user.id;
    if (!isAssignee && !isCreator && !isMemberOfProject) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'Access denied.' });
    }
  }

  try {
    const attachment = {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedBy: req.user.name,
      uploadedAt: new Date().toISOString()
    };

    const updatedAttachments = [...(task.attachments || []), attachment];
    db.updateTask(req.user.orgId, task.id, { attachments: updatedAttachments });

    if (role !== 'admin' && role !== 'owner' && role !== 'project_manager' && role !== 'superadmin') {
      const managers = db.getUsers(req.user.orgId).filter(u => 
        (u.role === 'admin' || u.role === 'owner' || u.role === 'project_manager') && 
        u.status === 'active'
      );
      managers.forEach(mgr => {
        db.createNotification(req.user.orgId, {
          userId: mgr.id,
          text: `User "${req.user.name}" uploaded file "${attachment.originalname}" to task "${task.title}"`,
          type: 'upload'
        });
      });
    }

    res.json({ attachment, message: 'File uploaded successfully.' });
  } catch (err) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    res.status(400).json({ error: err.message });
  }
});


// 9. Notifications API
app.get('/api/notifications', authenticateToken, (req, res) => {
  const notifications = db.getNotificationsByUserId(req.user.orgId, req.user.id);
  res.json(notifications);
});

app.put('/api/notifications/:id/read', authenticateToken, (req, res) => {
  const updated = db.markNotificationRead(req.user.orgId, req.params.id, req.user.id);
  if (!updated) return res.status(404).json({ error: 'Notification not found.' });
  res.json(updated);
});

app.post('/api/notifications/read-all', authenticateToken, (req, res) => {
  db.markAllNotificationsRead(req.user.orgId, req.user.id);
  res.json({ message: 'All notifications marked as read.' });
});


// Periodic task due date checker
app.post('/api/notifications/check-due-dates', authenticateToken, (req, res) => {
  const tasks = db.getTasks(req.user.orgId).filter(t => t.status !== 'done' && t.dueDate && t.assigneeId);
  const now = new Date();
  const warningWindow = 48 * 60 * 60 * 1000;
  
  let notifiedCount = 0;
  
  tasks.forEach(task => {
    const dueTime = new Date(task.dueDate).getTime();
    const timeDiff = dueTime - now.getTime();
    
    if (timeDiff > 0 && timeDiff <= warningWindow) {
      const dbInstance = db.getNotificationsByUserId(req.user.orgId, task.assigneeId);
      const recentWarning = dbInstance.some(n => 
        n.type === 'due_warning' && 
        n.text.includes(task.title) && 
        (now.getTime() - new Date(n.createdAt).getTime() < 24 * 60 * 60 * 1000)
      );
      
      if (!recentWarning) {
        const msg = `Urgent: Task "${task.title}" is due on ${task.dueDate}!`;
        db.createNotification(req.user.orgId, {
          userId: task.assigneeId,
          text: msg,
          type: 'due_warning'
        });
        sendMockEmail(task.assigneeId, msg);
        notifiedCount++;
      }
    }
  });
  
  res.json({ triggeredNotifications: notifiedCount });
});


// ==========================================
// SAAS OWNER PANEL APIS
// ==========================================
function requireOwnerRights(req, res, next) {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Access denied. Owner only.' });
  }
  next();
}

app.get('/api/owner/metrics', authenticateToken, requireOwnerRights, (req, res) => {
  const orgs = db.getAllOrganizations();
  const activeOrgs = orgs.filter(o => o.status === 'active');
  const mrr = activeOrgs.reduce((sum, o) => sum + (o.mrr || 0), 0);
  const arr = mrr * 12;
  const users = db.getAllUsersAllOrgs();
  const activeUsers = users.filter(u => u.status === 'active' && u.role !== 'owner').length;

  res.json({ mrr, arr, totalOrgs: orgs.length, activeOrgs: activeOrgs.length, activeUsers });
});

app.get('/api/owner/organizations', authenticateToken, requireOwnerRights, (req, res) => {
  res.json(db.getAllOrganizations());
});

app.put('/api/owner/organizations/:id', authenticateToken, requireOwnerRights, (req, res) => {
  try {
    const updated = db.updateOrganization(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/owner/plans', authenticateToken, requireOwnerRights, (req, res) => {
  res.json(db.getAllPlans());
});

app.post('/api/owner/impersonate/:orgId', authenticateToken, requireOwnerRights, (req, res) => {
  try {
    const orgId = req.params.orgId;
    const orgUsers = db.getAllUsersAllOrgs().filter(u => u.orgId === orgId);
    let targetUser = orgUsers.find(u => u.role === 'admin') || orgUsers[0];
    if (!targetUser) throw new Error('No users found in this organization.');

    console.log(`\n[AUDIT] Owner ${req.user.email} impersonated ${targetUser.email} in Org ${orgId} at ${new Date().toISOString()}\n`);
    const impersonationToken = jwt.sign(
      { id: targetUser.id, email: targetUser.email, role: targetUser.role, orgId: targetUser.orgId },
      JWT_SECRET,
      { expiresIn: '2h' }
    );
    res.json({ token: impersonationToken, user: targetUser });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Organization Billing checkout (for Org Admins to upgrade their own org)
app.post('/api/org/checkout', authenticateToken, (req, res) => {
  try {
    const { plan, mrr } = req.body;
    if (!plan) return res.status(400).json({ error: 'Plan name is required.' });

    setTimeout(() => {
      const org = db.updateOrganization(req.user.orgId, {
        plan: plan,
        paymentStatus: 'paid',
        status: 'active',
        mrr: mrr || 0
      });
      // Get the updated user object with updated org plan properties
      const user = db.getUserById(req.user.id);
      const safeUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
        department: user.department || 'Engineering',
        status: user.status,
        plan: org.plan,
        paymentStatus: org.paymentStatus,
        trialEndsAt: org.trialEndsAt
      };
      res.json({ message: `Payment successful! Your organization is now on ${plan} Plan.`, org, user: safeUser });
    }, 1500);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Approve / Deny users
app.post('/api/users/:id/approve', authenticateToken, requireUserManagementRights, (req, res) => {
  try {
    const updated = db.updateUser(req.user.orgId, req.params.id, { status: 'active' });
    const { password: _, ...safe } = updated;
    res.json({ message: 'User approved', user: safe });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/users/:id/deny', authenticateToken, requireUserManagementRights, (req, res) => {
  try {
    const updated = db.updateUser(req.user.orgId, req.params.id, { status: 'deactivated' });
    const { password: _, ...safe } = updated;
    res.json({ message: 'User denied', user: safe });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== RFQ APIs ====================
app.get('/api/rfqs', authenticateToken, requireRFQAccess, (req, res) => {
  res.json(db.getRFQs(req.user.orgId));
});

app.post('/api/rfqs', authenticateToken, requireRFQAccess, (req, res) => {
  try {
    const rfq = db.createRFQ(req.user.orgId, req.body);
    res.status(201).json(rfq);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/rfqs/:id', authenticateToken, requireRFQAccess, (req, res) => {
  try {
    const rfq = db.updateRFQ(req.user.orgId, req.params.id, req.body);
    res.json(rfq);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/rfqs/:id', authenticateToken, requireRFQAccess, (req, res) => {
  try {
    db.deleteRFQ(req.user.orgId, req.params.id);
    res.json({ message: 'RFQ deleted.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== BOM API ENDPOINTS ====================
function requirePurchasingOrAdmin(req, res, next) {
  const isAdmin = req.user.role === 'admin' || req.user.role === 'owner';
  const hasBOMPermission = req.user.permissions
    ? req.user.permissions.bom === true
    : req.user.department === 'Purchasing';
    
  if (isAdmin || hasBOMPermission) {
    return next();
  }
  return res.status(403).json({ error: 'Access Denied: You do not have permissions to manage BOMs.' });
}

app.get('/api/projects/:projectId/bom', authenticateToken, requirePurchasingOrAdmin, (req, res) => {
  try {
    const items = db.getBOMItems(req.user.orgId, req.params.projectId);
    res.json(items);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/projects/:projectId/bom', authenticateToken, requirePurchasingOrAdmin, (req, res) => {
  try {
    const itemData = {
      projectId: req.params.projectId,
      ...req.body
    };
    const item = db.createBOMItem(req.user.orgId, itemData);
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/projects/:projectId/bom/import', authenticateToken, requirePurchasingOrAdmin, (req, res) => {
  try {
    if (!Array.isArray(req.body.items)) {
      return res.status(400).json({ error: 'Invalid payload: items must be an array.' });
    }
    const imported = db.bulkImportBOM(req.user.orgId, req.params.projectId, req.body.items);
    res.status(201).json(imported);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/bom/:id', authenticateToken, requirePurchasingOrAdmin, (req, res) => {
  try {
    const item = db.updateBOMItem(req.user.orgId, req.params.id, req.body);
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/bom/:id', authenticateToken, requirePurchasingOrAdmin, (req, res) => {
  try {
    db.deleteBOMItem(req.user.orgId, req.params.id);
    res.json({ message: 'BOM Item deleted.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// ==================== PURCHASE REQUISITION (PR) ENDPOINTS ====================

app.get('/api/prs', authenticateToken, requirePRAccess, (req, res) => {
  try {
    const allPRs = db.getPRs(req.user.orgId);
    
    // Filter PRs depending on role:
    // Non-managers / non-approvers can only view the PRs they raised.
    const role = req.user.role;
    const isApprover = role === 'admin' || role === 'owner' || role === 'superadmin' || role === 'operations_head' || role === 'md';
    const isPurchasing = req.user.department === 'Purchasing';
    
    if (isApprover || isPurchasing) {
      return res.json(allPRs);
    } else {
      const filtered = allPRs.filter(pr => pr.raisedById === req.user.id);
      return res.json(filtered);
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/prs', authenticateToken, requirePRAccess, (req, res) => {
  const { projectId, items } = req.body;
  if (!projectId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Project and items list are required.' });
  }

  try {
    const prData = {
      projectId,
      items: items.map(item => ({
        description: item.description || '',
        qty: parseFloat(item.qty) || 1,
        unit: item.unit || 'Nos',
        estimatedPrice: parseFloat(item.estimatedPrice) || 0,
        vendorSuggested: item.vendorSuggested || ''
      })),
      raisedById: req.user.id,
      raisedByName: req.user.name,
      status: 'pending_ops' // default to level 1 pending ops approval
    };

    const newPR = db.createPR(req.user.orgId, prData);
    res.status(201).json(newPR);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/prs/:id/approve', authenticateToken, requirePRAccess, (req, res) => {
  const { remarks } = req.body;
  const role = req.user.role;
  const isAdmin = role === 'admin' || role === 'owner' || role === 'superadmin';

  try {
    const pr = db.getPRById(req.user.orgId, req.params.id);
    if (!pr) return res.status(404).json({ error: 'Purchase Requisition not found.' });

    if (pr.status === 'pending_ops') {
      // Must be operations head or admin
      if (role !== 'operations_head' && !isAdmin) {
        return res.status(403).json({ error: 'Access denied: Only Operations Head can approve Level 1.' });
      }
      
      const updated = db.updatePR(req.user.orgId, req.params.id, {
        status: 'pending_md',
        opsHeadApproval: {
          status: 'approved',
          approvedBy: req.user.name,
          date: new Date().toISOString(),
          remarks: remarks || ''
        }
      });
      return res.json(updated);
    } 
    
    if (pr.status === 'pending_md') {
      // Must be MD or admin
      if (role !== 'md' && !isAdmin) {
        return res.status(403).json({ error: 'Access denied: Only Managing Director can approve Level 2.' });
      }
      
      const updated = db.updatePR(req.user.orgId, req.params.id, {
        status: 'approved',
        mdApproval: {
          status: 'approved',
          approvedBy: req.user.name,
          date: new Date().toISOString(),
          remarks: remarks || ''
        }
      });
      return res.json(updated);
    }

    return res.status(400).json({ error: 'This Purchase Requisition is not pending approval.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/prs/:id/reject', authenticateToken, requirePRAccess, (req, res) => {
  const { remarks } = req.body;
  const role = req.user.role;
  const isAdmin = role === 'admin' || role === 'owner' || role === 'superadmin';

  try {
    const pr = db.getPRById(req.user.orgId, req.params.id);
    if (!pr) return res.status(404).json({ error: 'Purchase Requisition not found.' });

    if (pr.status === 'pending_ops') {
      if (role !== 'operations_head' && !isAdmin) {
        return res.status(403).json({ error: 'Access denied: Only Operations Head can reject Level 1.' });
      }
      const updated = db.updatePR(req.user.orgId, req.params.id, {
        status: 'rejected',
        opsHeadApproval: {
          status: 'rejected',
          approvedBy: req.user.name,
          date: new Date().toISOString(),
          remarks: remarks || ''
        }
      });
      return res.json(updated);
    }

    if (pr.status === 'pending_md') {
      if (role !== 'md' && !isAdmin) {
        return res.status(403).json({ error: 'Access denied: Only Managing Director can reject Level 2.' });
      }
      const updated = db.updatePR(req.user.orgId, req.params.id, {
        status: 'rejected',
        mdApproval: {
          status: 'rejected',
          approvedBy: req.user.name,
          date: new Date().toISOString(),
          remarks: remarks || ''
        }
      });
      return res.json(updated);
    }

    return res.status(400).json({ error: 'This Purchase Requisition is not pending approval.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/prs/:id/po', authenticateToken, requirePurchasingOrAdmin, (req, res) => {
  const { poNumber } = req.body;
  if (!poNumber) {
    return res.status(400).json({ error: 'Purchase Order (PO) number is required.' });
  }

  try {
    const updated = db.updatePR(req.user.orgId, req.params.id, {
      status: 'completed',
      poNumber
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  let localIP = 'localhost';
  for (const devName in networkInterfaces) {
    const iface = networkInterfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        localIP = alias.address;
        break;
      }
    }
  }

  console.log(`=======================================================`);
  console.log(`Project Management Server running on port ${PORT}`);
  console.log(`Local Access: http://localhost:${PORT}`);
  console.log(`LAN Network Access: http://${localIP}:${PORT}`);
  console.log(`=======================================================`);
});
