import fs from 'fs/promises';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'db.json');

const defaultDb = {
  orders: []
};

let dbLock = false;

async function acquireLock() {
  while (dbLock) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  dbLock = true;
}

function releaseLock() {
  dbLock = false;
}

export async function readDb() {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.writeFile(DB_PATH, JSON.stringify(defaultDb, null, 2));
      return defaultDb;
    }
    throw error;
  }
}

export async function writeDb(data) {
  await acquireLock();
  try {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
  } finally {
    releaseLock();
  }
}

export async function createOrder(orderData) {
  const db = await readDb();
  db.orders.push(orderData);
  await writeDb(db);
  return orderData;
}

export async function updateOrder(orderId, updates) {
  const db = await readDb();
  const index = db.orders.findIndex(o => o.id === orderId);
  if (index !== -1) {
    db.orders[index] = { ...db.orders[index], ...updates };
    await writeDb(db);
    return db.orders[index];
  }
  return null;
}

export async function getOrders() {
  const db = await readDb();
  return db.orders;
}

export async function getOrder(orderId) {
  const db = await readDb();
  return db.orders.find(o => o.id === orderId);
}

export async function findOrderByAwbOrId(identifier) {
  if (!identifier) return null;
  const db = await readDb();
  const idStr = String(identifier).trim();
  return db.orders.find(o => 
    (o.awb_code && String(o.awb_code).trim() === idStr) ||
    (o.id && String(o.id).trim() === idStr) ||
    (o.shiprocket_order_id && String(o.shiprocket_order_id).trim() === idStr) ||
    (o.shipment_id && String(o.shipment_id).trim() === idStr)
  );
}

export async function updateOrderByAwbOrId(identifier, updates) {
  if (!identifier) return null;
  const db = await readDb();
  const idStr = String(identifier).trim();
  const index = db.orders.findIndex(o => 
    (o.awb_code && String(o.awb_code).trim() === idStr) ||
    (o.id && String(o.id).trim() === idStr) ||
    (o.shiprocket_order_id && String(o.shiprocket_order_id).trim() === idStr) ||
    (o.shipment_id && String(o.shipment_id).trim() === idStr)
  );
  if (index !== -1) {
    db.orders[index] = { ...db.orders[index], ...updates };
    await writeDb(db);
    return db.orders[index];
  }
  return null;
}

export async function recordWebhookEvent(event) {
  const db = await readDb();
  if (!db.webhook_logs) {
    db.webhook_logs = [];
  }
  const logEntry = {
    id: `wh_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    receivedAt: new Date().toISOString(),
    ...event
  };
  db.webhook_logs.unshift(logEntry);
  if (db.webhook_logs.length > 50) {
    db.webhook_logs = db.webhook_logs.slice(0, 50);
  }
  await writeDb(db);
  return logEntry;
}

export async function getWebhookLogs() {
  const db = await readDb();
  return db.webhook_logs || [];
}
