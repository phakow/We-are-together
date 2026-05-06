import apiClient from "./ApiClient";

class ReportService {
  getYearEndReport(groupId, year = null) {
    const query = year ? `?year=${year}` : "";
    return apiClient.get(`/reports/${groupId}/year-end${query}`);
  }

  getMemberRanking(groupId) {
    return apiClient.get(`/reports/${groupId}/member-ranking`);
  }

  getInterestReport(groupId, year = null) {
    const query = year ? `?year=${year}` : "";
    return apiClient.get(`/reports/${groupId}/interest-report${query}`);
  }

  getContributionReport(groupId, year = null) {
    const query = year ? `?year=${year}` : "";
    return apiClient.get(`/reports/${groupId}/contribution-report${query}`);
  }

  getLoanReport(groupId) {
    return apiClient.get(`/reports/${groupId}/loan-report`);
  }
}

export default new ReportService();
