import express from 'express';
import cors from 'cors';
import config from './config.js';
import apiRoutes from './routes/api.js';

const app = express();
const PORT = config.port || 5001;

app.use(cors());
app.use(express.json());

// Mount API routes
app.use('/api', apiRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', mode: config.demoMode ? 'DEMO' : 'LIVE' });
});

app.listen(PORT, () => {
  console.log(`Backend Server running on port ${PORT}`);
  console.log(`DEMO_MODE is set to: ${config.demoMode}`);
});
