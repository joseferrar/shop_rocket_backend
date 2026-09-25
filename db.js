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
