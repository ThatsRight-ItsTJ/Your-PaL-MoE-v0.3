const request = require('supertest');
const app = require('../../index');

describe('API Integration Tests', () => {
    describe('GET /providers', () => {
        test('should return list of providers', async () => {
            const response = await request(app)
                .get('/providers')
                .expect(200);
            
            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data)).toBe(true);
        });
        
        test('should filter providers by query parameters', async () => {
            const response = await request(app)
                .get('/providers?available=true')
                .expect(200);
            
            expect(response.body.success).toBe(true);
            expect(response.body.data.every(p => p.available)).toBe(true);
        });
    });
    
    describe('GET /providers/:name', () => {
        test('should return specific provider', async () => {
            const response = await request(app)
                .get('/providers/OpenAI')
                .expect(200);
            
            expect(response.body.success).toBe(true);
            expect(response.body.data.name).toBe('OpenAI');
        });
        
        test('should return 404 for non-existent provider', async () => {
            const response = await request(app)
                .get('/providers/NonExistent')
                .expect(404);
            
            expect(response.body.success).toBe(false);
        });
    });
    
    describe('POST /chat', () => {
        test('should require authentication', async () => {
            const response = await request(app)
                .post('/chat')
                .send({ message: 'Hello' })
                .expect(401);
            
            expect(response.body.success).toBe(false);
        });
        
        test('should validate input', async () => {
            const response = await request(app)
                .post('/chat')
                .set('x-api-key', 'test-key')
                .send({})
                .expect(400);
            
            expect(response.body.success).toBe(false);
        });
    });
    
    describe('Rate Limiting', () => {
        test('should enforce rate limits', async () => {
            const promises = [];
            
            // Make multiple requests quickly
            for (let i = 0; i < 10; i++) {
                promises.push(
                    request(app)
                        .get('/providers')
                        .set('x-forwarded-for', '127.0.0.1')
                );
            }
            
            const responses = await Promise.all(promises);
            const rateLimited = responses.some(r => r.status === 429);
            
            expect(rateLimited).toBe(true);
        });
    });
});