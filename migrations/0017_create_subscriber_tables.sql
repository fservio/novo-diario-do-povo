-- Subscribers (Reader Identity)
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  asaas_customer_id TEXT,
  status TEXT DEFAULT 'active', -- 'active', 'blocked'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME
);

-- Subscriber Sessions (Distinct from Admin Sessions)
CREATE TABLE IF NOT EXISTS subscriber_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id INTEGER NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

-- Subscriptions (Plan Management - Mirror Asaas)
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id INTEGER NOT NULL,
  plan_type TEXT NOT NULL, -- 'monthly', 'annual'
  status TEXT NOT NULL, -- 'active', 'past_due', 'canceled', 'pending'
  asaas_subscription_id TEXT UNIQUE,
  current_period_end DATETIME,
  next_due_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

-- Invoices (Payment History - Mirror Asaas)
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id INTEGER NOT NULL,
  asaas_payment_id TEXT UNIQUE,
  status TEXT NOT NULL, -- 'paid', 'pending', 'overdue', 'refunded'
  amount REAL,
  due_date DATETIME,
  payment_url TEXT,
  paid_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

-- Webhook Events (Idempotency)
CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT UNIQUE, -- From Asaas payload
  payload_hash TEXT,
  event_type TEXT,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_asaas_customer_id ON subscribers(asaas_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriber_sessions_token ON subscriber_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_subscriptions_subscriber ON subscriptions(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_asaas_id ON subscriptions(asaas_subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_subscriber ON invoices(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_invoices_asaas_id ON invoices(asaas_payment_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);
