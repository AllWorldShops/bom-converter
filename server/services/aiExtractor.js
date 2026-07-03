import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const RETURN_SCHEMA = `{
  "parent": {
    "itemId": "",
    "itemName": "",
    "uom": "",
    "quantity": 1,
    "manufacturerPartNo": ""
  },
  "children": [
    {
      "findNo": "",
      "itemId": "",
      "itemName": "",
      "revision": "",
      "quantity": "",
      "uom": "",
      "manufacturer": "",
      "manufacturerPartNo": ""
    }
  ]
}`

function buildSystemPrompt(customerDescription, uomMappings) {
  const uomJson = JSON.stringify(
    uomMappings.map(m => ({
      customerUOM: m.customerUOM,
      peckoUOM: m.peckoUOM,
      conversionFactor: m.conversionFactor,
    })),
    null,
    2
  )

  return `You are a BOM (Bill of Materials) extraction specialist for Pecko, a wire harness manufacturer.
Your job is to extract structured data from customer BOM files.

Customer Format Instructions:
${customerDescription}

UOM Mapping for this customer:
${uomJson}

Rules:
1. Follow the customer format instructions strictly.
2. Row 1 is always the header. Skip it.
3. Row 2 is the parent/assembly part (the top-level BOM item).
4. Row 3 onwards are child/component parts.
5. Apply UOM conversion using the provided mapping (replace customerUOM with peckoUOM).
6. Return ONLY a valid JSON object — no markdown, no explanation, no code fences.

Return this exact JSON structure:
${RETURN_SCHEMA}

If you cannot confidently extract a field, use an empty string.`
}

function buildUserPrompt(rawText, rows) {
  const dataSection =
    rows.length > 0
      ? `Rows as JSON array:\n${JSON.stringify(rows, null, 2)}`
      : `Raw extracted text:\n${rawText}`

  return `Here is the BOM data extracted from the customer file:\n\n${dataSection}\n\nExtract and return the structured BOM as instructed.`
}

async function callClaude(systemPrompt, userPrompt) {
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 16000,
    // Disable thinking: this is deterministic JSON extraction, and it keeps
    // content[0] a text block (Sonnet 5 defaults thinking ON, which would make
    // content[0] a thinking block and break the parsing below).
    thinking: { type: 'disabled' },
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })
  const block = response.content[0]
  if (!block || block.type !== 'text') {
    throw new Error(`Unexpected Claude response content: ${JSON.stringify(response.content)}`)
  }
  return block.text
}

function stripCodeFences(text) {
  return text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

export async function extractBom(rawText, rows, customer, uomMappings) {
  const systemPrompt = buildSystemPrompt(customer.description, uomMappings)
  const userPrompt = buildUserPrompt(rawText, rows)

  const text = await callClaude(systemPrompt, userPrompt)
  const cleaned = stripCodeFences(text)

  try {
    return JSON.parse(cleaned)
  } catch {
    // Retry once with stricter instruction
    const strictPrompt = `${userPrompt}\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY the raw JSON object. No text before or after. No markdown code fences.`
    const retryText = await callClaude(systemPrompt, strictPrompt)
    const retryCleaned = stripCodeFences(retryText)
    return JSON.parse(retryCleaned) // Let this throw if still invalid
  }
}
