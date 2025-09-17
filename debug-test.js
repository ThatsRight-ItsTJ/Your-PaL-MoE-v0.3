const http = require('http'); // Changed from https to http

// Test both keys
const keys = [
    'sk-sampleuserkey1234567890abcdefghijklmnop',
    'sk-adminuserkey9876543210fedcbabcdefghijklm'
];

keys.forEach(key => {
    const postData = JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello, how are you?' }]
    });

    const options = {
        hostname: 'localhost',
        port: 2715,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const req = http.request(options, (res) => {
        console.log(`\nTesting key: ${key}`);
        console.log(`Status: ${res.statusCode}`);
        
        let rawData = '';
        res.on('data', (chunk) => {
            rawData += chunk;
        });
        
        res.on('end', () => {
            try {
                const parsedData = JSON.parse(rawData);
                console.log('Response:', JSON.stringify(parsedData, null, 2));
            } catch (e) {
                console.log('Raw response:', rawData);
            }
        });
    });

    req.on('error', (e) => {
        console.error(`Problem with request: ${e.message}`);
    });

    req.write(postData);
    req.end();
});