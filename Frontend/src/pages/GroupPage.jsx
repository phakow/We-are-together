import React, { Component } from "react";
import FormMessage from "../components/common/FormMessage";
import { AuthContext } from "../context/AuthContext";
import groupService from "../services/groupService";
import { hasErrors, validateRequired } from "../utils/validators";

class GroupPage extends Component {
  static contextType = AuthContext;

  state = {
    groups: [],
    form: {
      name: "",
      description: "",
      monthly_contribution: "1000",
      target_interest: "5000",
      interest_rate: "20"
    },
    errors: {},
    loading: true,
    submitting: false,
    formError: "",
    success: ""
  };

  componentDidMount() {
    this.loadGroups();
  }

  loadGroups = async () => {
    this.setState({ loading: true });
    try {
      // Use getAllGroups so we can see all groups, not just our own
      const groups = await groupService.getAllGroups();
      this.setState({ groups: groups || [], loading: false });
    } catch (error) {
      this.setState({ loading: false, formError: "Unable to load groups." });
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
    const errors = validateRequired(["name"], this.state.form);

    if (hasErrors(errors)) {
      this.setState({ errors, formError: "", success: "" });
      return;
    }

    this.setState({ submitting: true, formError: "", success: "" });

    try {
      await groupService.createGroup({
        name: this.state.form.name,
        description: this.state.form.description,
        monthly_contribution: parseFloat(this.state.form.monthly_contribution) || 1000,
        interest_rate: parseFloat(this.state.form.interest_rate) || 20,
        target_interest: parseFloat(this.state.form.target_interest) || 5000
      });

      this.setState({
        form: {
          name: "",
          description: "",
          monthly_contribution: "1000",
          target_interest: "5000",
          interest_rate: "20"
        },
        errors: {},
        submitting: false,
        success: "Group registered successfully! You are now a signatory of this group. Go to Members to enroll people."
      });
      this.loadGroups();
    } catch (error) {
      this.setState({
        submitting: false,
        formError: error.message || "Unable to create group."
      });
    }
  };

  render() {
    const { groups, form, errors, loading, submitting, formError, success } = this.state;

    return (
      <section>
        <h2>Groups</h2>
        <p>Register motshelo groups. The person who creates a group automatically becomes its first signatory.</p>

        <div className="two-column">
          {/* LEFT: Create Form */}
          <div>
            <h3>Register New Group</h3>
            <form onSubmit={this.handleSubmit} noValidate>
              <label htmlFor="name">Group Name *</label>
              <input
                id="name"
                name="name"
                value={form.name}
                onChange={this.handleChange}
                placeholder="e.g. Re-Mmogo Savings Club"
              />
              {errors.name && <small style={{ color: "var(--error)" }}>{errors.name}</small>}

              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={form.description}
                onChange={this.handleChange}
                rows={3}
                placeholder="Optional: describe the group's purpose"
              />

              <label htmlFor="monthly_contribution">Monthly Contribution (BWP)</label>
              <input
                id="monthly_contribution"
                name="monthly_contribution"
                type="number"
                min="1"
                value={form.monthly_contribution}
                onChange={this.handleChange}
              />

              <label htmlFor="interest_rate">Loan Interest Rate (%)</label>
              <input
                id="interest_rate"
                name="interest_rate"
                type="number"
                min="1"
                max="100"
                value={form.interest_rate}
                onChange={this.handleChange}
              />

              <label htmlFor="target_interest">Yearly Interest Target (BWP)</label>
              <input
                id="target_interest"
                name="target_interest"
                type="number"
                min="1"
                value={form.target_interest}
                onChange={this.handleChange}
              />

              <div style={styles.infoBox}>
                📋 You will automatically become the <strong>first signatory</strong> of this group. Add a second signatory by going to <a href="/members">Members</a> and enrolling them with the "Make signatory" checkbox.
              </div>

              <button type="submit" disabled={submitting} style={{ marginTop: "14px", width: "100%" }}>
                {submitting ? "Creating…" : "Create Group"}
              </button>
            </form>
            <FormMessage error={formError} success={success} />
          </div>

          {/* RIGHT: Group List */}
          <div>
            <h3>All Groups</h3>
            {loading ? (
              <p style={{ color: "var(--text-muted)" }}>Loading groups…</p>
            ) : groups.length === 0 ? (
              <div style={styles.emptyState}>
                <p style={{ fontWeight: 600 }}>No groups yet.</p>
                <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                  Register the first motshelo group using the form.
                </p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Group Name</th>
                    <th>Members</th>
                    <th>Monthly (BWP)</th>
                    <th>Interest Rate</th>
                    <th>Target (BWP)</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr key={group.id}>
                      <td style={{ fontWeight: 600 }}>
                        {group.name}
                        {group.description && (
                          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 400 }}>
                            {group.description}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span style={styles.badge}>{group.member_count || 0}</span>
                      </td>
                      <td>P{parseFloat(group.monthly_contribution || 1000).toFixed(2)}</td>
                      <td>{parseFloat(group.interest_rate || 20).toFixed(0)}%</td>
                      <td>P{parseFloat(group.target_interest || 5000).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    );
  }
}

const styles = {
  infoBox: {
    padding: "10px 14px",
    background: "var(--blue-pale)",
    borderRadius: "var(--radius)",
    fontSize: "0.82rem",
    color: "var(--text-secondary)",
    marginTop: "12px",
    border: "1px solid var(--border)"
  },
  emptyState: {
    padding: "2rem",
    textAlign: "center",
    background: "var(--blue-pale)",
    borderRadius: "var(--radius)",
    color: "var(--text-secondary)",
    border: "1px dashed var(--border)"
  },
  badge: {
    background: "var(--blue-pale)",
    color: "var(--blue)",
    padding: "2px 10px",
    borderRadius: "12px",
    fontSize: "0.8rem",
    fontWeight: 700
  }
};

export default GroupPage;
