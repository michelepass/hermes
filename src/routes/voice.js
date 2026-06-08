const express = require('express');
const { textToSpeech } = require('../services/elevenLabs');
const { getAvailability, bookAppointment } = require('../services/calcom');
const { logLead } = require('../services/googleSheets');
const { leadStore } = require('./webhook');
const config = require('../config');

const router = express.Router();

// In-memory store for call session data keyed by CallSid
const callSessions = {};

function getLeadByPhone(callTo) {
  for (const [phone, data] of Object.entries(leadStore)) {
    if (callTo && callTo.includes(phone.replace(/\D/g, ''))) {
      return data;
    }
  }
  return null;
}

async function buildResponse(text, gatherAction, gatherTimeout) {
  let twiml = '<?xml version="1.0" encoding="UTF-8"?><Response>';

  if (gatherAction) {
    twiml += `<Gather input="speech" action="${gatherAction}" method="POST" timeout="${gatherTimeout || 5}" speechTimeout="auto">`;
  }

  try {
    const audioUrl = await textToSpeech(text);
    twiml += `<Play>${audioUrl}</Play>`;
  } catch (err) {
    console.error('ElevenLabs failed, falling back to <Say>:', err.message);
    twiml += `<Say voice="alice">${escapeXml(text)}</Say>`;
  }

  if (gatherAction) {
    twiml += '</Gather>';
    twiml += `<Say voice="alice">Sorry, I didn't catch that. Please try again.</Say>`;
    twiml += `<Redirect>${gatherAction}</Redirect>`;
  }

  twiml += '</Response>';
  return twiml;
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Safely log a lead to Sheets — never throws
async function safeLogLead(data) {
  try {
    await logLead(data);
  } catch (err) {
    console.error('Failed to log lead to Google Sheets during call:', err.message);
  }
}

// Step 1: Greet and ask about their problem
router.post('/start', async (req, res) => {
  try {
    const callSid = req.body.CallSid;
    const to = req.body.To;
    const lead = getLeadByPhone(to);

    callSessions[callSid] = { lead: lead || {}, step: 'start' };

    const name = lead?.name || 'there';
    const text = `Hi ${name}, this is Hermes from Home Inspection Pros. Thank you for reaching out to us! Can you tell me a bit more about the issue or the inspection you need help with?`;

    res.type('text/xml');
    res.send(await buildResponse(text, `${config.serverUrl}/voice/problem`));
  } catch (err) {
    console.error('Error in /voice/start:', err.message);
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">We are experiencing a technical issue. A team member will follow up with you shortly. Goodbye.</Say></Response>');
  }
});

// Step 2: Store problem, ask about scheduling
router.post('/problem', async (req, res) => {
  try {
    const callSid = req.body.CallSid;
    const speechResult = req.body.SpeechResult || '';

    if (callSessions[callSid]) {
      callSessions[callSid].problem = speechResult;
    }

    const text = `Got it, I understand. We'd love to get an inspector out to you as soon as possible. What day and time work best for you?`;

    res.type('text/xml');
    res.send(await buildResponse(text, `${config.serverUrl}/voice/schedule`));
  } catch (err) {
    console.error('Error in /voice/problem:', err.message);
    const session = callSessions[req.body.CallSid];
    await safeLogLead({
      timestamp: new Date().toISOString(),
      name: session?.lead?.name || '',
      phone: session?.lead?.phone || '',
      email: session?.lead?.email || '',
      serviceNeeded: session?.lead?.serviceNeeded || '',
      leadScore: session?.lead?.scoring?.score || '',
      tier: session?.lead?.scoring?.tier || '',
      urgency: session?.lead?.scoring?.urgency || '',
      estJobValue: session?.lead?.scoring?.estJobValue || '',
      callMade: 'Yes',
      ownerAlerted: 'No',
      keySignals: session?.lead?.scoring?.keySignals || '',
      followUpNote: 'Call failed during problem step',
      problemDescription: session?.problem || '',
      inspectionBooked: 'No',
    });
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">We are experiencing a technical issue. A team member will follow up with you shortly. Goodbye.</Say></Response>');
  }
});

// Step 3: Check Cal.com availability and offer a slot
router.post('/schedule', async (req, res) => {
  try {
    const callSid = req.body.CallSid;
    const speechResult = req.body.SpeechResult || '';

    if (callSessions[callSid]) {
      callSessions[callSid].preferredTime = speechResult;
    }

    const now = new Date();
    let slotFound = null;

    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(now);
      checkDate.setDate(checkDate.getDate() + i);
      const dateStr = checkDate.toISOString().split('T')[0];

      try {
        const availability = await getAvailability(dateStr);
        const slots = availability?.[dateStr] || availability?.data?.slots?.[dateStr] || availability?.slots?.[dateStr] || [];

        if (slots.length > 0) {
          slotFound = slots[0].start || slots[0].time || slots[0];
          break;
        }
      } catch (err) {
        console.error(`Error checking availability for ${dateStr}:`, err.message);
      }
    }

    if (slotFound) {
      const slotTime = new Date(slotFound);
      const formatted = slotTime.toLocaleString('en-US', {
        timeZone: config.timezone,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });

      if (callSessions[callSid]) {
        callSessions[callSid].offeredSlot = slotFound;
      }

      const text = `The earliest available slot I have is ${formatted}. Would you like me to book that for you? Just say yes or no.`;
      res.type('text/xml');
      res.send(await buildResponse(text, `${config.serverUrl}/voice/confirm`));
    } else {
      // No availability — end call gracefully, still log the lead
      const session = callSessions[callSid];
      await safeLogLead({
        timestamp: new Date().toISOString(),
        name: session?.lead?.name || '',
        phone: session?.lead?.phone || '',
        email: session?.lead?.email || '',
        serviceNeeded: session?.lead?.serviceNeeded || '',
        leadScore: session?.lead?.scoring?.score || '',
        tier: session?.lead?.scoring?.tier || '',
        urgency: session?.lead?.scoring?.urgency || '',
        estJobValue: session?.lead?.scoring?.estJobValue || '',
        callMade: 'Yes',
        ownerAlerted: 'No',
        keySignals: session?.lead?.scoring?.keySignals || '',
        followUpNote: 'No Cal.com availability found — needs manual follow-up',
        problemDescription: session?.problem || '',
        inspectionBooked: 'No',
      });

      const text = `I'm sorry, I wasn't able to find any available slots right now. One of our team members will follow up with you shortly to find a time that works. Thank you for your patience!`;
      res.type('text/xml');
      res.send(await buildResponse(text));
      delete callSessions[callSid];
    }
  } catch (err) {
    console.error('Error in /voice/schedule:', err.message);
    const session = callSessions[req.body.CallSid];
    await safeLogLead({
      timestamp: new Date().toISOString(),
      name: session?.lead?.name || '',
      phone: session?.lead?.phone || '',
      email: session?.lead?.email || '',
      serviceNeeded: session?.lead?.serviceNeeded || '',
      leadScore: session?.lead?.scoring?.score || '',
      tier: session?.lead?.scoring?.tier || '',
      urgency: session?.lead?.scoring?.urgency || '',
      estJobValue: session?.lead?.scoring?.estJobValue || '',
      callMade: 'Yes',
      ownerAlerted: 'No',
      keySignals: session?.lead?.scoring?.keySignals || '',
      followUpNote: 'Call failed during schedule step',
      problemDescription: session?.problem || '',
      inspectionBooked: 'No',
    });
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">We are experiencing a technical issue. A team member will follow up with you shortly. Goodbye.</Say></Response>');
  }
});

// Step 4: Book the appointment and confirm
router.post('/confirm', async (req, res) => {
  const callSid = req.body.CallSid;
  const speechResult = (req.body.SpeechResult || '').toLowerCase();
  const session = callSessions[callSid];

  try {
    if (speechResult.includes('yes') && session?.offeredSlot) {
      const lead = session.lead || {};

      try {
        await bookAppointment(session.offeredSlot, lead);

        const slotTime = new Date(session.offeredSlot);
        const formatted = slotTime.toLocaleString('en-US', {
          timeZone: config.timezone,
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });

        // Log booked inspection
        await safeLogLead({
          timestamp: new Date().toISOString(),
          name: lead.name || '',
          phone: lead.phone || '',
          email: lead.email || '',
          serviceNeeded: lead.serviceNeeded || '',
          leadScore: lead.scoring?.score || '',
          tier: lead.scoring?.tier || '',
          urgency: lead.scoring?.urgency || '',
          estJobValue: lead.scoring?.estJobValue || '',
          callMade: 'Yes',
          ownerAlerted: 'No',
          keySignals: lead.scoring?.keySignals || '',
          followUpNote: `Booked for ${formatted}`,
          problemDescription: session.problem || '',
          inspectionBooked: 'Yes',
        });

        const text = `You're all set! Your inspection is booked for ${formatted}. Our inspector will be there on time. If you need to reschedule, just give us a call. Have a great day!`;
        res.type('text/xml');
        res.send(await buildResponse(text));
      } catch (bookErr) {
        console.error('Booking failed:', bookErr.message);

        await safeLogLead({
          timestamp: new Date().toISOString(),
          name: lead.name || '',
          phone: lead.phone || '',
          email: lead.email || '',
          serviceNeeded: lead.serviceNeeded || '',
          leadScore: lead.scoring?.score || '',
          tier: lead.scoring?.tier || '',
          urgency: lead.scoring?.urgency || '',
          estJobValue: lead.scoring?.estJobValue || '',
          callMade: 'Yes',
          ownerAlerted: 'No',
          keySignals: lead.scoring?.keySignals || '',
          followUpNote: 'Booking failed — needs manual follow-up',
          problemDescription: session.problem || '',
          inspectionBooked: 'No',
        });

        const text = `I'm sorry, there was an issue booking that slot. One of our team members will call you back shortly to get you scheduled. Thank you for your patience!`;
        res.type('text/xml');
        res.send(await buildResponse(text));
      }
    } else {
      const text = `No problem at all. One of our team members will follow up with you to find a better time. Thank you for your time, and have a wonderful day!`;
      res.type('text/xml');
      res.send(await buildResponse(text));
    }
  } catch (err) {
    console.error('Error in /voice/confirm:', err.message);
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">We are experiencing a technical issue. A team member will follow up with you shortly. Goodbye.</Say></Response>');
  }

  delete callSessions[callSid];
});

// Twilio status callback
router.post('/status', (req, res) => {
  const { CallSid, CallStatus, To } = req.body;
  console.log(`Call status update: SID=${CallSid} status=${CallStatus} to=${To}`);
  res.sendStatus(200);
});

module.exports = router;
