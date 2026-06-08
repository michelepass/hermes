const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');

const client = new Anthropic({ apiKey: config.anthropicApiKey });

async function scoreLead(lead) {
  const prompt = `You are a lead qualification expert for a home inspection business.
Analyze this lead and return a JSON object with these fields:
- score: number 1-10 (10 = highest quality)
- tier: "Hot" (8-10), "Warm" (5-7), or "Cold" (1-4) based on score
- urgency: string describing how urgent this is
- estJobValue: estimated dollar value of the job as a number
- keySignals: array of strings with key signals you noticed
- followUpNote: string with recommended follow-up action

Lead information:
- Name: ${lead.name}
- Email: ${lead.email || 'Not provided'}
- Phone: ${lead.phone || 'Not provided'}
- Service Needed: ${lead.serviceNeeded || 'Not specified'}
- Problem Description: ${lead.problem || 'Not provided'}

Return ONLY valid JSON, no markdown fences or extra text.`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].text.trim();
  const result = JSON.parse(text);
  return result;
}

module.exports = { scoreLead };
