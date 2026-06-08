const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const webhookRouter = require('./routes/webhook');
const voiceRouter = require('./routes/voice');

// Ensure audio folder exists (empty dirs aren't saved by Git)
fs.mkdirSync(path.join(__dirname, 'audio'), { recursive: true });

const app = express();

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve ElevenLabs audio files as static assets
app.use('/audio', express.static(path.join(__dirname, 'audio')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/webhook', webhookRouter);
app.use('/voice', voiceRouter);

// Start server
app.listen(config.port, '0.0.0.0', () => {
  console.log(`Hermes Agent listening on 0.0.0.0:${config.port}`);
});
