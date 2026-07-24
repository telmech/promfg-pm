-- 1. Organizations Table
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    plan TEXT NOT NULL,
    status TEXT NOT NULL,
    mrr REAL DEFAULT 0.0,
    trial_ends_at TEXT,
    payment_status TEXT DEFAULT 'unpaid',
    created_at TEXT NOT NULL
);

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    department TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL,
    permissions_json TEXT DEFAULT '{}',
    FOREIGN KEY(org_id) REFERENCES organizations(id)
);

-- 3. Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    start_date TEXT,
    end_date TEXT,
    customer_name TEXT,
    customer_logo TEXT,
    created_at TEXT NOT NULL,
    members_json TEXT DEFAULT '[]',
    timeline_json TEXT DEFAULT '[]',
    FOREIGN KEY(org_id) REFERENCES organizations(id)
);

-- 4. Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    assignee_id TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'todo',
    due_date TEXT,
    start_date TEXT,
    allocated_operator TEXT,
    operator_role TEXT,
    mapped_duration REAL,
    created_by TEXT,
    created_at TEXT NOT NULL,
    attachments_json TEXT DEFAULT '[]',
    FOREIGN KEY(org_id) REFERENCES organizations(id),
    FOREIGN KEY(project_id) REFERENCES projects(id)
);

-- 5. RFQs Table
CREATE TABLE IF NOT EXISTS rfqs (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    rfq_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open',
    progress INTEGER DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'Medium',
    customer_name TEXT,
    project_title TEXT,
    received_date TEXT,
    due_date TEXT,
    owner TEXT,
    next_action TEXT,
    remarks TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(org_id) REFERENCES organizations(id)
);

-- 6. BOM Items Table
CREATE TABLE IF NOT EXISTS bom_items (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    item_code TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit TEXT NOT NULL,
    target_date TEXT,
    status TEXT NOT NULL DEFAULT 'Draft',
    supplier_a_name TEXT,
    supplier_a_price REAL DEFAULT 0,
    supplier_a_lead_time TEXT,
    supplier_a_payment TEXT,
    supplier_b_name TEXT,
    supplier_b_price REAL DEFAULT 0,
    supplier_b_lead_time TEXT,
    supplier_b_payment TEXT,
    supplier_c_name TEXT,
    supplier_c_price REAL DEFAULT 0,
    supplier_c_lead_time TEXT,
    supplier_c_payment TEXT,
    winner TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(org_id) REFERENCES organizations(id),
    FOREIGN KEY(project_id) REFERENCES projects(id)
);

-- 7. Purchase Requisitions Table
CREATE TABLE IF NOT EXISTS purchase_requisitions (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    raised_by_id TEXT NOT NULL,
    raised_by_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_ops',
    created_at TEXT NOT NULL,
    po_number TEXT,
    items_json TEXT NOT NULL DEFAULT '[]',
    ops_head_approval_json TEXT,
    md_approval_json TEXT,
    assigned_to_name TEXT,
    FOREIGN KEY(org_id) REFERENCES organizations(id),
    FOREIGN KEY(project_id) REFERENCES projects(id),
    FOREIGN KEY(raised_by_id) REFERENCES users(id)
);

-- 8. Settings Table
CREATE TABLE IF NOT EXISTS settings (
    org_id TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    company_logo TEXT,
    FOREIGN KEY(org_id) REFERENCES organizations(id)
);

-- 9. Departments Table
CREATE TABLE IF NOT EXISTS departments (
    name TEXT NOT NULL,
    org_id TEXT NOT NULL,
    PRIMARY KEY(name, org_id),
    FOREIGN KEY(org_id) REFERENCES organizations(id)
);

-- 10. Comments Table
CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    text TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(org_id) REFERENCES organizations(id),
    FOREIGN KEY(task_id) REFERENCES tasks(id)
);

-- 11. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT,
    message TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY(org_id) REFERENCES organizations(id)
);

-- 12. Pending Signups Table
CREATE TABLE IF NOT EXISTS pending_signups (
    email TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    phone TEXT,
    otp TEXT NOT NULL,
    org_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);
