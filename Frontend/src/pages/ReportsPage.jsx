import React, { Component } from "react";
import FormMessage from "../components/common/FormMessage";
import { AuthContext } from "../context/AuthContext";
import reportService from "../services/reportService";

class ReportsPage extends Component {
  static contextType = AuthContext;

  state = {
    report: null,
    ranking: null,
    loading: false,
    error: ""
  };

  getGroupId() {
    return this.context.user?.group_id;
  }

  handleGenerateReport = async (event) => {
    event.preventDefault();
    const groupId = this.getGroupId();
    if (!groupId) {
      this.setState({ error: "No group found. Please ensure you are assigned to a group." });
      return;
    }
    this.setState({ loading: true, error: "", report: null, ranking: null });
    try {
      const [report, ranking] = await Promise.all([
        reportService.getYearEndReport(groupId),
        reportService.getMemberRanking(groupId)
      ]);
      this.setState({ report, ranking, loading: false });
    } catch (error) {
      this.setState({
        error: error.message || "Unable to generate report.",
        loading: false
      });
    }
  };

  renderReport() {
    const { report, ranking } = this.state;
    if (!report) {
      return <p>Click "Generate Report" to see year-end totals, interest summaries, and member performance.</p>;
    }

    return (
      <div className="report-block">
        <h3>Year-End Summary ({report.year})</h3>
        <div className="grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
          <div className="card"><h4>Total Members</h4><p>{report.total_members}</p></div>
          <div className="card"><h4>Total Contributions</h4><p>P{parseFloat(report.total_contributions || 0).toFixed(2)}</p></div>
          <div className="card"><h4>Total Interest Earned</h4><p>P{parseFloat(report.total_interest_earned || 0).toFixed(2)}</p></div>
          <div className="card"><h4>Members Meeting P5000 Target</h4><p>{report.members_meeting_target} / {report.total_members}</p></div>
        </div>

        {ranking && (
          <div style={{ marginBottom: "1.5rem" }}>
            <h4>Top Performer</h4>
            {ranking.most_interest ? (
              <p>{ranking.most_interest.full_name} — P{parseFloat(ranking.most_interest.total_interest_earned || 0).toFixed(2)} interest earned</p>
            ) : <p>No data yet.</p>}
          </div>
        )}

        {report.members && report.members.length > 0 && (
          <>
            <h4>Member Breakdown</h4>
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Contributions (BWP)</th>
                  <th>Interest Earned (BWP)</th>
                  <th>Estimated Payout (BWP)</th>
                  <th>Meets Target</th>
                </tr>
              </thead>
              <tbody>
                {report.members.map((m) => (
                  <tr key={m.id}>
                    <td>{m.full_name}</td>
                    <td>P{parseFloat(m.total_contributions || 0).toFixed(2)}</td>
                    <td>P{parseFloat(m.total_interest_earned || 0).toFixed(2)}</td>
                    <td>P{parseFloat(m.yearly_payout || 0).toFixed(2)}</td>
                    <td>{m.meets_target ? "✓ Yes" : "✗ No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    );
  }

  render() {
    const { loading, error } = this.state;

    return (
      <section>
        <h2>Reports</h2>
        <p>Generate year-end views for member returns and interest performance.</p>

        <form onSubmit={this.handleGenerateReport} style={{ marginBottom: "1.5rem" }}>
          <button type="submit" disabled={loading}>
            {loading ? "Generating..." : "Generate Year-End Report"}
          </button>
        </form>

        <FormMessage error={error} />
        {this.renderReport()}
      </section>
    );
  }
}

export default ReportsPage;
