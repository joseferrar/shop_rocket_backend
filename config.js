/**
 * Application Configuration
 * Centralized settings for server, database, and Shiprocket integration.
 */
const config = {
  // Server Port
  port: 5001,

  // Execution Mode: set to false to connect directly to live Shiprocket APIs, true for mock offline testing
  demoMode: false,

  // Shiprocket Credentials & Warehouse Settings
  shiprocket: {
    email: 'morapapapadi@gmail.com',
    password: 'XeTY^Ud9eprPZC%@w19151n@&C%d*wwU',
    pickupPincode: '600116',
    pickupLocation: 'work'
  },

  // Webhook Settings
  // Note: Shiprocket passes this in the 'x-api-key' request header.
  webhook: {
    secretToken: process.env.SHIPROCKET_WEBHOOK_TOKEN || 'whsec_gimbll_2026_track_key',
    authHeader: 'x-api-key'
  }
};

export default config;
