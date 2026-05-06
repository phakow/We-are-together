const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pool;

const initializeDatabase = async () => {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  console.log('Connected to PostgreSQL database');
  client.release();

  await createTables();
  await seedDefaultData();

  return pool;
};

const createTables = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'member',
        is_signatory BOOLEAN DEFAULT FALSE,
        group_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        registration_number VARCHAR(100) UNIQUE,
        description TEXT,
        monthly_contribution DECIMAL(10,2) DEFAULT 1000.00,
        interest_rate DECIMAL(5,2) DEFAULT 20.00,
        target_interest DECIMAL(10,2) DEFAULT 5000.00,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        group_id INTEGER NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone_number VARCHAR(20),
        member_number VARCHAR(50) UNIQUE,
        join_date DATE DEFAULT CURRENT_DATE,
        status VARCHAR(50) DEFAULT 'active',
        total_contributions DECIMAL(10,2) DEFAULT 0,
        total_interest_earned DECIMAL(10,2) DEFAULT 0,
        address TEXT,
        occupation VARCHAR(100),
        id_number VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        UNIQUE(email, group_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS group_members (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        member_number VARCHAR(50) UNIQUE,
        join_date DATE DEFAULT CURRENT_DATE,
        status VARCHAR(50) DEFAULT 'active',
        total_contributions DECIMAL(10,2) DEFAULT 0,
        total_interest_earned DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(group_id, user_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS contributions (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL,
        member_id INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        month INTEGER,
        year INTEGER,
        payment_date DATE,
        proof_of_payment VARCHAR(500),
        status VARCHAR(50) DEFAULT 'pending',
        approved_by INTEGER,
        approved_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        FOREIGN KEY (member_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (approved_by) REFERENCES users(id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS loans (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL,
        member_id INTEGER NOT NULL,
        principal_amount DECIMAL(10,2) NOT NULL,
        balance DECIMAL(10,2) NOT NULL,
        interest_rate DECIMAL(5,2) DEFAULT 20.00,
        monthly_interest DECIMAL(10,2),
        status VARCHAR(50) DEFAULT 'pending',
        application_date DATE DEFAULT CURRENT_DATE,
        approval_date DATE,
        approved_by_signatory1 INTEGER,
        approved_by_signatory2 INTEGER,
        disbursement_date DATE,
        total_paid DECIMAL(10,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        FOREIGN KEY (member_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (approved_by_signatory1) REFERENCES users(id),
        FOREIGN KEY (approved_by_signatory2) REFERENCES users(id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS loan_payments (
        id SERIAL PRIMARY KEY,
        loan_id INTEGER NOT NULL,
        member_id INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        interest_paid DECIMAL(10,2),
        principal_paid DECIMAL(10,2),
        payment_date DATE,
        proof_of_payment VARCHAR(500),
        status VARCHAR(50) DEFAULT 'pending',
        approved_by INTEGER,
        approved_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
        FOREIGN KEY (member_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (approved_by) REFERENCES users(id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        action VARCHAR(255),
        entity_type VARCHAR(100),
        entity_id INTEGER,
        details TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    await client.query('COMMIT');
    console.log('All tables created successfully');

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const seedDefaultData = async () => {
  const client = await pool.connect();
  try {
    const adminCheck = await client.query(
      'SELECT id FROM users WHERE email = $1',
      ['admin@remmogo.com']
    );

    if (adminCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('Admin@123', 10);
      await client.query(
        'INSERT INTO users (email, password, full_name, role, is_signatory) VALUES ($1, $2, $3, $4, $5)',
        ['admin@remmogo.com', hashedPassword, 'System Administrator', 'admin', true]
      );
      console.log('Default admin user created');
    }

    const groupCheck = await client.query('SELECT id FROM groups LIMIT 1');
    if (groupCheck.rows.length === 0) {
      const adminUser = await client.query(
        'SELECT id FROM users WHERE email = $1',
        ['admin@remmogo.com']
      );
      const adminId = adminUser.rows[0].id;

      const groupResult = await client.query(
        'INSERT INTO groups (name, registration_number, description, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
        ['Demo Motshelo Group', 'REG001', 'Demo group for testing purposes', adminId]
      );
      const groupId = groupResult.rows[0].id;

      await client.query(
        'INSERT INTO group_members (group_id, user_id, member_number, status) VALUES ($1, $2, $3, $4)',
        [groupId, adminId, 'MEM001', 'active']
      );

      await client.query(
        'UPDATE users SET group_id = $1 WHERE id = $2',
        [groupId, adminId]
      );
      console.log('Demo group created');
    }
  } finally {
    client.release();
  }
};

const getDb = () => {
  if (!pool) throw new Error('Database not initialized.');
  return pool;
};

module.exports = { initializeDatabase, getDb };