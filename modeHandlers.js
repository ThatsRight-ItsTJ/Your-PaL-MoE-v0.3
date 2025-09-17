const axios = require('axios');

// Helper: send request with timeout & error handling
async function sendProviderRequest(req, timeoutMs = 15000) {
  try {
    const res = await axios.post(req.href, req.data, { timeout: timeoutMs });
    return { success: true, model: req.data.model, output: res.data };
  } catch (err) {
    return { success: false, model: req.data.model, error: err.message };
  }
}

// 1. Council Mode
// - Run all requests in parallel
// - Return all outputs separately
async function councilMode(requests) {
  const results = await Promise.all(requests.map(r => sendProviderRequest(r)));
  return { merged: false, results };
}

// 2. Collaborate Mode
// - Run all requests in parallel
// - Merge outputs into a single unified answer
async function collaborateMode(requests) {
  const results = await Promise.all(requests.map(r => sendProviderRequest(r)));
  const successful = results.filter(r => r.success);
  if (successful.length === 0) return { merged: true, mergedText: '', results };

  // Simple merge: concatenate outputs
  const mergedText = successful
    .map(r => r.output.choices?.[0]?.message?.content || '')
    .join('\n---\n');

  return { merged: true, mergedText, results };
}

// 3. Race Mode
// - Run all requests in parallel
// - Return the first successful response
async function raceMode(requests) {
  return new Promise((resolve) => {
    let resolved = false;
    requests.forEach(req => {
      sendProviderRequest(req).then(result => {
        if (!resolved && result.success) {
          resolved = true;
          resolve({ merged: false, results: [result] });
        }
      });
    });
    // Safety: resolve empty if none succeed in time
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ merged: false, results: [] });
      }
    }, 16000);
  });
}

// 4. MetaJudge Mode
// - Run all requests in parallel to get candidate outputs
// - Send those outputs to a "judge" model to pick the best
async function metaJudgeMode(requests, judgeModel = 'gpt-4') {
  const results = await Promise.all(requests.map(r => sendProviderRequest(r)));
  const successful = results.filter(r => r.success);
  if (successful.length === 0) return { merged: true, judgeOutput: null, candidates: [] };

  const judgePrompt = `
Given the following outputs from different models, choose the best one and explain why.

${successful.map((r, i) => `Model ${i + 1} (${r.model}):\n${r.output.choices?.[0]?.message?.content}`).join('\n\n')}
`;

  const judgeReq = {
    href: '/v1/chat/completions',
    data: {
      model: judgeModel,
      messages: [
        { role: 'system', content: 'You are a fair and critical evaluator.' },
        { role: 'user', content: judgePrompt }
      ]
    }
  };

  const judgeResult = await sendProviderRequest(judgeReq);
  return { merged: true, judgeOutput: judgeResult, candidates: successful };
}

// 5. Discuss Mode (Sequential refinement)
// - Run requests sequentially, each refining the previous output
async function discussMode(requests) {
  let context = null;
  const results = [];

  for (const req of requests) {
    const messages = [...req.data.messages];
    if (context) {
      messages.push({ role: 'user', content: `Refine the following:\n${context}` });
    }
    const updatedReq = { ...req, data: { ...req.data, messages } };
    const result = await sendProviderRequest(updatedReq);
    results.push(result);
    if (result.success) {
      context = result.output.choices?.[0]?.message?.content || context;
    }
  }

  return { merged: true, mergedText: context || '', results };
}

// 6. Fallback Mode
// - Try providers in order until one succeeds
async function fallbackMode(requests) {
  for (const req of requests) {
    const result = await sendProviderRequest(req);
    if (result.success) {
      return { merged: false, results: [result] };
    }
  }
  return { merged: false, results: [] };
}

// Mode Registry - maps mode names to handler functions
const modeHandlers = {
  Council: councilMode,
  Collaborate: collaborateMode,
  Race: raceMode,
  MetaJudge: metaJudgeMode,
  Discuss: discussMode,
  Fallback: fallbackMode
};

module.exports = modeHandlers;