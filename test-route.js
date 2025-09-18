const express = require('express');
const app = express();
app.use(express.json());

// Test route handler
app.post('/v1/chat/completions', authenticateRequest, async (req, res) => {
  console.log('[DEBUG] Route handler triggered for:', req.path);
  console.log('[DEBUG] req.path value:', req.path);
  
  try {
    res.json({ 
      success: true, 
      message: 'Route handler working correctly',
      path: req.path 
    });
  } catch (error) {
    console.log('[ERROR] Route handler error:', error.message);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

function authenticateRequest(req, res, next) {
  console.log('[DEBUG] Authentication middleware called');
  next();
}

const PORT = 2716;
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
});
