const express = require('express');
const { scoreLead } = require('../services/leadScorer');
const { placeOutboundCall } = require('../services/twilioCall');
const { logLead } = require('../services/googleSheets');

const router = express.Router();

// In-memory store for lead data keyed by phone number (used by voice routes)
const leadStore = {};

router.post('/typeform', async (req, res) => {
  console.log('RAW TYPEFORM:', JSON.stringify(req.body.form_response, null, 2));
  const payload = req.body;
  const answers = payload.form_response?.answers || [];
  const hidden = payload.form_response?.hidden || {};

  // Build a map of field id → title from definition.fields
  const fields = payload.form_response?.definition?.fields || [];
  const titleMap = {};
  for (const f of fields) {
    titleMap[f.id] = (f.title || '').toLowerCase();
  }

  // Extract fields from Typeform answers using the title map
  const mapped = { name: '', phone: '', email: '', serviceNeeded: '', problem: '', location: '', urgency: '' };

  for (const answer of answers) {
    const title = titleMap[answer.field?.id] || '';
    const type = answer.type;

    if (title.includes('name') && type === 'text') {
      mapped.name = answer.text || '';
    } else if (type === 'email') {
      mapped.email = answer.email || '';
    } else if (type === 'phone_number') {
      mapped.phone = answer.phone_number || '';
    } else if (title.includes('service')) {
      mapped.serviceNeeded = answer.text || answer.choice?.label || '';
    } else if (title.includes('describe') || title.includes('issue') || title.includes('problem')) {
      mapped.problem = answer.text || '';
    } else if (title.includes('located') || title.includes('location')) {
      mapped.location = answer.text || '';
    } else if (type === 'choice' && title.includes('when')) {
      mapped.urgency = answer.choice?.label || '';
    }
  }

  const lead = {
    name: hidden.name || mapped.name,
    phone: hidden.phone || mapped.phone,
    email: hidden.email || mapped.email,
    serviceNeeded: hidden.serviceNeeded || hidden.service_needed || mapped.serviceNeeded,
    problem: hidden.problem || mapped.problem,
    location: mapped.location,
    urgency: mapped.urgency,
  };

  console.log(`New lead received: ${lead.name} (${lead.phone}) — problem: ${lead.problem}`);

  let scoring = { score: 0, tier: 'Cold', urgency: 'Unknown', estJobValue: 0, keySignals: [], followUpNote: '' };
  let callMade = 'No';

  // Score the lead with Claude
  try {
    scoring = await scoreLead(lead);
    console.log(`Lead scored: ${lead.name} -> ${scoring.tier} (${scoring.score}/10)`);
  } catch (scoreErr) {
    console.error('Lead scoring failed:', scoreErr.message);
  }

  // Place outbound call if phone exists
  if (lead.phone) {
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


module.exports = router;
module.exports.leadStore = leadStore;
