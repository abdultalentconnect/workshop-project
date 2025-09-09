// Configuration for API endpoints
// This will be dynamically set based on the environment

const getApiBaseUrl = () => {
    // In production, use the current domain
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return window.location.origin;
    }
    // In development, use localhost
    return 'http://localhost:4000';
};

const getRazorpayKey = () => {
    // In production, this should be loaded from your backend or environment
    // For now, using the test key - replace with your actual key
    return 'rzp_test_RCoCmseFQFOsZV';
};

// Export configuration
window.APP_CONFIG = {
    API_BASE_URL: getApiBaseUrl(),
    RAZORPAY_KEY: getRazorpayKey()
};
