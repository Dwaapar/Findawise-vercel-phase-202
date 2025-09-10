import express from 'express';
import path from 'path';

const app = express();
const port = process.env.PORT || 5000;

// Basic middleware
app.use(express.json());
app.use(express.static('dist'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', port: port });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${port}`);
});

export default app;