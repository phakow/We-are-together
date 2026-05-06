import apiClient from "./ApiClient";

class MemberService {
  getMembers(groupId) {
    return apiClient.get(`/members/${groupId}/members`);
  }

  createMember(groupId, payload) {
    return apiClient.post(`/members/${groupId}/members`, payload);
  }

  getMemberById(groupId, memberId) {
    return apiClient.get(`/members/${groupId}/members/${memberId}`);
  }

  updateMember(groupId, memberId, payload) {
    return apiClient.put(`/members/${groupId}/members/${memberId}`, payload);
  }

  removeMember(groupId, memberId) {
    return apiClient.delete(`/members/${groupId}/members/${memberId}`);
  }

  updateMemberStatus(groupId, memberId, status) {
    return apiClient.put(`/members/${groupId}/members/${memberId}/status`, { status });
  }

  getMemberContributions(groupId, memberId) {
    return apiClient.get(`/members/${groupId}/members/${memberId}/contributions`);
  }

  getMemberLoans(groupId, memberId) {
    return apiClient.get(`/members/${groupId}/members/${memberId}/loans`);
  }
}

export default new MemberService();