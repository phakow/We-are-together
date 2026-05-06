import apiClient from "./ApiClient";

class GroupService {
  // Returns only groups the user belongs to
  getGroups() {
    return apiClient.get("/groups");
  }

  // Returns ALL groups in the system (for member enrollment dropdown)
  getAllGroups() {
    return apiClient.get("/groups/all");
  }

  getGroupById(groupId) {
    return apiClient.get(`/groups/${groupId}`);
  }

  createGroup(payload) {
    return apiClient.post("/groups", payload);
  }

  updateGroup(groupId, payload) {
    return apiClient.put(`/groups/${groupId}`, payload);
  }

  deleteGroup(groupId) {
    return apiClient.delete(`/groups/${groupId}`);
  }

  getGroupMembers(groupId) {
    return apiClient.get(`/groups/${groupId}/members`);
  }

  getGroupSummary(groupId) {
    return apiClient.get(`/groups/${groupId}/summary`);
  }
}

export default new GroupService();
