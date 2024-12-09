// 测试数据
module.exports = {
    // 正常响应场景
    normalResponse: Buffer.from([
        0x00, 0x00, 0x00, 0x00, 0x0A, // 头部
        // 正常的 markdown 文本响应
        0x43, 0x61, 0x74, 0x47, 0x50, 0x54, 0x20, 0x77, 0x6F, 0x72, 0x6B, 0x73, 0x20, 0x6C, 0x69, 0x6B, 0x65, 0x20, 0x74, 0x68, 0x69, 0x73, 0x3A, 0x0A, 0x0A,
        // ### 基本步骤
        0x23, 0x23, 0x23, 0x20, 0xE5, 0x9F, 0xBA, 0xE6, 0x9C, 0xAC, 0xE6, 0xAD, 0xA5, 0xE9, 0xAA, 0xA4, 0x0A, 0x0A,
        // 1. **预训练**:
        0x31, 0x2E, 0x20, 0x2A, 0x2A, 0xE9, 0xA2, 0x84, 0xE8, 0xAE, 0xAD, 0xE7, 0xBB, 0x83, 0x2A, 0x2A, 0x3A, 0x0A
    ]),

    // JSON 格式的正常响应
    jsonResponse: Buffer.from(JSON.stringify({
        id: "chatcmpl-123",
        object: "chat.completion",
        created: 1677858242,
        model: "gpt-3.5-turbo-0613",
        choices: [{
            index: 0,
            message: {
                role: "assistant",
                content: "Here's how markdown works:\n\n### Headers\n\n# H1\n## H2\n### H3\n\n### Lists\n\n- Item 1\n- Item 2"
            },
            finish_reason: "stop"
        }]
    })),

    // 错误响应场景
    errorResponse: Buffer.from(JSON.stringify({
        error: {
            message: "Invalid API key",
            type: "invalid_request_error",
            code: "invalid_api_key"
        }
    })),

    // HTML 错误响应
    htmlErrorResponse: Buffer.from(`
        <html>
        <head><title>502 Bad Gateway</title></head>
        <body>
        <center><h1>502 Bad Gateway</h1></center>
        </body>
        </html>
    `),

    // 包含特殊字符的响应
    specialCharsResponse: Buffer.from([
        0x00, 0x00, // 头部
        // 包含特殊字符和控制字符的文本
        0x46, 0x44, 0x39, 0x78, 0x2E, 0x24, 0x68, 0x51, // FD9x.$hQ
        // 正常的 markdown 文本
        0x23, 0x23, 0x23, 0x20, 0xE6, 0xB5, 0x8B, 0xE8, 0xAF, 0x95 // ### 测试
    ])
} 