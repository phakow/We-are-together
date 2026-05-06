import React, { Component } from "react";
import FormMessage from "../components/common/FormMessage";
import { AuthContext } from "../context/AuthContext";
import contributionService from "../services/contributionService";
import memberService from "../services/memberService";
import { hasErrors, validateMinNumber, validateRequired } from "../utils/validators";

class ContributionPage extends Component {
  static contextType = AuthContext;

  state = {
    members: [],
    contributions: [],
    form: {
      memberId: "",
      amount: "1000",
      paymentMonth: "",
      paymentDate: ""
    },
    errors: {},
    loading: true,
    formError: "",
    success: ""
  };

  async componentDidMount() {
    await Promise.all([this.loadMembers(), this.loadContributionData()]);
  }

  getGroupId() {
    return this.context.user?.group_id;
  }

  loadMembers = async () => {
    const groupId = this.getGroupId();
    if (!groupId) return;
    try {
      const members = await memberService.getMembers(groupId);
      this.setState((current) => ({
        members: members || [],
        form: {
          ...current.form,
          memberId: current.form.memberId || members?.[0]?.id || ""
        }
      }));
    } catch (error) {
      this.setState({ formError: "Members could not be loaded." });
    }
  };

  loadContributionData = async () => {
    const groupId = this.getGroupId();
    if (!groupId) {
      this.setState({ loading: false });
      return;
    }
    try {
      const contributions = await contributionService.getContributions(groupId);
      this.setState({ contributions: contributions || [], loading: false });
    } catch (error) {
      this.setState({ loading: false, formError: "Contribution data is waiting for backend connection." });
    }
  };

  handleChange = (event) => {
    const { name, value } = event.target;
    this.setState((current) => ({
      form: { ...current.form, [name]: value }
    }));
  };

  handleSubmit = async (event) => {
    event.preventDefault();
    const errors = validateRequired(["memberId", "amount", "paymentMonth", "paymentDate"], this.state.form);
    const amountError = validateMinNumber(this.state.form.amount, 1);
    if (amountError) errors.amount = amountError;

    if (hasErrors(errors)) {
      this.setState({ errors, formError: "", success: "" });
      return;
    }

    const groupId = this.getGroupId();
    try {
      const [year, month] = this.state.form.paymentMonth.split("-");
      await contributionService.createContribution(groupId, {
        amount: parseFloat(this.state.form.amount),
        payment_date: this.state.form.paymentDate,
        month: parseInt(month),
        year: parseInt(year)
      });
      this.setState({
        form: { ...this.state.form, amount: "1000", paymentMonth: "", paymentDate: "" },
        errors: {},
        formError: "",
        success: "Contribution submitted. Awaiting signatory approval."
      });
      this.loadContributionData();
    } catch (error) {
      this.setState({ formError: error.message || "Unable to record contribution.", success: "" });
    }
  };

  handleApprove = async (contributionId) => {
    const groupId = this.getGroupId();
    try {
      const result = await contributionService.approveContribution(groupId, contributionId);
      this.setState({ success: result.message, formError: "" });
      this.loadContributionData();
    } catch (error) {
      this.setState({ formError: error.message || "Failed to approve contribution.", success: "" });
    }
  };

  handleReject = async (contributionId) => {
    const reason = window.prompt("Enter rejection reason (optional):");
    if (reason === null) return;
    const groupId = this.getGroupId();
    try {
      await contributionService.rejectContribution(groupId, contributionId, reason);
      this.setState({ success: "Contribution rejected.", formError: "" });
      this.loadContributionData();
    } catch (error) {
      this.setState({ formError: error.message || "Failed to reject contribution.", success: "" });
    }
  };

  render() {
    const { members, contributions, form, errors, loading, formError, success } = this.state;
    const isSignatory = this.context.user?.is_signatory;

    return (
      <section>
        <h2>Contributions</h2>
        <p>Record monthly contributions (P1000 per member) and track approval status.</p>

        <div className="two-column">
          <div>
            <h3>Record Contribution</h3>
            <form onSubmit={this.handleSubmit} noValidate>
              <label htmlFor="memberId">Member</label>
              <select id="memberId" name="memberId" value={form.memberId} onChange={this.handleChange}>
                <option value="">Select a member</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>{member.full_name}</option>
                ))}
              </select>
              {errors.memberId && <small>{errors.memberId}</small>}

              <label htmlFor="amount">Amount (BWP)</label>
              <input id="amount" name="amount" type="number" min="1" value={form.amount} onChange={this.handleChange} />
              {errors.amount && <small>{errors.amount}</small>}

              <label htmlFor="paymentMonth">Payment Month</label>
              <input id="paymentMonth" name="paymentMonth" type="month" value={form.paymentMonth} onChange={this.handleChange} />
              {errors.paymentMonth && <small>{errors.paymentMonth}</small>}

              <label htmlFor="paymentDate">Payment Date</label>
              <input id="paymentDate" name="paymentDate" type="date" value={form.paymentDate} onChange={this.handleChange} />
              {errors.paymentDate && <small>{errors.paymentDate}</small>}

              <button type="submit">Submit Contribution</button>
            </form>
            <FormMessage error={formError} success={success} />
          </div>

          <div>
            <h3>Recent Contributions</h3>
            {loading ? (
              <p>Loading contributions...</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Amount</th>
                    <th>Month/Year</th>
                    <th>Status</th>
                    <th>Approvals</th>
                    {isSignatory && <th>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {contributions.length === 0 ? (
                    <tr><td colSpan={isSignatory ? 6 : 5}>No contributions recorded.</td></tr>
                  ) : (
                    contributions.slice(0, 10).map((item) => (
                      <tr key={item.id}>
                        <td>{item.member_name || item.full_name}</td>
                        <td>P{parseFloat(item.amount).toFixed(2)}</td>
                        <td>{item.month}/{item.year}</td>
                        <td>{item.status}</td>
                        <td>
                          {item.status === "approved"
                            ? "✅ All approved"
                            : `${item.approval_count ?? 0}/${item.total_signatories ?? "?"}`}
                        </td>
                        {isSignatory && (
                          <td>
                            {item.status === "pending" && !item.has_approved && (
                              <>
                                <button
                                  onClick={() => this.handleApprove(item.id)}
                                  style={{ marginRight: "6px" }}
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => this.handleReject(item.id)}
                                  style={{ color: "red" }}
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {item.status === "pending" && item.has_approved && (
                              <span style={{ color: "orange" }}>⏳ Waiting for others</span>
                            )}
                            {item.status === "rejected" && (
                              <span style={{ color: "red" }}>❌ Rejected</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    );
  }
}

export default ContributionPage;
