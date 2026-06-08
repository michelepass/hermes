const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

const audioDir = path.join(__dirname, '..', 'audio');

async function textToSpeech(text) {
  const filename = `speech_${crypto.randomBytes(8).toString('hex')}.mp3`;
  const filepath = path.join(audioDir, filename);

  const response = await axios({
    method: 'POST',
    url: `https://api.elevenlabs.io/v1/text-to-speech/${config.elevenLabsVoiceId}`,
    headers: {
      'xi-api-key': config.elevenLabsApiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    data: {
      text,
      model_id: 'eleven_turbo_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    },
    responseType: 'arraybuffer',
    timeout: 10000,
  });

  fs.writeFileSync(filepath, response.data);
  const audioUrl = `${config.serverUrl}/audio/${filename}`;
  return audioUrl;
}

module.exports = { textToSpeech };
