// test-chat.js
import fetch from 'node-fetch';

// For sample user
const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sk-sampleuserkey1234567890abcdefghijklmnop'
};

const data = {
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello, how are you?' }]
};

fetch('http://localhost:2715/v1/chat/completions', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(data)
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));
