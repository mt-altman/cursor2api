const fs = require('fs')
const path = require('path')

// 创建日志目录
const logDir = path.join(__dirname, '../logs/responses')
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
}

// 模拟响应数据
const mockResponses = [
    // 正常响应
    {
        status: 200,
        headers: {
            'content-type': 'application/json'
        },
        buffer: Buffer.from([
            0x00, 0x00, 0x00, 0x00, 0x0A,  // 头部
            // 正常的 markdown 文本
            ...Buffer.from(`
### 基本概念

1. **预训练**:
- 使用大规模数据
- 学习语言模型
- 掌握基础知识

2. **微调**:
- 特定任务优化
- 提升表现效果
            `).values()
        ]).toString('hex'),
        text: '### 基本概念\n\n1. **预训练**:\n- 使用大规模数据\n- 学习语言模型\n- 掌握基础知识\n\n2. **微调**:\n- 特定任务优化\n- 提升表现效果'
    },

    // JSON 格式响应
    {
        status: 200,
        headers: {
            'content-type': 'application/json'
        },
        text: JSON.stringify({
            id: 'chatcmpl-123',
            object: 'chat.completion',
            created: Date.now(),
            choices: [{
                message: {
                    role: 'assistant',
                    content: '这是一个测试响应'
                }
            }]
        }),
        buffer: Buffer.from('{"choices":[{"message":{"content":"这是一个测试响应"}}]}').toString('hex')
    },

    // 错误响应
    {
        status: 401,
        headers: {
            'content-type': 'application/json'
        },
        text: JSON.stringify({
            error: {
                message: 'Invalid API key',
                type: 'invalid_request_error'
            }
        }),
        buffer: Buffer.from('{"error":{"message":"Invalid API key"}}').toString('hex')
    },

    // HTML 错误响应
    {
        status: 502,
        headers: {
            'content-type': 'text/html'
        },
        text: `
            <html>
            <head><title>502 Bad Gateway</title></head>
            <body>
            <center><h1>502 Bad Gateway</h1></center>
            </body>
            </html>
        `,
        buffer: Buffer.from('<html><head><title>502 Bad Gateway</title></head></html>').toString('hex')
    },

    // 特殊字符响应
    {
        status: 200,
        headers: {
            'content-type': 'text/plain'
        },
        buffer: Buffer.from([
            0x00, 0x00,  // 头部
            ...Buffer.from('FD9x.$hQ ### 测试\n\n- 项目1\n- 项目2').values()
        ]).toString('hex'),
        text: 'FD9x.$hQ ### 测试\n\n- 项目1\n- 项目2'
    }
]

// 生成模拟日志文件
mockResponses.forEach((response, index) => {
    const timestamp = new Date(Date.now() - index * 1000).toISOString().replace(/[:.]/g, '-')
    const filename = path.join(logDir, `response-${timestamp}.log`)
    
    const logData = {
        timestamp,
        ...response
    }
    
    fs.writeFileSync(filename, JSON.stringify(logData, null, 2))
    console.log(`Generated mock response: ${filename}`)
}) 