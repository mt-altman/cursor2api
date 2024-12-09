const fs = require('fs').promises
const path = require('path')

async function logResponse(response) {
    const logDir = path.join(__dirname, '../../logs')
    const logFile = path.join(logDir, `responses-${new Date().toISOString().split('T')[0]}.log`)

    const logEntry = {
        timestamp: new Date().toISOString(),
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers),
        ok: response.ok
    }

    try {
        await fs.mkdir(logDir, { recursive: true })
        await fs.appendFile(
            logFile,
            JSON.stringify(logEntry, null, 2) + '\n---\n',
            'utf8'
        )
    } catch (err) {
        console.error('Error logging response:', err)
    }
}

module.exports = { logResponse } 