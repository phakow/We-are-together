const { validationResult } = require('express-validator');
const { getDb } = require('../database/database');
const User = require('../models/User');
const Member = require('../models/Member');
const bcrypt = require('bcryptjs');

exports.addMember = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const pool = getDb();
    const { email, full_name, is_signatory } = req.body;
    const groupId = parseInt(req.params.groupId);

    const group = await pool.query('SELECT id FROM groups WHERE id = $1', [groupId]);
    if (!group.rows[0]) return res.status(404).json({ error: 'Group not found' });

    let user = await User.findByEmail(email);

    if (!user) {
      const hashedPassword = await bcrypt.hash('Member@123', 10);
      const result = await pool.query(
        `INSERT INTO users (email, password, full_name, is_signatory, group_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [email, hashedPassword, full_name, is_signatory || false, groupId]
      );
      user = result.rows[0];
    } else {
      await pool.query(
        'UPDATE users SET group_id = $1, is_signatory = $2 WHERE id = $3',
        [groupId, is_signatory || false, user.id]
      );
    }

    const member = await Member.addToGroup(groupId, user.id);
    const memberDetails = await Member.getMemberById(groupId, user.id);

    res.status(201).json({ message: 'Member added successfully', member: memberDetails });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ error: error.message || 'Error adding member' });
  }
};

exports.updateMember = async (req, res) => {
  try {
    const pool = getDb();
    const groupId = parseInt(req.params.groupId);
    const memberId = parseInt(req.params.memberId);
    const { full_name, is_signatory, status } = req.body;

    if (full_name) {
      await pool.query(
        'UPDATE users SET full_name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [full_name, memberId]
      );
    }

    const updatedMember = await Member.updateMember(groupId, memberId, { is_signatory, status });
    res.json({ message: 'Member updated successfully', member: updatedMember });
  } catch (error) {
    console.error('Update member error:', error);
    res.status(500).json({ error: 'Error updating member' });
  }
};

exports.removeMember = async (req, res) => {
  try {
    await Member.removeFromGroup(parseInt(req.params.groupId), parseInt(req.params.memberId));
    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: error.message || 'Error removing member' });
  }
};

exports.updateMemberStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const updatedMember = await Member.updateMember(
      parseInt(req.params.groupId), parseInt(req.params.memberId), { status }
    );
    res.json({ message: `Member status updated to ${status}`, member: updatedMember });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Error updating member status' });
  }
};

exports.getGroupMembers = async (req, res) => {
  try {
    const members = await Member.getGroupMembers(parseInt(req.params.groupId));
    res.json(members);
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Error fetching members' });
  }
};

exports.getMemberById = async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const memberId = parseInt(req.params.memberId);
    const member = await Member.getMemberById(groupId, memberId);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    const stats = await Member.getMemberStats(groupId, memberId);
    res.json({ ...member, stats });
  } catch (error) {
    console.error('Get member error:', error);
    res.status(500).json({ error: 'Error fetching member' });
  }
};

exports.getMemberContributions = async (req, res) => {
  try {
    const pool = getDb();
    const groupId = parseInt(req.params.groupId);
    const memberId = parseInt(req.params.memberId);

    const contributions = await pool.query(
      `SELECT * FROM contributions WHERE member_id = $1 AND group_id = $2 ORDER BY year DESC, month DESC`,
      [memberId, groupId]
    );

    const summary = await pool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN status='approved' THEN amount ELSE 0 END),0) as total_approved,
         COALESCE(SUM(CASE WHEN status='pending'  THEN amount ELSE 0 END),0) as total_pending,
         COUNT(*) as total_contributions
       FROM contributions WHERE member_id = $1 AND group_id = $2`,
      [memberId, groupId]
    );

    res.json({ contributions: contributions.rows, summary: summary.rows[0] });
  } catch (error) {
    console.error('Get contributions error:', error);
    res.status(500).json({ error: 'Error fetching contributions' });
  }
};

exports.getMemberLoans = async (req, res) => {
  try {
    const pool = getDb();
    const groupId = parseInt(req.params.groupId);
    const memberId = parseInt(req.params.memberId);

    const result = await pool.query(
      `SELECT l.*, COUNT(lp.id) as payment_count, COALESCE(SUM(lp.amount),0) as total_paid
       FROM loans l
       LEFT JOIN loan_payments lp ON l.id = lp.loan_id AND lp.status = 'approved'
       WHERE l.member_id = $1 AND l.group_id = $2
       GROUP BY l.id ORDER BY l.application_date DESC`,
      [memberId, groupId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get loans error:', error);
    res.status(500).json({ error: 'Error fetching loans' });
  }
};