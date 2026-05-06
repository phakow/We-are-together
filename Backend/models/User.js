const { getDb } = require('../database/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

class User {
  static async create(userData) {
    const pool = getDb();
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, password, full_name, role, is_signatory, group_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, full_name, role, is_signatory, group_id`,
      [
        userData.email,
        hashedPassword,
        userData.full_name,
        userData.role || 'member',
        userData.is_signatory || false,
        userData.group_id || null
      ]
    );

    return result.rows[0];
  }

  static async findByEmail(email) {
    const pool = getDb();
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  static async findById(id) {
    const pool = getDb();
    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.is_signatory, u.group_id, u.created_at,
              g.name as group_name
       FROM users u
       LEFT JOIN groups g ON u.group_id = g.id
       WHERE u.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async update(id, updateData) {
    const pool = getDb();
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updateData)) {
      if (key === 'password') {
        const hashedPassword = await bcrypt.hash(value, 10);
        fields.push(`password = $${paramIndex}`);
        values.push(hashedPassword);
        paramIndex++;
      } else if (key !== 'id' && key !== 'email') {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (fields.length === 0) return null;

    values.push(id);
    await pool.query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex}`,
      values
    );

    return await this.findById(id);
  }

  static async validatePassword(user, password) {
    return await bcrypt.compare(password, user.password);
  }

  static generateToken(userId) {
    return jwt.sign(
      { userId },
      process.env.JWT_SECRET || 'development-only-secret',
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
  }
}

module.exports = User;