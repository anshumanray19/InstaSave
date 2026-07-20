/**
 * API Configuration
 * Determines which backend to use for different operations
 */

// Get backend URL from environment or use localhost for development
const getBackendUrl = () => {
  // Check if running in browser and has injected env
  if (typeof window !== 'undefined' && window.ENV?.BACKEND_URL) {
    return window.ENV.BACKEND_URL;
  }
  
  // Check for development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3001';
  }
  
  // Production - try to get from meta tag or default to same origin
  const backendMeta = document.querySelector('meta[name="backend-url"]');
  if (backendMeta) {
    return backendMeta.getAttribute('content');
  }
  
  // Fallback: same origin (won't work for heavy ops but better than nothing)
  return '';
};

const API_CONFIG = {
  // Lightweight operations (Instagram, session management)
  // These run on Vercel serverless functions
  light: '/api',
  
  // Heavy operations (YouTube, FFmpeg, Reddit video merging)
  // These run on separate backend server
  heavy: getBackendUrl(),
  
  // Check if backend is available
  async checkBackendHealth() {
    try {
      const response = await fetch(`${this.heavy}/health`);
      if (response.ok) {
        const data = await response.json();
        return data.status === 'healthy';
      }
      return false;
    } catch (error) {
      console.warn('Backend health check failed:', error);
      return false;
    }
  }
};

// Log configuration in development
if (window.location.hostname === 'localhost') {
  console.log('API Configuration:', {
    light: API_CONFIG.light,
    heavy: API_CONFIG.heavy
  });
}

// Make available globally
window.API_CONFIG = API_CONFIG;
