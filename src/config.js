const config = {
  port: process.env.PORT || 3000,
  serverUrl: process.env.SERVER_URL,

  // Anthropic
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,

  // Twilio
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,

  // ElevenLabs
  elevenLabsApiKey: process.env.ELEVEN_API_KEY,
  elevenLabsVoiceId: process.env.ELEVEN_VOICE_ID,

  // Cal.com
  calApiKey: process.env.CAL_API_KEY,
  calUsername: process.env.CAL_USERNAME,
  calEventTypeId: Number(process.env.CAL_EVENT_TYPE_ID),

  // Google Sheets
  googleSheetId: process.env.GOOGLE_SHEET_ID,
  googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  googlePrivateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),

  // Typeform
  typeformSecret: process.env.TYPEFORM_SECRET,

  // Owner
  ownerPhoneNumber: process.env.OWNER_PHONE_NUMBER,

  // Timezone
  timezone: process.env.TIMEZONE || 'America/New_York',
};

module.exports = config;
