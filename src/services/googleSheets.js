const { google } = require('googleapis');
const config = require('../config');

let sheets;

function getClient() {
  if (sheets) return sheets;

  const auth = new google.auth.JWT(
    config.googleServiceAccountEmail,
    null,
    config.googlePrivateKey,
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  sheets = google.sheets({ version: 'v4', auth });
  return sheets;
}

async function logLead(data) {
  const client = getClient();

  const row = [
    data.timestamp || new Date().toISOString(),
    data.name || '',
    data.phone || '',
    data.email || '',
    data.serviceNeeded || '',
    data.leadScore || '',
    data.tier || '',
    data.urgency || '',
    data.estJobValue || '',
    data.callMade || 'No',
    data.ownerAlerted || 'No',
    Array.isArray(data.keySignals) ? data.keySignals.join(', ') : (data.keySignals || ''),
    data.followUpNote || '',
    data.problemDescription || '',
    data.inspectionBooked || 'No',
  ];

  await client.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: 'Sheet1!A:O',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });

  console.log(`Lead logged to Google Sheets: ${data.name}`);
}

module.exports = { logLead };
