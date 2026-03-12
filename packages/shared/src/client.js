const DEFAULT_BASE_URL = typeof window !== 'undefined' 
  ? (window.location.hostname === 'localhost' ? 'http://localhost:3000' : '/api')
  : 'http://localhost:3000';

export class ApiClient {
  constructor(baseURL = DEFAULT_BASE_URL) {
    this.baseURL = baseURL;
  }

  async request(path, options = {}) {
    const url = `${this.baseURL}${path}`;
    const config = {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const response = await fetch(url, config);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `Request failed with status ${response.status}`);
    }

    return response.json();
  }

  async register(data) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async login(data) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async logout() {
    return this.request('/auth/logout', {
      method: 'POST',
    });
  }

  async getMe() {
    return this.request('/auth/me');
  }

  async createCheckoutSession(data) {
    return this.request('/billing/checkout-session', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createPortalSession(data) {
    return this.request('/billing/portal-session', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createInstitutionalCheckout(data) {
    return this.request('/billing/institutional-checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getTopics() {
    return this.request('/education/topics');
  }

  async getExplanation(data) {
    return this.request('/education/explain', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async generateImage(data) {
    return this.request('/education/image', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async generateQuiz(data) {
    return this.request('/education/quiz', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async chat(data) {
    return this.request('/education/chat', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getLearningProgress() {
    return this.request('/education/progress');
  }

  async getEducationEntitlements() {
    return this.request('/education/entitlements');
  }

  async updateLearningProgress(data) {
    return this.request('/education/progress', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const apiClient = new ApiClient();
