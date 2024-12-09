const fs = require('fs')
const path = require('path')

function generateTestData() {
    const logDir = path.join(__dirname, '../logs/responses')
    const outputFile = path.join(__dirname, '../test/fixtures/real-responses.js')
    
    // 读取所有日志文件
    const files = fs.readdirSync(logDir).filter(f => f.endsWith('.log'))
    const responses = []

    for (const file of files) {
        const content = fs.readFileSync(path.join(logDir, file), 'utf8')
        try {
            const logData = JSON.parse(content)
            responses.push({
                type: getResponseType(logData),
                buffer: logData.buffer,
                text: logData.text,
                status: logData.status
            })
        } catch (e) {
            console.error(`Error processing ${file}:`, e)
        }
    }

    // 生成测试数据文件
    const testData = `// 自动生成的测试数据
module.exports = {
    ${responses.map((resp, index) => `
    // ${resp.type} response
    response${index + 1}: {
        type: '${resp.type}',
        buffer: Buffer.from('${resp.buffer}', 'hex'),
        status: ${resp.status},
        text: ${JSON.stringify(resp.text)}
    }`).join(',\n')}
}
`
    fs.writeFileSync(outputFile, testData)
    console.log(`Generated test data in ${outputFile}`)
}

function getResponseType(logData) {
    const { status, text } = logData
    
    if (status !== 200) return 'error'
    if (text.includes('{"error":')) return 'jsonError'
    if (text.includes('<html>')) return 'htmlError'
    if (text.includes('"choices":')) return 'normal'
    return 'unknown'
}

generateTestData() 