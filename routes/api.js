import express from 'express';
import axios from 'axios';
import config from '../config.js';
import { createOrder, getOrders, getOrder, updateOrder } from '../db.js';
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
      return res.json({
        success: true,
        couriers: [
          { courier_company_id: 1, courier_name: "Blue Dart Express", rate: 78.0, etd: "1-2 Days", cod: false },
          { courier_company_id: 2, courier_name: "Delhivery Surface", rate: 48.0, etd: "3-4 Days", cod: true },
          { courier_company_id: 3, courier_name: "Shadowfox", rate: 45.0, etd: "2-3 Days", cod: true }
        ]
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
        courier_company_id: c.courier_company_id,
        courier_name: c.courier_name,
        rate: c.rate,
        etd: c.etd,
        cod: c.cod === 1
      }));
      return res.json({ success: true, couriers });
    } else {
      return res.json({ success: true, couriers: [] });
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
        payment_method: "Prepaid",
        sub_total: orderData.totalAmount,
        length: orderData.package.length,
        breadth: orderData.package.breadth,
        height: orderData.package.height,
        weight: orderData.package.weight
      };

      const response = await axios.post('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', shiprocketPayload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data && response.data.order_id) {
        orderData.shiprocket_order_id = response.data.order_id;
        orderData.shipment_id = response.data.shipment_id;
      }
    } else {
      orderData.shiprocket_order_id = `SR-${Math.floor(100000 + Math.random() * 900000)}`;
      orderData.shipment_id = `SH-${Math.floor(10000 + Math.random() * 90000)}`;
    }

    const savedOrder = await createOrder(orderData);
    res.json({ success: true, order: savedOrder });
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

export default router;
