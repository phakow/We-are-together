import apiClient from "./ApiClient";

class ContributionService {
  getContributions(groupId) {
    return apiClient.get(`/contributions/${groupId}/contributions`);
  }

  getPendingContributions(groupId) {
    return apiClient.get(`/contributions/${groupId}/contributions/pending`);
  }

  createContribution(groupId, payload) {
    return apiClient.post(`/contributions/${groupId}/contributions`, payload);
  }

  approveContribution(groupId, contributionId) {
    return apiClient.put(`/contributions/${groupId}/contributions/${contributionId}/approve`);
  }

  rejectContribution(groupId, contributionId, reason) {
    return apiClient.put(`/contributions/${groupId}/contributions/${contributionId}/reject`, { reason });
  }

  getContributionSummary(groupId) {
    return apiClient.get(`/contributions/${groupId}/contributions/summary`);
  }
}

export default new ContributionService();
