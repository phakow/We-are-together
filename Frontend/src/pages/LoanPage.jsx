import React, { Component } from "react";
import FormMessage from "../components/common/FormMessage";
import { AuthContext } from "../context/AuthContext";
import loanService from "../services/loanService";
import memberService from "../services/memberService";
import { hasErrors, validateMinNumber, validateRequired } from "../utils/validators";

class LoanPage extends Component {
  static contextType = AuthContext;

  state = {
    members: [],
    loans: [],
    form: {
      memberId: "",
      amount: "",
      reason: "",
      requestedDate: ""
    },
    errors: {},
    loading: true,
    formError: "",
    success: ""
  };

  async componentDidMount() {
    await Promise.all([this.loadMembers(), this.loadLoans()]);
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

  loadLoans = async () => {
    const groupId = this.getGroupId();
    if (!groupId) {
      this.setState({ loading: false });
      return;
    }
    try {
      const loans = await loanService.getLoans(groupId);
      this.setState({ loans: loans || [], loading: false });
    } catch (error) {
      this.setState({ loading: false, formError: "Loan data is waiting for backend connection." });
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
    const errors = validateRequired(["memberId", "amount", "reason", "requestedDate"], this.state.form);
    const amountError = validateMinNumber(this.state.form.amount, 1);
    if (amountError) errors.amount = amountError;

    if (hasErrors(errors)) {
      this.setState({ errors, formError: "", success: "" });
      return;
    }

    const groupId = this.getGroupId();
    try {
      await loanService.applyForLoan(groupId, {
        principal_amount: parseFloat(this.state.form.amount),
        notes: this.state.form.reason,
        member_id: this.state.form.memberId
      });
      this.setState({
        form: { ...this.state.form, amount: "", reason: "", requestedDate: "" },
        errors: {},
        formError: "",
        success: "Loan request submitted. Awaiting signatory approval."
      });
      this.loadLoans();
    } catch (error) {
      this.setState({ formError: error.message || "Unable to create loan.", success: "" });
    }
  };

  render() {
    const { members, loans, form, errors, loading, formError, success } = this.state;

    return (
      <section>
        <h2>Loans</h2>
        <p>Apply for a loan and track approval status.</p>

        <div className="two-column">
          <div>
            <h3>Apply for Loan</h3>
            <form onSubmit={this.handleSubmit} noValidate>
              <label htmlFor="memberId">Member</label>
              <select id="memberId" name="memberId" value={form.memberId} onChange={this.handleChange}>
                <option value="">Select a member</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>{member.full_name}</option>
                ))}
              </select>
              {errors.memberId && <small>{errors.memberId}</small>}

              <label htmlFor="amount">Loan Amount (BWP)</label>
              <input id="amount" name="amount" type="number" min="1" value={form.amount} onChange={this.handleChange} />
              {errors.amount && <small>{errors.amount}</small>}

              <label htmlFor="reason">Reason</label>
              <textarea id="reason" name="reason" value={form.reason} onChange={this.handleChange} />
              {errors.reason && <small>{errors.reason}</small>}

              <label htmlFor="requestedDate">Request Date</label>
              <input id="requestedDate" name="requestedDate" type="date" value={form.requestedDate} onChange={this.handleChange} />
              {errors.requestedDate && <small>{errors.requestedDate}</small>}

              <button type="submit">Submit Loan Application</button>
            </form>
            <FormMessage error={formError} success={success} />
          </div>

          <div>
            <h3>Loan List</h3>
            {loading ? (
              <p>Loading loans...</p>
            ) : (
              <table>
                <thead>
                  <tr><th>Member</th><th>Amount (BWP)</th><th>Balance</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {loans.length === 0 ? (
                    <tr><td colSpan="4">No loans found.</td></tr>
                  ) : (
                    loans.map((loan) => (
                      <tr key={loan.id}>
                        <td>{loan.full_name || loan.member_name}</td>
                        <td>{parseFloat(loan.principal_amount).toFixed(2)}</td>
                        <td>{parseFloat(loan.balance || loan.principal_amount).toFixed(2)}</td>
                        <td>{loan.status || "Pending"}</td>
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

export default LoanPage;
