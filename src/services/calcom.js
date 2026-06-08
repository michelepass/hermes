const axios = require('axios');
const config = require('../config');

const calApi = axios.create({
  baseURL: 'https://api.cal.com/v2',
  headers: {
    Authorization: `Bearer ${config.calApiKey}`,
    'cal-api-version': '2024-08-13',
    'Content-Type': 'application/json',
  },
});

async function getAvailability(date) {
  const response = await calApi.get('/slots', {
    params: {
      eventTypeId: config.calEventTypeId,
      startDate: date,
      endDate: date,
    },
  });
  return response.data;
}

async function bookAppointment(slot, lead) {
  const attendee = {
    name: lead.name,
    timeZone: config.timezone,
    language: 'en',
    phoneNumber: lead.phone,
  };

  if (lead.email && lead.email.trim() !== '') {
    attendee.email = lead.email;
  }

  const body = {
    eventTypeId: Number(config.calEventTypeId),
    start: slot,
    attendee,
  };

  try {
    const response = await calApi.post('/bookings', body);
    return response.data;
  } catch (err) {
    if (err.response) {
      console.error(`Cal.com booking error: status=${err.response.status} data=${JSON.stringify(err.response.data)}`);
    }
    throw err;
  }
}

module.exports = { getAvailability, bookAppointment };
