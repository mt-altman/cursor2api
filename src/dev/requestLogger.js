const fs = require('fs').promises
const path = require('path')

async function logRequest(req, timestamp = new Date().toISOString()) {
    const logDir = path.join(__dirname, '../../logs')
    const logFile = path.join(logDir, `requests-${timestamp.split('T')[0]}.log`)

    const logEntry = {
        timestamp,
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
    }

    try {
        await fs.mkdir(logDir, { recursive: true })
        await fs.appendFile(
            logFile,
            JSON.stringify(logEntry, null, 2) + '\n---\n',
            'utf8'
        )
    } catch (err) {
        console.error('Error logging request:', err)
    }
}

module.exports = { logRequest } 