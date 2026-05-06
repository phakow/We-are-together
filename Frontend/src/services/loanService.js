import apiClient from "./ApiClient";

class LoanService {
  getLoans(groupId, status = null) {
    const query = status ? `?status=${status}` : "";
    return apiClient.get(`/loans/${groupId}/loans${query}`);
  }

  getPendingLoans(groupId) {
    return apiClient.get(`/loans/${groupId}/loans/pending`);
  }

  applyForLoan(groupId, payload) {
    return apiClient.post(`/loans/${groupId}/loans`, payload);
  }

  approveLoan(groupId, loanId) {
    return apiClient.put(`/loans/${groupId}/loans/${loanId}/approve`);
  }

  rejectLoan(groupId, loanId, reason) {
    return apiClient.put(`/loans/${groupId}/loans/${loanId}/reject`, { reason });
  }

  disburseLoan(groupId, loanId) {
    return apiClient.put(`/loans/${groupId}/loans/${loanId}/disburse`);
  }

  makeLoanPayment(groupId, loanId, payload) {
    return apiClient.post(`/loans/${groupId}/loans/${loanId}/payments`, payload);
  }

  getLoanPayments(groupId, loanId) {
    return apiClient.get(`/loans/${groupId}/loans/${loanId}/payments`);
  }

  approveLoanPayment(groupId, paymentId) {
    return apiClient.put(`/loans/${groupId}/payments/${paymentId}/approve`);
  }
}

export default new LoanService();
