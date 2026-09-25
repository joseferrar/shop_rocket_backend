/**
 * Example Application Configuration Template
 * Duplicate this file as `config.js` and fill in your actual credentials.
 */
const config = {
  // Server Port
  port: 5001,

  // Execution Mode: set to false for live Shiprocket APIs, true for offline mock data
  demoMode: false,

  // Shiprocket Credentials & Warehouse Settings
  shiprocket: {
    email: 'your_api_user_email@example.com',
    password: 'your_api_user_password',
    pickupPincode: '600116',
    pickupLocation: 'work'
  }
};

export default config;
