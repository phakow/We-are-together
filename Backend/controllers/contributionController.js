const { validationResult } = require('express-validator');
const { getDb } = require('../database/database');

exports.createContribution = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const pool = getDb();
    const { amount, month, year, payment_date, notes } = req.body;
    const groupId = req.params.groupId;
    const memberId = req.user.id;
    const currentDate = new Date();
    const contributionMonth = month || currentDate.getMonth() + 1;
    const contributionYear = year || currentDate.getFullYear();
    const paymentDate = payment_date || currentDate.toISOString().split('T')[0];
    const proofPath = req.file ? `/uploads/${req.file.filename}` : null;

    const result = await pool.query(
      `INSERT INTO contributions (group_id, member_id, amount, month, year, payment_date, proof_of_payment, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [groupId, memberId, amount, contributionMonth, contributionYear, paymentDate, proofPath, notes || null, 'pending']
    );

    res.status(201).json({
      message: 'Contribution recorded successfully, pending approval',
      contribution_id: result.rows[0].id
    });
  } catch (error) {
    console.error('Create contribution error:', error);
    res.status(500).json({ error: 'Error recording contribution' });
  }
};

exports.getGroupContributions = async (req, res) => {
  try {
    const pool = getDb();
    const groupId = req.params.groupId;
    const { month, year, status } = req.query;

    let query = `
      SELECT c.*, u.full_name as member_name, gm.member_number,
             a.full_name as approved_by_name
      FROM contributions c
      JOIN users u ON c.member_id = u.id
      JOIN group_members gm ON u.id = gm.user_id
      LEFT JOIN users a ON c.approved_by = a.id
      WHERE c.group_id = $1
    `;
    const params = [groupId];
    let i = 2;

    if (month) { query += ` AND c.month = $${i++}`; params.push(month); }
    if (year)  { query += ` AND c.year = $${i++}`;  params.push(year); }
    if (status){ query += ` AND c.status = $${i++}`;params.push(status); }
    query += ` ORDER BY c.created_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get contributions error:', error);
    res.status(500).json({ error: 'Error fetching contributions' });
  }
};

exports.getPendingContributions = async (req, res) => {
  try {
    const pool = getDb();
    const result = await pool.query(
      `SELECT c.*, u.full_name as member_name, gm.member_number
       FROM contributions c
       JOIN users u ON c.member_id = u.id
       JOIN group_members gm ON u.id = gm.user_id
       WHERE c.group_id = $1 AND c.status = 'pending'
       ORDER BY c.created_at ASC`,
      [req.params.groupId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get pending contributions error:', error);
    res.status(500).json({ error: 'Error fetching pending contributions' });
  }
};

exports.approveContribution = async (req, res) => {
  try {
    const pool = getDb();
    const { contributionId, groupId } = req.params;

    const check = await pool.query(
      'SELECT * FROM contributions WHERE id = $1 AND group_id = $2',
      [contributionId, groupId]
    );
    const contribution = check.rows[0];
    if (!contribution) return res.status(404).json({ error: 'Contribution not found' });
    if (contribution.status !== 'pending') return res.status(400).json({ error: 'Contribution already processed' });

    await pool.query(
      `UPDATE contributions SET status = 'approved', approved_by = $1, approved_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [req.user.id, contributionId]
    );

    await pool.query(
      `UPDATE group_members SET total_contributions = total_contributions + $1
       WHERE group_id = $2 AND user_id = $3`,
      [contribution.amount, groupId, contribution.member_id]
    );

    res.json({ message: 'Contribution approved successfully' });
  } catch (error) {
    console.error('Approve contribution error:', error);
    res.status(500).json({ error: 'Error approving contribution' });
  }
};

exports.rejectContribution = async (req, res) => {
  try {
    const pool = getDb();
    const { contributionId, groupId } = req.params;
    const { reason } = req.body;

    const check = await pool.query(
      'SELECT * FROM contributions WHERE id = $1 AND group_id = $2',
      [contributionId, groupId]
    );
    const contribution = check.rows[0];
    if (!contribution) return res.status(404).json({ error: 'Contribution not found' });
    if (contribution.status !== 'pending') return res.status(400).json({ error: 'Contribution already processed' });

    await pool.query(
      `UPDATE contributions SET status = 'rejected', notes = $1 WHERE id = $2`,
      [reason || 'Rejected by signatory', contributionId]
    );

    res.json({ message: 'Contribution rejected' });
  } catch (error) {
    console.error('Reject contribution error:', error);
    res.status(500).json({ error: 'Error rejecting contribution' });
  }
};

exports.getContributionSummary = async (req, res) => {
  try {
    const pool = getDb();
    const groupId = req.params.groupId;
    const { year } = req.query;

    let yearCondition = '';
    const params = [groupId];
    let i = 2;

    if (year) { yearCondition = `AND c.year = $${i++}`; params.push(year); }
    params.push(groupId);

    const result = await pool.query(
      `SELECT 
         u.id as member_id, u.full_name, gm.member_number,
         COUNT(c.id) as total_contributions,
         SUM(CASE WHEN c.status = 'approved' THEN c.amount ELSE 0 END) as total_approved,
         SUM(CASE WHEN c.status = 'pending'  THEN c.amount ELSE 0 END) as total_pending,
         SUM(CASE WHEN c.status = 'rejected' THEN c.amount ELSE 0 END) as total_rejected
       FROM users u
       JOIN group_members gm ON u.id = gm.user_id
       LEFT JOIN contributions c ON u.id = c.member_id AND c.group_id = $1 ${yearCondition}
       WHERE gm.group_id = $${i} AND gm.status = 'active'
       GROUP BY u.id, u.full_name, gm.member_number
       ORDER BY total_approved DESC`,
      params
    );

    const summary = result.rows;
    const totals = {
      total_approved: summary.reduce((s, m) => s + parseFloat(m.total_approved || 0), 0),
      total_pending:  summary.reduce((s, m) => s + parseFloat(m.total_pending  || 0), 0),
      total_members:  summary.length
    };

    res.json({ members: summary, totals });
  } catch (error) {
    console.error('Get contribution summary error:', error);
    res.status(500).json({ error: 'Error fetching contribution summary' });
  }
};

exports.getAllContributions = async (req, res) => {
  try {
    const pool = getDb();
    let result;

    if (req.user.role === 'admin') {
      result = await pool.query(
        `SELECT c.*, u.full_name, u.email, g.name as group_name
         FROM contributions c
         JOIN users u ON c.member_id = u.id
         JOIN groups g ON c.group_id = g.id
         ORDER BY c.payment_date DESC`
      );
    } else {
      result = await pool.query(
        `SELECT c.*, u.full_name, u.email, g.name as group_name
         FROM contributions c
         JOIN users u ON c.member_id = u.id
         JOIN groups g ON c.group_id = g.id
         WHERE c.group_id = $1
         ORDER BY c.payment_date DESC`,
        [req.user.group_id]
      );
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Get all contributions error:', error);
    res.status(500).json({ error: 'Error fetching contributions' });
  }
};