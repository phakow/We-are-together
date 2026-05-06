const { getDb } = require('../database/database');

exports.getYearEndReport = async (req, res) => {
  try {
    const pool = getDb();
    const groupId = req.params.groupId;
    const reportYear = req.query.year || new Date().getFullYear();

    const result = await pool.query(
      `SELECT u.id, u.full_name, gm.member_number,
         COALESCE(gm.total_contributions,0) as total_contributions,
         COALESCE(gm.total_interest_earned,0) as total_interest_earned,
         (SELECT COUNT(*) FROM loans l WHERE l.member_id = u.id AND l.status = 'completed') as loans_completed,
         (SELECT COALESCE(SUM(l.principal_amount),0) FROM loans l WHERE l.member_id = u.id AND l.status = 'completed') as total_loans_taken
       FROM users u
       JOIN group_members gm ON u.id = gm.user_id
       WHERE gm.group_id = $1 AND gm.status = 'active'
       ORDER BY gm.total_interest_earned DESC`,
      [groupId]
    );
    const members = result.rows;

    const totalContributions = members.reduce((s, m) => s + parseFloat(m.total_contributions || 0), 0);
    const totalInterest = members.reduce((s, m) => s + parseFloat(m.total_interest_earned || 0), 0);

    const membersWithPayout = members.map(member => {
      const interestShare = totalInterest > 0
        ? (parseFloat(member.total_interest_earned) / totalInterest) * totalInterest : 0;
      return {
        ...member,
        yearly_payout: parseFloat(member.total_contributions) + interestShare,
        interest_share: interestShare,
        meets_target: parseFloat(member.total_interest_earned || 0) >= 5000
      };
    });

    res.json({
      year: reportYear, group_id: groupId,
      total_members: members.length,
      total_contributions: totalContributions,
      total_interest_earned: totalInterest,
      members: membersWithPayout,
      members_meeting_target: membersWithPayout.filter(m => m.meets_target).length,
      generated_at: new Date()
    });
  } catch (error) {
    console.error('Year end report error:', error);
    res.status(500).json({ error: 'Error generating year-end report' });
  }
};

exports.getMemberRanking = async (req, res) => {
  try {
    const pool = getDb();
    const groupId = req.params.groupId;

    const [interestRanking, contributionRanking] = await Promise.all([
      pool.query(
        `SELECT u.id, u.full_name, gm.member_number, gm.total_interest_earned, gm.total_contributions
         FROM users u JOIN group_members gm ON u.id = gm.user_id
         WHERE gm.group_id = $1 AND gm.status = 'active' ORDER BY gm.total_interest_earned DESC`,
        [groupId]
      ),
      pool.query(
        `SELECT u.id, u.full_name, gm.member_number, gm.total_contributions, gm.total_interest_earned
         FROM users u JOIN group_members gm ON u.id = gm.user_id
         WHERE gm.group_id = $1 AND gm.status = 'active' ORDER BY gm.total_contributions DESC`,
        [groupId]
      )
    ]);

    const ir = interestRanking.rows;
    const cr = contributionRanking.rows;

    res.json({
      most_interest: ir[0] || null,
      least_interest: ir[ir.length - 1] || null,
      highest_contributor: cr[0] || null,
      full_rankings: { by_interest: ir, by_contributions: cr }
    });
  } catch (error) {
    console.error('Member ranking error:', error);
    res.status(500).json({ error: 'Error generating member ranking' });
  }
};

exports.getInterestReport = async (req, res) => {
  try {
    const pool = getDb();
    const groupId = req.params.groupId;
    const { year } = req.query;

    let yearCondition = '';
    const params = [groupId];
    let i = 2;

    // PostgreSQL date filter instead of SQLite strftime
    if (year) {
      yearCondition = `AND EXTRACT(YEAR FROM lp.approved_at) = $${i++}`;
      params.push(year);
    }
    params.push(groupId);

    const result = await pool.query(
      `SELECT u.id, u.full_name, gm.member_number,
         COALESCE(SUM(lp.interest_paid),0) as total_interest,
         COUNT(DISTINCT lp.loan_id) as number_of_loans
       FROM users u
       JOIN group_members gm ON u.id = gm.user_id
       LEFT JOIN loan_payments lp ON u.id = lp.member_id AND lp.status = 'approved' ${yearCondition}
       WHERE gm.group_id = $${i} AND gm.status = 'active'
       GROUP BY u.id, u.full_name, gm.member_number
       ORDER BY total_interest DESC`,
      params
    );

    const members = result.rows;
    const totalInterest = members.reduce((s, m) => s + parseFloat(m.total_interest), 0);

    res.json({
      members,
      summary: {
        total_interest: totalInterest,
        average_interest_per_member: members.length ? totalInterest / members.length : 0,
        members_above_target: members.filter(m => parseFloat(m.total_interest) >= 5000).length
      }
    });
  } catch (error) {
    console.error('Interest report error:', error);
    res.status(500).json({ error: 'Error generating interest report' });
  }
};

exports.getContributionReport = async (req, res) => {
  try {
    const pool = getDb();
    const groupId = req.params.groupId;
    const reportYear = req.query.year || new Date().getFullYear();

    const [monthlySummary, memberSummary] = await Promise.all([
      pool.query(
        `SELECT month, COUNT(*) as number_of_contributions,
           SUM(amount) as total_amount,
           SUM(CASE WHEN status='approved' THEN amount ELSE 0 END) as approved_amount,
           SUM(CASE WHEN status='pending'  THEN amount ELSE 0 END) as pending_amount
         FROM contributions WHERE group_id = $1 AND year = $2
         GROUP BY month ORDER BY month`,
        [groupId, reportYear]
      ),
      pool.query(
        `SELECT u.full_name, gm.member_number,
           COUNT(c.id) as contribution_count,
           COALESCE(SUM(c.amount),0) as total_contributed,
           CASE WHEN COALESCE(SUM(c.amount),0) >= 12000 THEN 'Full' ELSE 'Partial' END as status
         FROM users u
         JOIN group_members gm ON u.id = gm.user_id
         LEFT JOIN contributions c ON u.id = c.member_id AND c.year = $1 AND c.status = 'approved'
         WHERE gm.group_id = $2 AND gm.status = 'active'
         GROUP BY u.id, u.full_name, gm.member_number
         ORDER BY total_contributed DESC`,
        [reportYear, groupId]
      )
    ]);

    res.json({
      year: reportYear,
      monthly_breakdown: monthlySummary.rows,
      member_breakdown: memberSummary.rows,
      total_contributions: memberSummary.rows.reduce((s, m) => s + parseFloat(m.total_contributed || 0), 0)
    });
  } catch (error) {
    console.error('Contribution report error:', error);
    res.status(500).json({ error: 'Error generating contribution report' });
  }
};

exports.getLoanReport = async (req, res) => {
  try {
    const pool = getDb();
    const groupId = req.params.groupId;

    const [activeLoans, performance] = await Promise.all([
      pool.query(
        `SELECT u.full_name, gm.member_number, l.principal_amount, l.balance,
           l.interest_rate, l.application_date, l.disbursement_date,
           (l.principal_amount - l.balance) as amount_paid
         FROM loans l
         JOIN users u ON l.member_id = u.id
         JOIN group_members gm ON u.id = gm.user_id
         WHERE l.group_id = $1 AND l.status = 'active'
         ORDER BY l.application_date DESC`,
        [groupId]
      ),
      pool.query(
        `SELECT COUNT(*) as total_loans,
           COALESCE(SUM(principal_amount),0) as total_principal,
           COALESCE(SUM(balance),0) as outstanding_balance,
           COALESCE(AVG(principal_amount),0) as average_loan_size,
           COUNT(CASE WHEN status='completed' THEN 1 END) as completed_loans,
           COUNT(CASE WHEN status='active'    THEN 1 END) as active_loans_count
         FROM loans WHERE group_id = $1`,
        [groupId]
      )
    ]);

    const p = performance.rows[0];
    res.json({
      active_loans: activeLoans.rows,
      performance: {
        ...p,
        repayment_rate: parseFloat(p.total_principal) > 0
          ? ((parseFloat(p.total_principal) - parseFloat(p.outstanding_balance)) / parseFloat(p.total_principal)) * 100
          : 0
      }
    });
  } catch (error) {
    console.error('Loan report error:', error);
    res.status(500).json({ error: 'Error generating loan report' });
  }
};