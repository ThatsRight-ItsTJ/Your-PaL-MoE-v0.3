const url = 'https://api.imagerouter.io/v1/openai/images/generations';
const options = {
  method: 'POST',
  headers: {Authorization: 'Bearer YOUR_API_KEY', 'Content-Type': 'application/json'},
  body: '{"prompt": "YOUR_PROMPT", "model": "test/test"}'
};

const response = await fetch(url, options);
const data = await response.json();
console.log(data);