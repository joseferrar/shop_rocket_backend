import axios from 'axios';
import config from './config.js';

let cachedToken = null;
let tokenExpiry = null;

export async function getShiprocketToken() {
  if (config.demoMode) {
    return 'demo-token';
  }

  // Check if token is valid (adding 1 min buffer)
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 60000) {
    return cachedToken;
  }

  try {
    const response = await axios.post('https://apiv2.shiprocket.in/v1/external/auth/login', {
      email: config.shiprocket.email,
      password: config.shiprocket.password
    });

    if (response.data && response.data.token) {
      cachedToken = response.data.token;
      // Shiprocket token typically valid for 9 days. We store 8 days expiry to be safe.
      tokenExpiry = Date.now() + 8 * 24 * 60 * 60 * 1000;
      return cachedToken;
    }
    throw new Error('No token received from Shiprocket');
  } catch (error) {
    console.error('Shiprocket Auth Error:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with Shiprocket');
  }
}
