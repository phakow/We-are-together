import React, { Component } from "react";
import FormMessage from "../components/common/FormMessage";
import { AuthContext } from "../context/AuthContext";
import groupService from "../services/groupService";
import memberService from "../services/memberService";
import { hasErrors, validateEmail, validateRequired } from "../utils/validators";

class MemberPage extends Component {
  static contextType = AuthContext;

  state = {
    allGroups: [],
    members: [],
    selectedGroupId: "",
    form: {
      fullName: "",
      email: "",
      isSignatory: false
    },
    errors: {},
    loadingGroups: true,
    loadingMembers: false,
    submitting: false,
    formError: "",
    success: ""
  };

  async componentDidMount() {
    await this.loadAllGroups();
  }

  loadAllGroups = async () => {
    this.setState({ loadingGroups: true });
    try {
      const groups = await groupService.getAllGroups();
      const { user } = this.context;
      const defaultGroupId = user?.group_id
        ? String(user.group_id)
        : groups?.[0]?.id ? String(groups[0].id) : "";

      this.setState({
        allGroups: groups || [],
        selectedGroupId: defaultGroupId,
        loadingGroups: false
      }, () => {
        if (defaultGroupId) this.loadMembers(defaultGroupId);
      });
    } catch (error) {
      this.setState({ loadingGroups: false, formError: "Could not load groups." });
    }
  };

  loadMembers = async (groupId) => {
    if (!groupId) return;
    this.setState({ loadingMembers: true, members: [] });
    try {
      const members = await memberService.getMembers(parseInt(groupId));
      this.setState({ members: members || [], loadingMembers: false });
    } catch (error) {
      this.setState({ loadingMembers: false, members: [] });
    }
  };

  handleGroupChange = (event) => {
    const groupId = event.target.value;
    this.setState({ selectedGroupId: groupId, members: [], formError: "", success: "" });
    if (groupId) this.loadMembers(groupId);
  };

  handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    this.setState((current) => ({
      form: { ...current.form, [name]: type === "checkbox" ? checked : value }
    }));
  };

  handleSubmit = async (event) => {
    event.preventDefault();

    if (!this.state.selectedGroupId) {
      this.setState({ formError: "Please select a group first." });
      return;
    }

    const errors = validateRequired(["fullName", "email"], this.state.form);
    const emailError = validateEmail(this.state.form.email);
    if (emailError) errors.email = emailError;

    if (hasErrors(errors)) {
      this.setState({ errors, formError: "", success: "" });
      return;
    }

    this.setState({ submitting: true, formError: "", success: "" });

    try {
      const enrolledEmail = this.state.form.email;
      await memberService.createMember(parseInt(this.state.selectedGroupId), {
        full_name: this.state.form.fullName,
        email: enrolledEmail,
        is_signatory: this.state.form.isSignatory
      });

      this.setState({
        form: { fullName: "", email: "", isSignatory: false },
        errors: {},
        submitting: false,
        success: `Member enrolled! They can log in with "${enrolledEmail}" and the password Member@123.`
      });

      this.loadMembers(this.state.selectedGroupId);
    } catch (error) {
      this.setState({
        submitting: false,
        formError: error.message || "Unable to enroll member. You must be a signatory of this group."
      });
    }
  };

  getSelectedGroup() {
    return this.state.allGroups.find(g => String(g.id) === String(this.state.selectedGroupId));
  }

  render() {
    const { allGroups, members, selectedGroupId, form, errors, loadingGroups,
            loadingMembers, submitting, formError, success } = this.state;
    const { user } = this.context;
    const isSignatory = user?.is_signatory || user?.role === "admin";
    const selectedGroup = this.getSelectedGroup();

    return (
      <section>
        <h2>Members</h2>
        <p>Enroll members into a motshelo group and manage their details.</p>

        {/* Group Selector Banner */}
        <div style={styles.groupSelector}>
          <span style={styles.groupLabel}>Viewing Group:</span>
          {loadingGroups ? (
            <span style={{ color: "var(--text-muted)" }}>Loading groups…</span>
          ) : (
            <select
              value={selectedGroupId}
              onChange={this.handleGroupChange}
              style={styles.groupDropdown}
            >
              <option value="">— Select a group —</option>
              {allGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} ({group.member_count || 0} members)
                </option>
              ))}
            </select>
          )}
          {selectedGroup && (
            <span style={styles.groupBadge}>
              P{parseFloat(selectedGroup.monthly_contribution || 1000).toFixed(0)}/month · {selectedGroup.interest_rate || 20}% interest
            </span>
          )}
        </div>

        <div className="two-column">

          {/* LEFT: Enroll Form */}
          <div>
            <h3>Enroll New Member</h3>

            {!isSignatory && (
              <div style={styles.warningBox}>
                ⚠️ Only group <strong>signatories</strong> can enroll members. Ask your group admin to grant you signatory access via the Neon SQL Editor:<br />
                <code style={{ display: "block", marginTop: "6px", fontSize: "0.8rem" }}>
                  UPDATE users SET is_signatory = true WHERE email = 'your@email.com';
                </code>
              </div>
            )}

            {allGroups.length === 0 && !loadingGroups && (
              <div style={styles.warningBox}>
                No groups exist yet. <a href="/groups">Create a group first →</a>
              </div>
            )}

            <form onSubmit={this.handleSubmit} noValidate>
              <label htmlFor="enrollGroup">Group</label>
              <select
                id="enrollGroup"
                value={selectedGroupId}
                onChange={this.handleGroupChange}
                disabled={!isSignatory}
              >
                <option value="">— Select a group —</option>
                {allGroups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>

              <label htmlFor="fullName">Full Name</label>
              <input
                id="fullName"
                name="fullName"
                value={form.fullName}
                onChange={this.handleChange}
                placeholder="e.g. Thabo Mokoena"
                disabled={!isSignatory}
              />
              {errors.fullName && <small style={{ color: "var(--error)" }}>{errors.fullName}</small>}

              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={this.handleChange}
                placeholder="e.g. thabo@example.com"
                disabled={!isSignatory}
              />
              {errors.email && <small style={{ color: "var(--error)" }}>{errors.email}</small>}

              <div style={styles.checkboxRow}>
                <input
                  type="checkbox"
                  id="isSignatory"
                  name="isSignatory"
                  checked={form.isSignatory}
                  onChange={this.handleChange}
                  disabled={!isSignatory}
                  style={{ width: "auto", marginRight: "8px", cursor: "pointer" }}
                />
                <label htmlFor="isSignatory" style={{ fontWeight: 500, cursor: "pointer", marginBottom: 0 }}>
                  Make this member a signatory (can approve payments &amp; loans)
                </label>
              </div>

              <div style={styles.infoBox}>
                💡 New members log in with their email and the default password <strong>Member@123</strong>.
              </div>

              <button
                type="submit"
                disabled={!isSignatory || submitting || !selectedGroupId}
                style={{ marginTop: "14px", width: "100%", opacity: (!isSignatory || !selectedGroupId) ? 0.5 : 1 }}
              >
                {submitting ? "Enrolling…" : "➕ Add Member to Group"}
              </button>
            </form>

            <FormMessage error={formError} success={success} />
          </div>

          {/* RIGHT: Member List */}
          <div>
            <h3>
              {selectedGroup ? `${selectedGroup.name} — Members` : "Member List"}
            </h3>

            {!selectedGroupId ? (
              <div style={styles.emptyState}>
                <p>Select a group above to view its members.</p>
              </div>
            ) : loadingMembers ? (
              <p style={{ color: "var(--text-muted)" }}>Loading members…</p>
            ) : members.length === 0 ? (
              <div style={styles.emptyState}>
                <p style={{ fontWeight: 600 }}>No members yet.</p>
                <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                  Use the form to enroll the first member.
                </p>
              </div>
            ) : (
              <>
                <table>
                  <thead>
                    <tr>
                      <th>Member #</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Contributions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member, idx) => (
                      <tr key={member.id}>
                        <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                          {member.member_number || `${idx + 1}`}
                        </td>
                        <td style={{ fontWeight: 600 }}>{member.full_name}</td>
                        <td style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{member.email}</td>
                        <td>
                          {member.is_signatory
                            ? <span style={styles.badgeSignatory}>✓ Signatory</span>
                            : <span style={styles.badgeMember}>Member</span>}
                        </td>
                        <td>
                          <span style={member.status === "active" ? styles.badgeActive : styles.badgeInactive}>
                            {member.status || "active"}
                          </span>
                        </td>
                        <td style={{ fontWeight: 500 }}>
                          P{parseFloat(member.total_contributions || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ marginTop: "10px", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  {members.length} member{members.length !== 1 ? "s" : ""}
                  {" · "}
                  {members.filter(m => m.is_signatory).length} signator{members.filter(m => m.is_signatory).length !== 1 ? "ies" : "y"}
                </p>
              </>
            )}
          </div>
        </div>
      </section>
    );
  }
}

const styles = {
  groupSelector: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 16px",
    background: "var(--blue-pale)",
    borderRadius: "var(--radius)",
    marginBottom: "1.5rem",
    flexWrap: "wrap",
    border: "1px solid var(--border)"
  },
  groupLabel: {
    fontWeight: 700,
    color: "var(--navy)",
    whiteSpace: "nowrap",
    fontSize: "0.9rem"
  },
  groupDropdown: {
    flex: "1",
    minWidth: "200px",
    padding: "8px 12px",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
    background: "white",
    fontWeight: 500
  },
  groupBadge: {
    fontSize: "0.78rem",
    color: "var(--blue)",
    background: "white",
    border: "1px solid var(--blue-light)",
    borderRadius: "20px",
    padding: "3px 10px",
    whiteSpace: "nowrap"
  },
  warningBox: {
    padding: "12px 14px",
    background: "#fff8e6",
    border: "1px solid #f0c040",
    borderRadius: "var(--radius)",
    marginBottom: "1rem",
    fontSize: "0.875rem",
    color: "#7a5800"
  },
  infoBox: {
    padding: "10px 14px",
    background: "var(--blue-pale)",
    borderRadius: "var(--radius)",
    fontSize: "0.8rem",
    color: "var(--text-secondary)",
    marginTop: "8px",
    border: "1px solid var(--border)"
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    margin: "14px 0 4px"
  },
  emptyState: {
    padding: "2rem",
    textAlign: "center",
    background: "var(--blue-pale)",
    borderRadius: "var(--radius)",
    color: "var(--text-secondary)",
    border: "1px dashed var(--border)"
  },
  badgeSignatory: {
    background: "#e8f5e9",
    color: "#1a7a40",
    padding: "2px 8px",
    borderRadius: "12px",
    fontSize: "0.75rem",
    fontWeight: 700
  },
  badgeMember: {
    background: "var(--blue-pale)",
    color: "var(--blue)",
    padding: "2px 8px",
    borderRadius: "12px",
    fontSize: "0.75rem",
    fontWeight: 600
  },
  badgeActive: {
    background: "#e8f5e9",
    color: "#1a7a40",
    padding: "2px 8px",
    borderRadius: "12px",
    fontSize: "0.75rem"
  },
  badgeInactive: {
    background: "#fdecea",
    color: "#c0392b",
    padding: "2px 8px",
    borderRadius: "12px",
    fontSize: "0.75rem"
  }
};

export default MemberPage;
