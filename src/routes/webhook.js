const express = require('express');
const { scoreLead } = require('../services/leadScorer');
const { placeOutboundCall } = require('../services/twilioCall');
const { logLead } = require('../services/googleSheets');

const router = express.Router();

// In-memory store for lead data keyed by phone number (used by voice routes)
const leadStore = {};

router.post('/typeform', async (req, res) => {
  const payload = req.body;
  const answers = payload.form_response?.answers || [];
  const hidden = payload.form_response?.hidden || {};

  // Extract fields from Typeform answers or hidden fields
  const lead = {
    name: extractField(answers, 'name', hidden),
    phone: extractField(answers, 'phone', hidden),
    email: extractField(answers, 'email', hidden),
    serviceNeeded: extractField(answers, 'serviceNeeded', hidden) || extractField(answers, 'service_needed', hidden),
    problem: extractField(answers, 'problem', hidden),
  };

  console.log(`New lead received: ${lead.name} (${lead.phone})`);

  let scoring = { score: 0, tier: 'Cold', urgency: 'Unknown', estJobValue: 0, keySignals: [], followUpNote: '' };
  let callMade = 'No';

  // Score the lead with Claude
  try {
    scoring = await scoreLead(lead);
    console.log(`Lead scored: ${lead.name} -> ${scoring.tier} (${scoring.score}/10)`);
  } catch (scoreErr) {
    console.error('Lead scoring failed:', scoreErr.message);
  }

  // If Hot or Warm and phone exists, place outbound call
  if ((scoring.tier === 'Hot' || scoring.tier === 'Warm') && lead.phone) {
    try {
      leadStore[lead.phone] = { ...lead, scoring };
      await placeOutboundCall(lead.phone);
      callMade = 'Yes';
    } catch (callErr) {
      console.error('Failed to place outbound call:', callErr.message);
    }
  }

  // Always log to Google Sheets, even if scoring or calling failed
  try {
    await logLead({
      timestamp: new Date().toISOString(),
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      serviceNeeded: lead.serviceNeeded,
      leadScore: scoring.score,
      tier: scoring.tier,
      urgency: scoring.urgency,
      estJobValue: scoring.estJobValue,
      callMade,
      ownerAlerted: 'No',
      keySignals: scoring.keySignals,
      followUpNote: scoring.followUpNote,
      problemDescription: lead.problem,
      inspectionBooked: 'No',
    });
  } catch (sheetErr) {
    console.error('Failed to log to Google Sheets:', sheetErr.message);
  }

  res.status(200).json({ success: true, scoring });
});

function extractField(answers, fieldName, hidden) {
  // Check hidden fields first
  if (hidden[fieldName]) return hidden[fieldName];

  // Search through answers by field ref or type
  for (const answer of answers) {
    const ref = answer.field?.ref || '';
    if (ref.toLowerCase().includes(fieldName.toLowerCase())) {
      return answer.text || answer.email || answer.phone_number || answer.number || '';
    }
  }
  return '';
}

module.exports = router;
module.exports.leadStore = leadStore;
