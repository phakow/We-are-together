import apiClient from "./ApiClient";

class ReportService {
  getYearEndReport(groupId, year = null) {
    const query = year ? `?year=${year}` : "";
    return apiClient.get(`/reports/${groupId}/year-end${query}`);
  }

  getMemberRanking(groupId) {
    return apiClient.get(`/reports/${groupId}/rankings`);
  }

  getInterestReport(groupId, year = null) {
    const query = year ? `?year=${year}` : "";
    return apiClient.get(`/reports/${groupId}/interest${query}`);
  }

  getContributionReport(groupId, year = null) {
    const query = year ? `?year=${year}` : "";
    return apiClient.get(`/reports/${groupId}/contributions${query}`);
  }

  getLoanReport(groupId) {
    return apiClient.get(`/reports/${groupId}/loans`);
  }
}

export default new ReportService();
