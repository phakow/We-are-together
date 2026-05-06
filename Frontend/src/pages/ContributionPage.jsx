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
      paymentDate: "",
      proofOfPaymentUrl: ""
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
      await contributionService.createContribution(groupId, {
        amount: this.state.form.amount,
        payment_date: this.state.form.paymentDate,
        month: new Date(this.state.form.paymentMonth).getMonth() + 1,
        year: new Date(this.state.form.paymentMonth).getFullYear(),
        proof_of_payment: this.state.form.proofOfPaymentUrl
      });
      this.setState({
        form: { ...this.state.form, amount: "1000", paymentMonth: "", paymentDate: "", proofOfPaymentUrl: "" },
        errors: {},
        formError: "",
        success: "Contribution submitted. It can be marked approved by signatories."
      });
      this.loadContributionData();
    } catch (error) {
      this.setState({ formError: error.message || "Unable to record contribution.", success: "" });
    }
  };

  render() {
    const { members, contributions, form, errors, loading, formError, success } = this.state;

    return (
      <section>
        <h2>Contributions</h2>
        <p>Record monthly contributions and track approved balances per member.</p>

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

              <label htmlFor="amount">Amount</label>
              <input id="amount" name="amount" type="number" value={form.amount} onChange={this.handleChange} />
              {errors.amount && <small>{errors.amount}</small>}

              <label htmlFor="paymentMonth">Payment Month</label>
              <input id="paymentMonth" name="paymentMonth" type="month" value={form.paymentMonth} onChange={this.handleChange} />
              {errors.paymentMonth && <small>{errors.paymentMonth}</small>}

              <label htmlFor="paymentDate">Payment Date</label>
              <input id="paymentDate" name="paymentDate" type="date" value={form.paymentDate} onChange={this.handleChange} />
              {errors.paymentDate && <small>{errors.paymentDate}</small>}

              <label htmlFor="proofOfPaymentUrl">Proof of Payment URL</label>
              <input id="proofOfPaymentUrl" name="proofOfPaymentUrl" value={form.proofOfPaymentUrl} onChange={this.handleChange} />

              <button type="submit">Submit Contribution</button>
            </form>
            <FormMessage error={formError} success={success} />
          </div>

          <div>
            <h3>Recent Contributions</h3>
            {loading ? (
              <p>Loading contributions...</p>
            ) : (
              <ul>
                {contributions.length === 0 ? (
                  <li>No contributions recorded.</li>
                ) : (
                  contributions.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      {item.member_name} paid {item.amount} — {item.month}/{item.year} ({item.status})
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>
      </section>
    );
  }
}

export default ContributionPage;
