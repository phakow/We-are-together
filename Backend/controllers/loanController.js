const { validationResult } = require('express-validator');
const { getDb } = require('../database/database');

exports.applyForLoan = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const pool = getDb();
    const { principal_amount, notes } = req.body;
    const groupId = req.params.groupId;
    const memberId = req.user.id;

    const contrib = await pool.query(
      `SELECT COALESCE(SUM(amount),0) as total FROM contributions WHERE member_id = $1 AND group_id = $2 AND status = 'approved'`,
      [memberId, groupId]
    );

    if (parseFloat(contrib.rows[0].total) < principal_amount * 0.5) {
      return res.status(400).json({ error: 'Loan amount too high relative to contributions' });
    }

    const result = await pool.query(
      `INSERT INTO loans (group_id, member_id, principal_amount, balance, interest_rate, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [groupId, memberId, principal_amount, principal_amount, 20, notes || null, 'pending']
    );

    res.status(201).json({
      message: 'Loan application submitted, pending approval',
      loan_id: result.rows[0].id
    });
  } catch (error) {
    console.error('Apply for loan error:', error);
    res.status(500).json({ error: 'Error applying for loan' });
  }
};

exports.getGroupLoans = async (req, res) => {
  try {
    const pool = getDb();
    const groupId = req.params.groupId;
    const { status } = req.query;

    let query = `
      SELECT l.*, u.full_name as member_name, gm.member_number,
             s1.full_name as signatory1_name, s2.full_name as signatory2_name
      FROM loans l
      JOIN users u ON l.member_id = u.id
      JOIN group_members gm ON u.id = gm.user_id
      LEFT JOIN users s1 ON l.approved_by_signatory1 = s1.id
      LEFT JOIN users s2 ON l.approved_by_signatory2 = s2.id
      WHERE l.group_id = $1
    `;
    const params = [groupId];
    if (status) { query += ` AND l.status = $2`; params.push(status); }
    query += ` ORDER BY l.application_date DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get loans error:', error);
    res.status(500).json({ error: 'Error fetching loans' });
  }
};

exports.getPendingLoans = async (req, res) => {
  try {
    const pool = getDb();
    const result = await pool.query(
      `SELECT l.*, u.full_name as member_name, gm.member_number
       FROM loans l
       JOIN users u ON l.member_id = u.id
       JOIN group_members gm ON u.id = gm.user_id
       WHERE l.group_id = $1 AND l.status = 'pending'
       ORDER BY l.application_date ASC`,
      [req.params.groupId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get pending loans error:', error);
    res.status(500).json({ error: 'Error fetching pending loans' });
  }
};

exports.approveLoan = async (req, res) => {
  try {
    const pool = getDb();
    const { loanId, groupId } = req.params;

    const check = await pool.query('SELECT * FROM loans WHERE id = $1 AND group_id = $2', [loanId, groupId]);
    const loan = check.rows[0];
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    if (loan.status !== 'pending') return res.status(400).json({ error: 'Loan already processed' });

    if (!loan.approved_by_signatory1) {
      await pool.query('UPDATE loans SET approved_by_signatory1 = $1 WHERE id = $2', [req.user.id, loanId]);
      res.json({ message: 'First approval completed. Waiting for second signatory.' });
    } else {
      await pool.query(
        `UPDATE loans SET approved_by_signatory2 = $1, approval_date = CURRENT_DATE, status = 'approved' WHERE id = $2`,
        [req.user.id, loanId]
      );
      res.json({ message: 'Loan fully approved and ready for disbursement' });
    }
  } catch (error) {
    console.error('Approve loan error:', error);
    res.status(500).json({ error: 'Error approving loan' });
  }
};

exports.disburseLoan = async (req, res) => {
  try {
    const pool = getDb();
    const { loanId, groupId } = req.params;

    const check = await pool.query(
      `SELECT * FROM loans WHERE id = $1 AND group_id = $2 AND status = 'approved'`,
      [loanId, groupId]
    );
    if (!check.rows[0]) return res.status(404).json({ error: 'Loan not found or not approved' });

    await pool.query(
      `UPDATE loans SET status = 'active', disbursement_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [loanId]
    );
    res.json({ message: 'Loan disbursed successfully' });
  } catch (error) {
    console.error('Disburse loan error:', error);
    res.status(500).json({ error: 'Error disbursing loan' });
  }
};

exports.makeLoanPayment = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const pool = getDb();
    const { amount, notes } = req.body;
    const { loanId, groupId } = req.params;
    const memberId = req.user.id;

    const check = await pool.query(
      `SELECT * FROM loans WHERE id = $1 AND member_id = $2 AND status = 'active'`,
      [loanId, memberId]
    );
    const loan = check.rows[0];
    if (!loan) return res.status(404).json({ error: 'Active loan not found' });

    const monthlyInterest = (parseFloat(loan.balance) * parseFloat(loan.interest_rate)) / 100;
    let interestPaid = Math.min(amount, monthlyInterest);
    let principalPaid = amount - interestPaid;
    if (principalPaid > parseFloat(loan.balance)) {
      principalPaid = parseFloat(loan.balance);
      interestPaid = amount - principalPaid;
    }

    const proofPath = req.file ? `/uploads/${req.file.filename}` : null;

    const result = await pool.query(
      `INSERT INTO loan_payments (loan_id, member_id, amount, interest_paid, principal_paid, payment_date, proof_of_payment, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [loanId, memberId, amount, interestPaid, principalPaid,
       new Date().toISOString().split('T')[0], proofPath, notes || null, 'pending']
    );

    res.status(201).json({
      message: 'Payment recorded, pending approval',
      payment_id: result.rows[0].id,
      breakdown: { total: amount, interest: interestPaid, principal: principalPaid }
    });
  } catch (error) {
    console.error('Make payment error:', error);
    res.status(500).json({ error: 'Error recording payment' });
  }
};

exports.getLoanPayments = async (req, res) => {
  try {
    const pool = getDb();
    const { loanId } = req.params;

    const payments = await pool.query(
      `SELECT lp.*, u.full_name as approved_by_name
       FROM loan_payments lp
       LEFT JOIN users u ON lp.approved_by = u.id
       WHERE lp.loan_id = $1 ORDER BY lp.payment_date DESC`,
      [loanId]
    );

    const summary = await pool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN status='approved' THEN amount       ELSE 0 END),0) as total_paid,
         COALESCE(SUM(CASE WHEN status='approved' THEN interest_paid ELSE 0 END),0) as total_interest_paid,
         COALESCE(SUM(CASE WHEN status='approved' THEN principal_paid ELSE 0 END),0) as total_principal_paid,
         COUNT(CASE WHEN status='pending' THEN 1 END) as pending_payments
       FROM loan_payments WHERE loan_id = $1`,
      [loanId]
    );

    res.json({ payments: payments.rows, summary: summary.rows[0] });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: 'Error fetching payments' });
  }
};

exports.approveLoanPayment = async (req, res) => {
  try {
    const pool = getDb();
    const { paymentId, groupId } = req.params;

    const check = await pool.query(
      `SELECT lp.*, l.member_id, l.balance as loan_balance, l.id as loan_id
       FROM loan_payments lp
       JOIN loans l ON lp.loan_id = l.id
       WHERE lp.id = $1 AND lp.status = 'pending'`,
      [paymentId]
    );
    const payment = check.rows[0];
    if (!payment) return res.status(404).json({ error: 'Payment not found or already processed' });

    await pool.query(
      `UPDATE loan_payments SET status = 'approved', approved_by = $1, approved_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [req.user.id, paymentId]
    );

    const newBalance = parseFloat(payment.loan_balance) - parseFloat(payment.principal_paid);
    await pool.query(
      `UPDATE loans SET balance = $1, total_paid = total_paid + $2,
         status = CASE WHEN $3 <= 0 THEN 'completed' ELSE status END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [newBalance, payment.amount, newBalance, payment.loan_id]
    );

    if (parseFloat(payment.interest_paid) > 0) {
      await pool.query(
        `UPDATE group_members SET total_interest_earned = total_interest_earned + $1
         WHERE user_id = $2 AND group_id = $3`,
        [payment.interest_paid, payment.member_id, groupId]
      );
    }

    res.json({ message: 'Payment approved successfully' });
  } catch (error) {
    console.error('Approve payment error:', error);
    res.status(500).json({ error: 'Error approving payment' });
  }
};

exports.getAllLoans = async (req, res) => {
  try {
    const pool = getDb();
    let result;

    if (req.user.role === 'admin') {
      result = await pool.query(
        `SELECT l.*, u.full_name, u.email, g.name as group_name
         FROM loans l JOIN users u ON l.member_id = u.id JOIN groups g ON l.group_id = g.id
         ORDER BY l.application_date DESC`
      );
    } else {
      result = await pool.query(
        `SELECT l.*, u.full_name, u.email, g.name as group_name
         FROM loans l JOIN users u ON l.member_id = u.id JOIN groups g ON l.group_id = g.id
         WHERE l.group_id = $1 ORDER BY l.application_date DESC`,
        [req.user.group_id]
      );
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Get all loans error:', error);
    res.status(500).json({ error: 'Error fetching loans' });
  }
};