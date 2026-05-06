import React, { Component } from "react";
import FormMessage from "../components/common/FormMessage";
import { AuthContext } from "../context/AuthContext";
import memberService from "../services/memberService";
import { hasErrors, validateEmail, validateRequired } from "../utils/validators";

class MemberPage extends Component {
  static contextType = AuthContext;

  state = {
    members: [],
    form: {
      fullName: "",
      email: "",
      phoneNumber: "",
      isSignatory: false
    },
    errors: {},
    loading: true,
    formError: "",
    success: ""
  };

  async componentDidMount() {
    await this.loadMembers();
  }

  getGroupId() {
    return this.context.user?.group_id;
  }

  loadMembers = async () => {
    const groupId = this.getGroupId();
    if (!groupId) {
      this.setState({ loading: false });
      return;
    }
    try {
      const members = await memberService.getMembers(groupId);
      this.setState({ members: members || [], loading: false });
    } catch (error) {
      this.setState({ loading: false, formError: "Unable to load members." });
    }
  };

  handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    this.setState((current) => ({
      form: { ...current.form, [name]: type === "checkbox" ? checked : value }
    }));
  };

  handleSubmit = async (event) => {
    event.preventDefault();
    const errors = validateRequired(["fullName", "email"], this.state.form);
    const emailError = validateEmail(this.state.form.email);
    if (emailError) errors.email = emailError;

    if (hasErrors(errors)) {
      this.setState({ errors, formError: "", success: "" });
      return;
    }

    const groupId = this.getGroupId();
    if (!groupId) {
      this.setState({ formError: "No group found. Please ensure you are assigned to a group." });
      return;
    }

    try {
      await memberService.createMember(groupId, {
        full_name: this.state.form.fullName,
        email: this.state.form.email,
        is_signatory: this.state.form.isSignatory
      });
      this.setState({
        form: { fullName: "", email: "", phoneNumber: "", isSignatory: false },
        errors: {},
        formError: "",
        success: "Member enrolled successfully. They can log in with their email and the default password Member@123."
      });
      this.loadMembers();
    } catch (error) {
      this.setState({ formError: error.message || "Unable to enroll member.", success: "" });
    }
  };

  render() {
    const { members, form, errors, loading, formError, success } = this.state;
    const { user } = this.context;
    const isSignatory = user?.is_signatory || user?.role === 'admin';

    return (
      <section>
        <h2>Members</h2>
        <p>Enroll and manage members of your motshelo group.</p>

        <div className="two-column">
          {isSignatory && (
            <div>
              <h3>Enroll Member</h3>
              <form onSubmit={this.handleSubmit} noValidate>
                <label htmlFor="fullName">Full Name</label>
                <input id="fullName" name="fullName" value={form.fullName} onChange={this.handleChange} />
                {errors.fullName && <small>{errors.fullName}</small>}

                <label htmlFor="email">Email</label>
                <input id="email" name="email" type="email" value={form.email} onChange={this.handleChange} />
                {errors.email && <small>{errors.email}</small>}

                <label>
                  <input
                    type="checkbox"
                    name="isSignatory"
                    checked={form.isSignatory}
                    onChange={this.handleChange}
                    style={{ marginRight: "8px" }}
                  />
                  Make this member a signatory (approver)
                </label>

                <button type="submit" style={{ marginTop: "12px" }}>Add Member</button>
              </form>
              <FormMessage error={formError} success={success} />
            </div>
          )}

          <div>
            <h3>Member List</h3>
            {!isSignatory && formError && <p style={{ color: "red" }}>{formError}</p>}
            {loading ? (
              <p>Loading members...</p>
            ) : (
              <table>
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Signatory</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {members.length === 0 ? (
                    <tr><td colSpan="4">No members found.</td></tr>
                  ) : (
                    members.map((member) => (
                      <tr key={member.id}>
                        <td>{member.full_name}</td>
                        <td>{member.email}</td>
                        <td>{member.is_signatory ? "✓ Yes" : "No"}</td>
                        <td>{member.status || "active"}</td>
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

export default MemberPage;
