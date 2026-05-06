const { validationResult } = require('express-validator');
const { getDb } = require('../database/database');

exports.createGroup = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const pool = getDb();
    const { name, registration_number, description, monthly_contribution, interest_rate, target_interest } = req.body;

    const result = await pool.query(
      `INSERT INTO groups (name, registration_number, description, monthly_contribution, interest_rate, target_interest, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [name, registration_number || null, description || null,
       monthly_contribution || 1000, interest_rate || 20, target_interest || 5000, req.user.id]
    );
    const groupId = result.rows[0].id;

    // Auto-add the creator as first member and make them signatory
    const memberNum = `MEM${String(groupId).padStart(3,'0')}001`;
    await pool.query(
      `INSERT INTO group_members (group_id, user_id, member_number, status) VALUES ($1,$2,$3,$4)
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      [groupId, req.user.id, memberNum, 'active']
    );

    await pool.query(
      'UPDATE users SET group_id = $1, is_signatory = true, role = $2 WHERE id = $3',
      [groupId, 'admin', req.user.id]
    );

    const group = await pool.query('SELECT * FROM groups WHERE id = $1', [groupId]);
    res.status(201).json({ message: 'Group created successfully', group: group.rows[0] });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Error creating group' });
  }
};

// Returns all groups (for member enrollment dropdown - any authenticated user can see group list)
exports.getAllGroups = async (req, res) => {
  try {
    const pool = getDb();
    const result = await pool.query(
      `SELECT g.*, COUNT(gm.id) as member_count
       FROM groups g
       LEFT JOIN group_members gm ON g.id = gm.group_id AND gm.status = 'active'
       GROUP BY g.id
       ORDER BY g.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get all groups error:', error);
    res.status(500).json({ error: 'Error fetching groups' });
  }
};

exports.getUserGroups = async (req, res) => {
  try {
    const pool = getDb();
    let result;

    if (req.user.role === 'admin') {
      result = await pool.query(
        `SELECT g.*, COUNT(gm.id) as member_count
         FROM groups g
         LEFT JOIN group_members gm ON g.id = gm.group_id AND gm.status = 'active'
         GROUP BY g.id
         ORDER BY g.created_at DESC`
      );
    } else {
      result = await pool.query(
        `SELECT g.*, COUNT(gm2.id) as member_count
         FROM groups g
         INNER JOIN group_members gm ON g.id = gm.group_id AND gm.user_id = $1
         LEFT JOIN group_members gm2 ON g.id = gm2.group_id AND gm2.status = 'active'
         GROUP BY g.id
         ORDER BY g.created_at DESC`,
        [req.user.id]
      );
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Error fetching groups' });
  }
};

exports.getGroupById = async (req, res) => {
  try {
    const pool = getDb();
    const result = await pool.query('SELECT * FROM groups WHERE id = $1', [req.params.groupId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Group not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Error fetching group' });
  }
};

exports.updateGroup = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const pool = getDb();
    const { name, description, monthly_contribution, interest_rate, target_interest } = req.body;
    const updates = [];
    const values = [];
    let i = 1;

    if (name)                { updates.push(`name = $${i++}`);                 values.push(name); }
    if (description !== undefined) { updates.push(`description = $${i++}`);   values.push(description); }
    if (monthly_contribution){ updates.push(`monthly_contribution = $${i++}`); values.push(monthly_contribution); }
    if (interest_rate)       { updates.push(`interest_rate = $${i++}`);        values.push(interest_rate); }
    if (target_interest)     { updates.push(`target_interest = $${i++}`);      values.push(target_interest); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.groupId);

    await pool.query(`UPDATE groups SET ${updates.join(', ')} WHERE id = $${i}`, values);
    const updated = await pool.query('SELECT * FROM groups WHERE id = $1', [req.params.groupId]);
    res.json({ message: 'Group updated successfully', group: updated.rows[0] });
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Error updating group' });
  }
};

exports.deleteGroup = async (req, res) => {
  try {
    const pool = getDb();
    const check = await pool.query('SELECT id FROM groups WHERE id = $1', [req.params.groupId]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Group not found' });
    await pool.query('DELETE FROM groups WHERE id = $1', [req.params.groupId]);
    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Error deleting group' });
  }
};

exports.getGroupMembers = async (req, res) => {
  try {
    const pool = getDb();
    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.is_signatory, gm.member_number, gm.join_date, gm.status,
              gm.total_contributions, gm.total_interest_earned
       FROM users u
       INNER JOIN group_members gm ON u.id = gm.user_id
       WHERE gm.group_id = $1 ORDER BY gm.join_date ASC`,
      [req.params.groupId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Error fetching members' });
  }
};

exports.getGroupSummary = async (req, res) => {
  try {
    const pool = getDb();
    const groupId = req.params.groupId;

    const [memberCount, totalContributions, activeLoans, pendingContributions, pendingLoans, totalInterest] =
      await Promise.all([
        pool.query(`SELECT COUNT(*) as count FROM group_members WHERE group_id = $1 AND status = 'active'`, [groupId]),
        pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM contributions WHERE group_id = $1 AND status = 'approved'`, [groupId]),
        pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(balance),0) as total_balance FROM loans WHERE group_id = $1 AND status = 'active'`, [groupId]),
        pool.query(`SELECT COUNT(*) as count FROM contributions WHERE group_id = $1 AND status = 'pending'`, [groupId]),
        pool.query(`SELECT COUNT(*) as count FROM loans WHERE group_id = $1 AND status = 'pending'`, [groupId]),
        pool.query(`SELECT COALESCE(SUM(interest_paid),0) as total FROM loan_payments WHERE status = 'approved'`)
      ]);

    res.json({
      total_members:       parseInt(memberCount.rows[0].count),
      total_contributions: parseFloat(totalContributions.rows[0].total),
      active_loans:        parseInt(activeLoans.rows[0].count),
      total_loan_balance:  parseFloat(activeLoans.rows[0].total_balance),
      pending_approvals: {
        contributions: parseInt(pendingContributions.rows[0].count),
        loans:         parseInt(pendingLoans.rows[0].count)
      },
      total_interest_earned: parseFloat(totalInterest.rows[0].total)
    });
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({ error: 'Error fetching group summary' });
  }
};
