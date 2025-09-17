const http = require('http');

// Test without auth first
const options1 = {
    hostname: 'localhost',
    port: 2715,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
};

const postData1 = JSON.stringify({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello, how are you?' }]
});

console.log('Testing without authentication...');
const req1 = http.request(options1, (res) => {
    console.log(`Status: ${res.statusCode}`);
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('Response:', data);
        
        // Test with admin key
        const options2 = {
            ...options1,
            headers: {
                ...options1.headers,
                'Authorization': 'Bearer sk-adminuserkey9876543210fedcbabcdefghijklm'
            }
        };
        
        console.log('\nTesting with admin key...');
        const req2 = http.request(options2, (res2) => {
            console.log(`Status: ${res2.statusCode}`);
            let data2 = '';
            res2.on('data', chunk => data2 += chunk);
            res2.on('end', () => {
                console.log('Response:', data2);
            });
        });
        
        req2.write(postData1);
        req2.end();
    });
});

req1.write(postData1);
req1.end();
