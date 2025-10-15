const fs = require('fs');
const path = require('path');

class ProviderLoader {
    static async loadProviders(configPath) {
        const filePath = path.resolve(configPath);
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const providers = this.parseCSV(fileContent);

        return providers;
    }

    static parseCSV(csvData) {
        const rows = csvData.split('\n').map(row => row.trim()).filter(Boolean);
        const headers = rows[0].split(',');
        const providers = [];

        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].split(',').map(cell => cell.trim());
            const provider = {};

            for (let j = 0; j < headers.length; j++) {
                provider[headers[j]] = cells[j];
            }

            providers.push(provider);
        }

        return providers;
    }
}

module.exports = ProviderLoader;