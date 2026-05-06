const { getDb } = require('../database/database');

class Member {
  static async addToGroup(groupId, userId, memberNumber = null) {
    const pool = getDb();

    const existing = await pool.query(
      'SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );
    if (existing.rows.length > 0) {
      throw new Error('User is already a member of this group');
    }

    if (!memberNumber) {
      const count = await pool.query(
        'SELECT COUNT(*) as count FROM group_members WHERE group_id = $1',
        [groupId]
      );
      memberNumber = `MEM${groupId}${(parseInt(count.rows[0].count) + 1).toString().padStart(3, '0')}`;
    }

    const result = await pool.query(
      `INSERT INTO group_members (group_id, user_id, member_number, status)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [groupId, userId, memberNumber, 'active']
    );

    await pool.query('UPDATE users SET group_id = $1 WHERE id = $2', [groupId, userId]);

    return { id: result.rows[0].id, group_id: groupId, user_id: userId, member_number: memberNumber };
  }

  static async removeFromGroup(groupId, userId) {
    const pool = getDb();

    const outstandingLoans = await pool.query(
      `SELECT COUNT(*) as count FROM loans
       WHERE group_id = $1 AND member_id = $2 AND status IN ('active', 'pending')`,
      [groupId, userId]
    );
    if (parseInt(outstandingLoans.rows[0].count) > 0) {
      throw new Error('Cannot remove member with outstanding loans');
    }

    await pool.query(
      `UPDATE group_members SET status = 'inactive' WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );

    await pool.query('UPDATE users SET group_id = NULL WHERE id = $1', [userId]);

    return true;
  }

  static async getGroupMembers(groupId) {
    const pool = getDb();

    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.is_signatory, u.role,
              gm.member_number, gm.join_date, gm.status,
              gm.total_contributions, gm.total_interest_earned
       FROM users u
       INNER JOIN group_members gm ON u.id = gm.user_id
       WHERE gm.group_id = $1 AND gm.status = 'active'
       ORDER BY gm.join_date DESC`,
      [groupId]
    );
    return result.rows;
  }

  static async getMemberById(groupId, userId) {
    const pool = getDb();

    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.is_signatory, u.role,
              gm.member_number, gm.join_date, gm.status,
              gm.total_contributions, gm.total_interest_earned
       FROM users u
       INNER JOIN group_members gm ON u.id = gm.user_id
       WHERE gm.group_id = $1 AND u.id = $2`,
      [groupId, userId]
    );
    return result.rows[0] || null;
  }

  static async updateMember(groupId, userId, updateData) {
    const pool = getDb();
    const { is_signatory, status } = updateData;

    if (is_signatory !== undefined) {
      await pool.query(
        'UPDATE users SET is_signatory = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [is_signatory, userId]
      );
    }

    if (status !== undefined) {
      await pool.query(
        'UPDATE group_members SET status = $1 WHERE group_id = $2 AND user_id = $3',
        [status, groupId, userId]
      );
    }

    return await this.getMemberById(groupId, userId);
  }

  static async updateContributions(userId, amount) {
    const pool = getDb();
    await pool.query(
      `UPDATE group_members SET total_contributions = total_contributions + $1 WHERE user_id = $2`,
      [amount, userId]
    );
  }

  static async updateInterestEarned(userId, interest) {
    const pool = getDb();
    await pool.query(
      `UPDATE group_members SET total_interest_earned = total_interest_earned + $1 WHERE user_id = $2`,
      [interest, userId]
    );
  }

  static async isMember(groupId, userId) {
    const pool = getDb();
    const result = await pool.query(
      `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
      [groupId, userId]
    );
    return result.rows.length > 0;
  }

  static async getMemberStats(groupId, userId) {
    const pool = getDb();
    const result = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM contributions WHERE group_id = $1 AND member_id = $2 AND status = 'approved') as contribution_count,
         (SELECT COALESCE(SUM(amount), 0) FROM contributions WHERE group_id = $1 AND member_id = $2 AND status = 'approved') as total_contributed,
         (SELECT COUNT(*) FROM loans WHERE group_id = $1 AND member_id = $2 AND status = 'active') as active_loans,
         (SELECT COALESCE(SUM(balance), 0) FROM loans WHERE group_id = $1 AND member_id = $2 AND status = 'active') as loan_balance`,
      [groupId, userId]
    );
    return result.rows[0];
  }
}

module.exports = Member;
