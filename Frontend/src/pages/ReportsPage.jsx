import React, { Component } from "react";
import FormMessage from "../components/common/FormMessage";
import { AuthContext } from "../context/AuthContext";
import groupService from "../services/groupService";
import reportService from "../services/reportService";

class ReportsPage extends Component {
  static contextType = AuthContext;

  state = {
    groups: [],
    selectedGroupId: "",
    report: null,
    loading: true,
    error: ""
  };

  async componentDidMount() {
    const { user } = this.context;
    try {
      const groups = await groupService.getGroups();
      this.setState({
        groups: groups || [],
        selectedGroupId: user?.group_id || groups?.[0]?.id || "",
        loading: false
      });
    } catch (error) {
      this.setState({ loading: false, error: "Groups could not be loaded for reporting." });
    }
  }

  handleChange = (event) => {
    this.setState({ selectedGroupId: event.target.value });
  };

  handleSubmit = async (event) => {
    event.preventDefault();
    if (!this.state.selectedGroupId) {
      this.setState({ error: "Select a group to generate a report." });
      return;
    }
    try {
      const report = await reportService.getYearEndReport(this.state.selectedGroupId);
      this.setState({ report, error: "" });
    } catch (error) {
      this.setState({
        error: error.message || "Year-end reporting will work once the backend endpoint is ready.",
        report: null
      });
    }
  };

  renderReport() {
    const { report } = this.state;
    if (!report) {
      return <p>Generate a year-end report to see totals, interest summaries, and member performance.</p>;
    }

    return (
      <div className="report-block">
        <p>Total Members: {report.total_members}</p>
        <p>Total Contributions: {report.total_contributions}</p>
        <p>Total Interest Earned: {report.total_interest_earned}</p>
        <p>Members Meeting Target: {report.members_meeting_target}</p>
        {report.members && (
          <table>
            <thead>
              <tr><th>Member</th><th>Contributions</th><th>Interest</th><th>Payout</th></tr>
            </thead>
            <tbody>
              {report.members.map((m) => (
                <tr key={m.member_id}>
                  <td>{m.full_name}</td>
                  <td>{m.total_contributions}</td>
                  <td>{m.total_interest_earned}</td>
                  <td>{m.yearly_payout}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  render() {
    const { groups, selectedGroupId, loading, error } = this.state;

    return (
      <section>
        <h2>Reports</h2>
        <p>Generate year-end views for member returns and interest performance.</p>

        {loading ? (
          <p>Loading report options...</p>
        ) : (
          <form onSubmit={this.handleSubmit}>
            <label htmlFor="selectedGroupId">Group</label>
            <select id="selectedGroupId" value={selectedGroupId} onChange={this.handleChange}>
              <option value="">Select a group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
            <button type="submit">Generate Report</button>
          </form>
        )}

        <FormMessage error={error} />
        {this.renderReport()}
      </section>
    );
  }
}

export default ReportsPage;
