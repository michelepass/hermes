const twilio = require('twilio');
const config = require('../config');

const client = twilio(config.twilioAccountSid, config.twilioAuthToken);

async function placeOutboundCall(phone) {
  const call = await client.calls.create({
    to: phone,
    from: config.twilioPhoneNumber,
    url: `${config.serverUrl}/voice/start`,
    statusCallback: `${config.serverUrl}/voice/status`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST',
  });

  console.log(`Outbound call placed: SID=${call.sid} to=${phone}`);
  return call;
}

module.exports = { placeOutboundCall };
