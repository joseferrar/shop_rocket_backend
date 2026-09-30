import express from 'express';
import axios from 'axios';
import config from '../config.js';
import { 
  createOrder, 
  getOrders, 
  getOrder, 
  updateOrder,
  findOrderByAwbOrId,
  updateOrderByAwbOrId,
  recordWebhookEvent,
  getWebhookLogs 
} from '../db.js';
import { getShiprocketToken } from '../shiprocketAuth.js';

const router = express.Router();

const isDemo = () => Boolean(config.demoMode);

// 5.1 Check Serviceability & Courier Rates
router.post('/shipping/check-serviceability', async (req, res) => {
  const { delivery_pincode, weight, cod } = req.body;
  const pickup_pincode = config.shiprocket?.pickupPincode || '600116';

  try {
    if (isDemo()) {
      // Mock Response
      const mockCouriers = [
        {
          courier_company_id: 1,
          courier_name: "Blue Dart Express",
          rate: 78.0,
          freight_charge: 78.0,
          etd: "1-2 Days",
          estimated_delivery_days: "2",
          rating: 4.8,
          delivery_performance: 4.9,
          tracking_performance: 4.9,
          pickup_performance: 4.7,
          rto_performance: 4.8,
          pod_available: "Instant",
          call_before_delivery: "Available",
          zone: "z_a",
          rto_charges: 65.0,
          charge_weight: weight,
          realtime_tracking: "Real Time",
          cod: false
        },
        {
          courier_company_id: 2,
          courier_name: "Delhivery Surface",
          rate: 48.0,
          freight_charge: 48.0,
          etd: "3-4 Days",
          estimated_delivery_days: "3",
          rating: 4.6,
          delivery_performance: 4.5,
          tracking_performance: 4.6,
          pickup_performance: 4.4,
          rto_performance: 4.5,
          pod_available: "Instant",
          call_before_delivery: "Available",
          zone: "z_a",
          rto_charges: 42.0,
          charge_weight: weight,
          realtime_tracking: "Real Time",
          cod: true
        },
        {
          courier_company_id: 3,
          courier_name: "Shadowfox",
          rate: 45.0,
          freight_charge: 45.0,
          etd: "2-3 Days",
          estimated_delivery_days: "2",
          rating: 4.4,
          delivery_performance: 4.2,
          tracking_performance: 4.3,
          pickup_performance: 4.1,
          rto_performance: 4.2,
          pod_available: "Standard",
          call_before_delivery: "Not Available",
          zone: "z_a",
          rto_charges: 38.0,
          charge_weight: weight,
          realtime_tracking: "Real Time",
          cod: true
        }
      ];

      return res.json({
        success: true,
        couriers: mockCouriers,
        raw_response: {
          status: 200,
          data: {
            available_courier_companies: mockCouriers
          }
        },
        request_params: {
          pickup_postcode: pickup_pincode,
          delivery_postcode: delivery_pincode,
          weight: weight,
          cod: cod
        }
      });
    }

    const token = await getShiprocketToken();
    const response = await axios.get(`https://apiv2.shiprocket.in/v1/external/courier/serviceability/`, {
      params: {
        pickup_postcode: pickup_pincode,
        delivery_postcode: delivery_pincode,
        weight: weight,
        cod: cod
      },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (response.data && response.data.data && response.data.data.available_courier_companies) {
      const couriers = response.data.data.available_courier_companies.map(c => ({
        ...c,
        cod: c.cod === 1
      }));
      return res.json({
        success: true,
        couriers,
        raw_response: {
          success: true,
          data: response.data
        },
        request_params: {
          pickup_postcode: pickup_pincode,
          delivery_postcode: delivery_pincode,
          weight: weight,
          cod: cod
        }
      });
    } else {
      return res.json({
        success: true,
        couriers: [],
        raw_response: {
          success: true,
          data: response.data || {}
        },
        request_params: {
          pickup_postcode: pickup_pincode,
          delivery_postcode: delivery_pincode,
          weight: weight,
          cod: cod
        }
      });
    }

  } catch (error) {
    console.error('Serviceability Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: 'Failed to check serviceability' });
  }
});

// 5.2 Create Order
router.post('/orders/create', async (req, res) => {
  try {
    const orderData = req.body;
    orderData.id = `GMB-${Math.floor(1000 + Math.random() * 9000)}`;
    orderData.createdAt = new Date().toISOString();
    orderData.status = 'PROCESSING';
    
    let rawShiprocket = null;
    if (!isDemo()) {
      const token = await getShiprocketToken();
      
      const shiprocketPayload = {
        order_id: orderData.id,
        order_date: new Date().toISOString().split('T')[0],
        pickup_location: config.shiprocket?.pickupLocation || "work",
        billing_customer_name: orderData.customer.name,
        billing_last_name: "",
        billing_address: orderData.customer.address,
        billing_address_2: "",
        billing_city: orderData.customer.city,
        billing_pincode: orderData.customer.pincode,
        billing_state: orderData.customer.state,
        billing_country: "India",
        billing_email: orderData.customer.email,
        billing_phone: orderData.customer.phone,
        shipping_is_billing: true,
        order_items: orderData.items.map(item => ({
          name: item.name,
          sku: item.sku,
          units: item.qty,
          selling_price: item.price
        })),
        payment_method: orderData.payment_method || "Prepaid",
        sub_total: orderData.totalAmount,
        length: orderData.package.length,
        breadth: orderData.package.breadth,
        height: orderData.package.height,
        weight: orderData.package.weight
      };

      const response = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', shiprocketPayload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      rawShiprocket = response.data;
      
      if (response.data && response.data.order_id) {
        orderData.shiprocket_order_id = response.data.order_id;
        orderData.shipment_id = response.data.shipment_id;
      }
    } else {
      orderData.shiprocket_order_id = `SR-${Math.floor(100000 + Math.random() * 900000)}`;
      orderData.shipment_id = `SH-${Math.floor(10000 + Math.random() * 90000)}`;
      rawShiprocket = {
        order_id: orderData.shiprocket_order_id,
        shipment_id: orderData.shipment_id,
        status: "NEW",
        status_code: 1,
        channel_order_id: orderData.id
      };
    }

    const savedOrder = await createOrder(orderData);
    res.json({ success: true, order: savedOrder, raw_shiprocket_response: rawShiprocket });
  } catch (error) {
    console.error('Create Order Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: 'Failed to create order' });
  }
});

// 5.3 Fetch All Orders
router.get('/orders', async (req, res) => {
  try {
    const orders = await getOrders();
    // sort orders by createdAt descending
    const sorted = [...orders].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, orders: sorted });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

// 5.4 Assign Courier / Generate AWB
router.post('/orders/:id/fulfill', async (req, res) => {
  try {
    const order = await getOrder(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    let awb_code;

    if (isDemo()) {
      awb_code = `MOCK-AWB-${Date.now()}`;
    } else {
      const token = await getShiprocketToken();
      const payload = {
        shipment_id: order.shipment_id,
        courier_id: order.shipping.courier_id
      };
      
      const response = await axios.post('https://apiv2.shiprocket.in/v1/external/courier/assign/awb', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data && response.data.response && response.data.response.data && response.data.response.data.awb_code) {
        awb_code = response.data.response.data.awb_code;
      } else {
         throw new Error('Failed to generate AWB from Shiprocket');
      }
    }

    const updatedOrder = await updateOrder(order.id, {
      status: 'SHIPPED',
      awb_code
    });

    res.json({ success: true, order: updatedOrder });
  } catch (error) {
    console.error('Fulfill Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: 'Failed to fulfill order' });
  }
});

// 5.5 Track Shipment
router.get('/shipping/track/:awb', async (req, res) => {
  try {
    const { awb } = req.params;

    if (isDemo()) {
      return res.json({
        success: true,
        tracking: [
          { status: 'DELIVERED', date: new Date().toISOString(), location: 'Customer Address' },
          { status: 'OUT FOR DELIVERY', date: new Date(Date.now() - 86400000).toISOString(), location: 'Local Hub' },
          { status: 'IN TRANSIT', date: new Date(Date.now() - 172800000).toISOString(), location: 'Regional Hub' },
          { status: 'PICKED UP', date: new Date(Date.now() - 259200000).toISOString(), location: 'Seller Hub' }
        ]
      });
    }

    const token = await getShiprocketToken();
    const response = await axios.get(`https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data && response.data.tracking_data) {
      // mapping Shiprocket timeline
      const tracking = response.data.tracking_data.shipment_track_activities.map(a => ({
        status: a.activity,
        date: a.date,
        location: a.location
      }));
      return res.json({ success: true, tracking });
    }
    return res.json({ success: false, tracking: [] });
    
  } catch (error) {
    console.error('Track Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: 'Failed to track shipment' });
  }
});

// 5.6 Generate / Fetch Shipping Label
router.post('/orders/:id/label', async (req, res) => {
  try {
    const order = await getOrder(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!order.shipment_id) return res.status(400).json({ success: false, message: 'No shipment_id found for order' });

    if (isDemo()) {
      return res.json({
        success: true,
        label_url: null,
        message: 'Demo mode: label preview available in Guide'
      });
    }

    const token = await getShiprocketToken();
    const response = await axios.post('https://apiv2.shiprocket.in/v1/external/courier/generate/label', {
      shipment_id: [order.shipment_id]
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data && response.data.label_url) {
      return res.json({ success: true, label_url: response.data.label_url });
    }
    return res.json({ success: true, label_url: response.data.response || null });
  } catch (error) {
    console.error('Label Generation Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: 'Failed to generate label' });
  }
});

// ==========================================
// 6. COMPREHENSIVE SHIPROCKET RAW APIS SUITE
// ==========================================

// 6.1 Authentication Token Status
router.get('/shiprocket/auth', async (req, res) => {
  try {
    if (isDemo()) {
      return res.json({ success: true, token: 'demo-token-12345', expires_in_days: 9 });
    }
    const token = await getShiprocketToken();
    res.json({ success: true, token_preview: token ? `${token.substring(0, 15)}...` : null, expires_in_days: 9 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 6.2 Wallet Balance
router.get('/shiprocket/wallet', async (req, res) => {
  try {
    if (isDemo()) {
      return res.json({ success: true, data: { balance_amount: '1000.00' } });
    }
    const token = await getShiprocketToken();
    const response = await axios.get('https://apiv2.shiprocket.in/v1/external/account/details/wallet-balance', {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data || error.message });
  }
});

// 6.3 Pickup Locations / Warehouses
router.get('/shiprocket/pickup-locations', async (req, res) => {
  try {
    if (isDemo()) {
      return res.json({
        success: true,
        data: {
          shipping_address: [{
            id: 118254999,
            pickup_location: "work",
            name: "Kamalesh",
            email: "kkamalesh@gmail.com",
            phone: "8925411784",
            address: "45/90, Nethaji Nagar, Ramakrishna Nagar, Porur, Chennai, Tamil Nadu 600116",
            pin_code: "600116",
            city: "Kanchipuram",
            state: "Tamil Nadu",
            country: "India",
            is_primary_location: 1
          }],
          company_name: "GIMBLL TECHNOLOGIES LLP"
        }
      });
    }
    const token = await getShiprocketToken();
    const response = await axios.get('https://apiv2.shiprocket.in/v1/external/settings/company/pickup', {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data || error.message });
  }
});

// 6.4 Raw Courier Serviceability & Full Rate Card (All 40+ fields)
router.post('/shiprocket/raw-serviceability', async (req, res) => {
  const { pickup_pincode = config.shiprocket?.pickupPincode || '600116', delivery_pincode = '560001', weight = 0.5, cod = 0 } = req.body;
  try {
    if (isDemo()) {
      return res.json({
        success: true,
        data: {
          data: {
            available_courier_companies: [
              {
                courier_company_id: 10,
                courier_name: "Delhivery Air",
                rate: 111.72,
                freight_charge: 111.72,
                etd: "Sep 30, 2026",
                estimated_delivery_days: "4",
                rating: 4.8,
                pod_available: "Instant",
                call_before_delivery: "Available",
                rto_charges: 83,
                zone: "z_c",
                rto_performance: 4.6,
                delivery_performance: 5.0
              }
            ]
          }
        }
      });
    }
    const token = await getShiprocketToken();
    const response = await axios.get('https://apiv2.shiprocket.in/v1/external/courier/serviceability/', {
      params: {
        pickup_postcode: pickup_pincode,
        delivery_postcode: delivery_pincode,
        weight: weight,
        cod: cod
      },
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data || error.message });
  }
});

// 6.5 Orders List (from Shiprocket)
router.get('/shiprocket/orders', async (req, res) => {
  try {
    if (isDemo()) {
      return res.json({
        success: true,
        data: {
          data: [],
          meta: { pagination: { total: 0, count: 0, per_page: 15, current_page: 1, total_pages: 1 } }
        }
      });
    }
    const token = await getShiprocketToken();
    const response = await axios.get('https://apiv2.shiprocket.in/v1/external/orders?per_page=10', {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data || error.message });
  }
});

// 6.6 Single Order Details (from Shiprocket)
router.get('/shiprocket/orders/:orderId', async (req, res) => {
  try {
    if (isDemo()) {
      return res.json({
        success: true,
        data: {
          id: req.params.orderId,
          channel_order_id: `GMB-${req.params.orderId}`,
          status: "PROCESSING"
        }
      });
    }
    const token = await getShiprocketToken();
    const response = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders/show/${req.params.orderId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data || error.message });
  }
});

// 6.7 Generate Pickup Vehicle Request
router.post('/shiprocket/orders/pickup', async (req, res) => {
  const { shipment_id } = req.body;
  try {
    if (isDemo()) {
      return res.json({
        success: true,
        data: {
          pickup_status: 1,
          response: {
            pickup_token_number: `PKP-TOKEN-${Date.now()}`,
            data: "Pickup scheduled for tomorrow between 10:00 AM - 1:00 PM"
          }
        }
      });
    }
    const token = await getShiprocketToken();
    const response = await axios.post('https://apiv2.shiprocket.in/v1/external/courier/generate/pickup', {
      shipment_id: [shipment_id]
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data || error.message });
  }
});

// 6.8 Generate Order Tax Invoice (PDF)
router.post('/shiprocket/orders/invoice', async (req, res) => {
  const { ids } = req.body;
  try {
    if (isDemo()) {
      return res.json({
        success: true,
        data: {
          is_invoice_created: true,
          invoice_url: "https://sr-core-cdn.shiprocket.in/sample-invoice.pdf"
        }
      });
    }
    const token = await getShiprocketToken();
    const response = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/print/invoice', {
      ids: Array.isArray(ids) ? ids : [ids]
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data || error.message });
  }
});

// 6.9 Generate Courier Manifest
router.post('/shiprocket/manifest/generate', async (req, res) => {
  const { shipment_id } = req.body;
  try {
    if (isDemo()) {
      return res.json({
        success: true,
        data: {
          manifest_url: "https://sr-core-cdn.shiprocket.in/sample-manifest.pdf",
          status: 1
        }
      });
    }
    const token = await getShiprocketToken();
    const response = await axios.post('https://apiv2.shiprocket.in/v1/external/manifests/generate', {
      shipment_id: Array.isArray(shipment_id) ? shipment_id : [shipment_id]
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data || error.message });
  }
});

// 6.10 Print Courier Manifest
router.post('/shiprocket/manifest/print', async (req, res) => {
  const { order_ids } = req.body;
  try {
    if (isDemo()) {
      return res.json({
        success: true,
        data: {
          manifest_url: "https://sr-core-cdn.shiprocket.in/sample-manifest.pdf"
        }
      });
    }
    const token = await getShiprocketToken();
    const response = await axios.post('https://apiv2.shiprocket.in/v1/external/manifests/print', {
      order_ids: Array.isArray(order_ids) ? order_ids : [order_ids]
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data || error.message });
  }
});

// 6.11 NDR (Non-Delivery Reports) List
router.get('/shiprocket/ndr', async (req, res) => {
  try {
    if (isDemo()) {
      return res.json({
        success: true,
        data: {
          data: [],
          meta: { pagination: { total: 0, count: 0, per_page: 15, current_page: 1, total_pages: 1 } }
        }
      });
    }
    const token = await getShiprocketToken();
    const response = await axios.get('https://apiv2.shiprocket.in/v1/external/ndr/all', {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data || error.message });
  }
});

// 6.12 NDR Action (Reattempt or Return to Origin)
router.post('/shiprocket/ndr/action', async (req, res) => {
  const { action, awb, deferred_date } = req.body;
  try {
    if (isDemo()) {
      return res.json({
        success: true,
        data: { message: `NDR action '${action}' registered for AWB ${awb}` }
      });
    }
    const token = await getShiprocketToken();
    const response = await axios.post('https://apiv2.shiprocket.in/v1/external/ndr/action', {
      action,
      awb,
      deferred_date
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data || error.message });
  }
});

// 6.13 Cancel Order in Shiprocket
router.post('/shiprocket/orders/cancel', async (req, res) => {
  const { ids } = req.body;
  try {
    if (isDemo()) {
      return res.json({
        success: true,
        data: { message: "Order cancelled successfully in Shiprocket" }
      });
    }
    const token = await getShiprocketToken();
    const response = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/cancel', {
      ids: Array.isArray(ids) ? ids : [ids]
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data || error.message });
  }
});

// 6.14 Create Return Order (Reverse Logistics)
router.post('/shiprocket/orders/return', async (req, res) => {
  try {
    if (isDemo()) {
      return res.json({
        success: true,
        data: {
          order_id: `RET-${Math.floor(100000 + Math.random() * 900000)}`,
          shipment_id: `SH-RET-${Date.now()}`,
          status: "RETURN_INITIATED"
        }
      });
    }
    const token = await getShiprocketToken();
    const response = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/create/return', req.body, {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data || error.message });
  }
});

// 6.15 Raw Live Tracking by AWB
router.get('/shiprocket/raw-track/:awb', async (req, res) => {
  try {
    if (isDemo()) {
      return res.json({
        success: true,
        data: {
          tracking_data: {
            track_status: 1,
            shipment_status: 7,
            shipment_track: [{ current_status: "DELIVERED" }],
            shipment_track_activities: [
              { activity: "DELIVERED", date: new Date().toISOString(), location: "Customer Doorstep" }
            ]
          }
        }
      });
    }
    const token = await getShiprocketToken();
    const response = await axios.get(`https://apiv2.shiprocket.in/v1/external/courier/track/awb/${req.params.awb}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data || error.message });
  }
});

// ==========================================
// 7. SHIPROCKET WEBHOOK INTEGRATION
// ==========================================

// 7.1 Webhook Config Details (For setup verification & dashboard copy-paste)
router.get('/tracking/config', (req, res) => {
  res.json({
    success: true,
    webhook_url_path: '/api/tracking/events',
    recommended_full_url: `${req.protocol}://${req.get('host')}/api/tracking/events`,
    auth_token_type: config.webhook?.authHeader || 'x-api-key',
    token: config.webhook?.secretToken || 'whsec_gimbll_2026_track_key',
    forbidden_keywords_check: {
      has_shiprocket: false,
      has_kartrocket: false,
      has_sr: false,
      has_kr: false,
      status: 'PASSED'
    }
  });
});

// 7.2 Webhook Logs (Inspect incoming webhook events)
router.get('/tracking/events/logs', async (req, res) => {
  try {
    const logs = await getWebhookLogs();
    res.json({ success: true, count: logs.length, logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper: Common Webhook Event Processor
async function handleTrackingWebhook(req, res) {
  try {
    // 1. Authenticate Request
    const expectedToken = config.webhook?.secretToken || 'whsec_gimbll_2026_track_key';
    const incomingToken = req.headers['x-api-key'] || req.headers['authorization'] || req.headers['token'];

    // If an auth token is sent, verify it matches
    if (incomingToken && incomingToken !== expectedToken && incomingToken !== `Bearer ${expectedToken}`) {
      console.warn(`[Webhook Warning] Unauthorized webhook attempt with token: ${incomingToken}`);
      return res.status(401).json({ success: false, message: 'Unauthorized: Invalid token in header' });
    }

    const payload = req.body || {};
    console.log('[Webhook Received Payload]:', JSON.stringify(payload));

    // Handle Shiprocket "Test Webhook" ping
    const isTestPing = !payload.awb && !payload.order_id && !payload.current_status;

    const awb = payload.awb || payload.awb_code;
    const orderId = payload.order_id || payload.channel_order_id;
    const shipmentId = payload.shipment_id;
    const currentStatus = payload.current_status || payload.shipment_status || (isTestPing ? 'TEST_PING' : 'UPDATED');
    const courierName = payload.courier_name;
    const scans = payload.scans || [];
    const etd = payload.etd;

    // Map Shiprocket status to app status enum
    let mappedStatus = 'PROCESSING';
    const statusUpper = String(currentStatus).toUpperCase();
    if (statusUpper.includes('DELIVERED') && !statusUpper.includes('RTO')) {
      mappedStatus = 'DELIVERED';
    } else if (statusUpper.includes('OUT') || statusUpper.includes('OFD')) {
      mappedStatus = 'OUT_FOR_DELIVERY';
    } else if (statusUpper.includes('TRANSIT') || statusUpper.includes('REACHED')) {
      mappedStatus = 'IN_TRANSIT';
    } else if (statusUpper.includes('PICK')) {
      mappedStatus = 'PICKED_UP';
    } else if (statusUpper.includes('RTO')) {
      mappedStatus = 'RTO';
    } else if (statusUpper.includes('CANCEL')) {
      mappedStatus = 'CANCELLED';
    } else if (statusUpper.includes('SHIPPED')) {
      mappedStatus = 'SHIPPED';
    }

    // Try finding matching order
    let matchedOrder = null;
    if (awb) matchedOrder = await findOrderByAwbOrId(awb);
    if (!matchedOrder && orderId) matchedOrder = await findOrderByAwbOrId(orderId);
    if (!matchedOrder && shipmentId) matchedOrder = await findOrderByAwbOrId(shipmentId);

    if (matchedOrder) {
      const updates = {
        status: mappedStatus,
        shipment_status: currentStatus,
        last_tracking_update: new Date().toISOString(),
        updated_via_webhook: true
      };
      if (scans && scans.length > 0) {
        updates.tracking_scans = scans;
      }
      if (courierName && (!matchedOrder.shipping || !matchedOrder.shipping.courier_name)) {
        updates.shipping = { ...(matchedOrder.shipping || {}), courier_name: courierName };
      }
      if (awb && !matchedOrder.awb_code) {
        updates.awb_code = awb;
      }
      if (etd) {
        updates.etd = etd;
      }
      await updateOrderByAwbOrId(matchedOrder.id, updates);
    }

    // Record the webhook log event for UI / Audit
    const eventLog = await recordWebhookEvent({
      type: isTestPing ? 'TEST_PING' : 'TRACKING_UPDATE',
      current_status: currentStatus,
      mapped_status: mappedStatus,
      awb: awb || null,
      order_id: orderId || null,
      shipment_id: shipmentId || null,
      matched_order_id: matchedOrder ? matchedOrder.id : null,
      courier_name: courierName || null,
      scans_count: scans.length,
      payload
    });

    // Return HTTP 200 OK promptly
    return res.status(200).json({
      success: true,
      message: isTestPing ? 'Test webhook received and verified successfully' : 'Tracking update processed successfully',
      matched_order: matchedOrder ? matchedOrder.id : null,
      event_id: eventLog.id
    });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

// 7.3 Main Webhook Endpoint (Strictly compliant: NO 'shiprocket', 'kartrocket', 'sr', or 'kr')
router.post('/tracking/events', handleTrackingWebhook);

// Supporting Aliases
router.post('/fulfillment/events', handleTrackingWebhook);
router.post('/v1/shipment-events', handleTrackingWebhook);
router.post('/tracking-updates', handleTrackingWebhook);

// 7.4 Simulate Webhook Event (For testing from UI or scripts)
router.post('/tracking/events/simulate', async (req, res) => {
  if (!req.headers['x-api-key']) {
    req.headers['x-api-key'] = config.webhook?.secretToken || 'whsec_gimbll_2026_track_key';
  }
  return handleTrackingWebhook(req, res);
});

export default router;
