const express = require('express')
const { v4: uuidv4 } = require('uuid')
const { stringToHex, chunkToUtf8String, generateChecksum, generateTelemetryIds } = require('./utils.js')
require('dotenv').config()
const compression = require('compression')
const rateLimit = require('express-rate-limit')
const { logRequest } = require('./dev/requestLogger')
const { CACHE_TTL } = require('./constants')

// 仅在开发环境引入
const responseLogger = process.env.NODE_ENV === 'development' ? 
    require('./dev/responseLogger') : 
    { logResponse: response => response }

const app = express()

// 中间件配置
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))
app.use(compression({
    level: 6,
    threshold: 1024
}))

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('Error:', err)
    res.status(500).json({ error: 'Internal server error' })
})

// 配置常量
const PORT = process.env.PORT || 3000
const MAX_RETRIES = 3
const RETRY_DELAY = 1000
const CURSOR_CHECKSUM = process.env.CURSOR_CHECKSUM || generateChecksum()
const TELEMETRY = {
    macMachineId: process.env.MAC_MACHINE_ID || generateTelemetryIds().macMachineId,
    machineId: process.env.MACHINE_ID || generateTelemetryIds().machineId,
    deviceId: process.env.DEVICE_ID || generateTelemetryIds().deviceId
}

// 添加用户信息遥测参数
const USER_AGENT = 'connect-es/1.4.0'
const CLIENT_VERSION = '0.42.3'
const TIMEZONE = 'Asia/Shanghai'
const GHOST_MODE = 'false'

// 请求缓存
const responseCache = new Map()

// 性能指标
const metrics = {
    requestCount: 0,
    errorCount: 0,
    avgResponseTime: 0,
    lastRequestTime: 0
}

// 速率限制
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
})

// 路由处理
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' })
})

app.get('/metrics', (req, res) => {
    res.json(metrics)
})

app.use('/v1/chat/completions', limiter)

app.post('/v1/chat/completions', async (req, res) => {
    await logRequest(req)
    const startTime = Date.now()
    metrics.requestCount++
    
    try {
        const response = await handleChatRequest(req, res)
        updateMetrics(startTime)
        return response
    } catch (error) {
        metrics.errorCount++
        handleError(error, req, res)
    }
})

// 核心请求处理函数
async function handleChatRequest(req, res) {
    console.log('Handling chat request:', {
        model: req.body.model,
        messageCount: req.body.messages?.length,
        stream: req.body.stream
    })
    
    const { model, messages, stream, authToken } = validateRequest(req)
    console.log('Request validated, auth token:', authToken.substring(0, 20) + '...')
    
    if (!stream) {
        const cached = checkCache(getCacheKey(req))
        if (cached) {
            console.log('Cache hit, returning cached response')
            return res.json(cached)
        }
    }
    
    console.log('Making API request...')
    const response = await makeRequest(req, authToken)
    console.log('API response received:', {
        status: response.status,
        ok: response.ok,
        headers: Object.fromEntries(response.headers)
    })
    
    return stream ? 
        handleStreamResponse(response, req, res) : 
        handleNormalResponse(response, req, res)
}

// 请求验证
function validateRequest(req) {
    const { model, messages, stream = false } = req.body
    let authToken = req.headers.authorization?.replace('Bearer ', '')
    
    if (model.startsWith('o1-') && stream) {
        console.log('Model not supported stream:', model)
        throw new Error('Model not supported stream')
    }

    // 处理逗号分隔的密钥
    const keys = authToken ? authToken.split(',').map(key => key.trim()) : []
    console.log('Available keys count:', keys.length)
    
    if (keys.length > 0) {
        authToken = keys[0]
        console.log('Using key:', authToken.substring(0, 10) + '...')
    }

    if (authToken && authToken.includes('%3A%3A')) {
        authToken = authToken.split('%3A%3A')[1]
        console.log('Token contains separator, using second part')
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0 || !authToken) {
        console.error('Validation failed:', {
            hasMessages: !!messages,
            isArray: Array.isArray(messages),
            messagesLength: messages?.length,
            hasToken: !!authToken
        })
        throw new Error('Invalid request. Messages should be a non-empty array and authorization is required')
    }

    return { model, messages, stream, authToken }
}

// API请求函数
async function makeRequest(req, authToken) {
    console.log('Preparing request...')
    const { model, messages } = req.body
    
    console.log('Formatting messages...')
    const formattedMessages = messages.map(msg => `${msg.role}:${msg.content}`).join('\n')
    console.log('Formatted messages:', formattedMessages)
    
    console.log('Converting to hex...')
    const hexData = stringToHex(formattedMessages, model)
    console.log('Hex data length:', hexData.length)

    // 构建请求头
    const headers = {
        'Content-Type': 'application/connect+proto',
        'authorization': `Bearer ${authToken}`,
        'connect-accept-encoding': 'gzip,br',
        'connect-protocol-version': '1',
        'user-agent': USER_AGENT,
        'x-amzn-trace-id': `Root=${uuidv4()}`,
        'x-cursor-checksum': CURSOR_CHECKSUM,
        'x-cursor-client-version': CLIENT_VERSION,
        'x-cursor-timezone': TIMEZONE,
        'x-ghost-mode': GHOST_MODE,
        'x-request-id': uuidv4(),
        'x-mac-machine-id': TELEMETRY.macMachineId,
        'x-machine-id': TELEMETRY.machineId,
        'x-device-id': TELEMETRY.deviceId,
        'Host': 'api2.cursor.sh',
        'Content-Length': hexData.length.toString()
    }
    
    console.log('Request headers:', {
        ...headers,
        authorization: headers.authorization.substring(0, 20) + '...'
    })

    console.log('Sending request to API...')
    return fetchWithRetry('https://api2.cursor.sh/aiserver.v1.AiService/StreamChat', {
        method: 'POST',
        headers,
        body: hexData
    })
}

// 重试机制
async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
    try {
        const response = await fetch(url, options)
        
        // 使用日志记录器，它会自动处理是否记录
        await responseLogger.logResponse(response)
        
        // 检查响应状态
        if (!response.ok) {
            const errorText = await response.text()
            console.error('Cursor API error response:', {
                status: response.status,
                statusText: response.statusText,
                errorText
            })
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`)
        }
        
        return response
    } catch (error) {
        if (retries > 0) {
            console.log(`Retrying request (${retries} attempts remaining). Error:`, error.message)
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
            return fetchWithRetry(url, options, retries - 1)
        }
        throw error
    }
}

// 流式响应处理
async function handleStreamResponse(response, req, res) {
    if (!response.body) throw new Error('Empty response body')
    
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const responseId = `chatcmpl-${uuidv4()}`
    
    try {
        for await (const chunk of response.body) {
            const text = chunkToUtf8String(chunk)
            if (text.length > 0) {
                const streamResponse = formatStreamResponse(text, responseId, req.body.model)
                res.write(`data: ${JSON.stringify(streamResponse)}\n\n`)
            }
        }
        res.write('data: [DONE]\n\n')
        res.end()
    } catch (error) {
        console.error('Stream error:', error)
        throw error
    }
}

// 普通响应处理
async function handleNormalResponse(response, req, res) {
    let text = ''
    
    try {
        for await (const chunk of response.body) {
            const chunkText = chunkToUtf8String(chunk)
            if (chunkText.length > 0) text += chunkText
        }
        
        if (!text) throw new Error('Empty response')
        
        text = text.replace(/^.*<\|END_USER\|>/s, '').replace(/^\n[a-zA-Z]?/, '').trim()
        
        const result = formatNormalResponse(text, req.body.model)
        cacheResponse(getCacheKey(req), result)
        return res.json(result)
    } catch (error) {
        console.error('Response error:', error)
        throw error
    }
}

// 响应格式化
function formatStreamResponse(text, responseId, model) {
    return {
        id: responseId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
            index: 0,
            delta: { content: text }
        }]
    }
}

function formatNormalResponse(text, model) {
    return {
        id: `chatcmpl-${uuidv4()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
            index: 0,
            message: {
                role: 'assistant',
                content: text
            },
            finish_reason: 'stop'
        }],
        usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
        }
    }
}

// 缓存相关
function getCacheKey(req) {
    return `${req.body.model}-${JSON.stringify(req.body.messages)}`
}

function checkCache(key) {
    const cached = responseCache.get(key)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data
    }
    return null
}

function cacheResponse(key, data) {
    responseCache.set(key, {
        timestamp: Date.now(),
        data
    })
}

// 定期清理过期缓存
setInterval(() => {
    const now = Date.now()
    for (const [key, value] of responseCache) {
        if (now - value.timestamp > CACHE_TTL) {
            responseCache.delete(key)
        }
    }
}, 60000)

// 错误处理
function handleError(error, req, res) {
    console.error('Request failed:', {
        error: error.message,
        stack: error.stack,
        body: req.body,
        headers: req.headers,
        checksum: CURSOR_CHECKSUM,
        clientVersion: CLIENT_VERSION,
        timezone: TIMEZONE,
        telemetry: TELEMETRY
    })
    
    let errorMessage = error.message
    if (error.message.includes('Not logged in')) {
        errorMessage = 'Authentication failed. Please check your token.'
    }
    
    const errorResponse = {
        error: {
            message: errorMessage,
            type: 'cursor_api_error'
        }
    }
    
    if (req.body.stream) {
        res.write(`data: ${JSON.stringify(errorResponse)}\n\n`)
        res.end()
    } else {
        res.status(401).json(errorResponse)
    }
}

function handleFatalError(err) {
    console.error('Fatal error:', {
        message: err.message,
        stack: err.stack,
        name: err.name
    })
    process.exit(1)
}

// 性能指标更新
function updateMetrics(startTime) {
    const requestTime = Date.now() - startTime
    metrics.avgResponseTime = (metrics.avgResponseTime * (metrics.requestCount - 1) + requestTime) / metrics.requestCount
    metrics.lastRequestTime = requestTime
}

// 优雅关闭
async function gracefulShutdown() {
    console.log('Shutting down gracefully...')
    // 清理资源、关闭连接等
    process.exit(0)
}

// 启动服务器
if (!module.parent) {
    app.listen(PORT, '0.0.0.0', (err) => {
        if (err) {
            console.error('Error starting server:', err)
            process.exit(1)
        }
        console.log(`Server running on port ${PORT}`)
        console.log('Using checksum:', CURSOR_CHECKSUM.substring(0, 10) + '...')
        console.log('Using telemetry IDs:', {
            macMachineId: TELEMETRY.macMachineId.substring(0, 10) + '...',
            machineId: TELEMETRY.machineId.substring(0, 10) + '...',
            deviceId: TELEMETRY.deviceId
        })
    })
}

module.exports = app
