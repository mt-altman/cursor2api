// 添加 uuid 引入
const { v4: uuidv4 } = require('uuid')

// 优化的工具函数
const FIXED_SUFFIX = Buffer.from(
    '10016A2432343163636435662D393162612D343131382D393239612D3936626330313631626432612' +
    '2002A132F643A2F6964656150726F2F656475626F73733A1E0A',
    'hex'
)

function calculateMessageLength(byteLength, modelNameLength) {
    const FIXED_HEADER = 2
    const SEPARATOR = 1
    const FIXED_SUFFIX_LENGTH = 0xA3 + modelNameLength
    
    // 计算长度字段大小
    const textLengthFieldSize1 = byteLength < 128 ? 1 : 2
    const baseLength = byteLength + 0x2A
    const textLengthFieldSize = baseLength < 128 ? 1 : 2
    
    return FIXED_HEADER + textLengthFieldSize + SEPARATOR +
           textLengthFieldSize1 + byteLength + FIXED_SUFFIX_LENGTH
}

function stringToHex(str, modelName) {
    console.log('Converting string to hex. Input length:', str.length, 'Model:', modelName)
    
    const bytes = Buffer.from(str, 'utf-8')
    const byteLength = bytes.length
    const modelNameBuffer = Buffer.from(modelName, 'utf-8')
    const modelNameLength = modelNameBuffer.length

    console.log('Calculated lengths:', {
        byteLength,
        modelNameLength
    })

    // 预计算总长度
    const messageTotalLength = calculateMessageLength(byteLength, modelNameLength)
    console.log('Total message length:', messageTotalLength)
    
    // 预分配buffer
    const result = Buffer.alloc(messageTotalLength * 2)
    let offset = 0

    // 写入消息长度
    offset += result.write(messageTotalLength.toString(16).padStart(10, '0'), offset, 'hex')
    
    // 写入固定头部
    offset += result.write('12', offset, 'hex')
    
    // 写入文本长度字段
    const baseLength = byteLength + 0x2A
    if (baseLength < 128) {
        offset += result.write(baseLength.toString(16).padStart(2, '0'), offset, 'hex')
    } else {
        const lowByte = (baseLength & 0x7F) | 0x80
        const highByte = (baseLength >> 7) & 0xFF
        offset += result.write(
            lowByte.toString(16).padStart(2, '0') + 
            highByte.toString(16).padStart(2, '0'), 
            offset, 
            'hex'
        )
    }
    
    // 写入分隔符和文本内容
    offset += result.write('0A', offset, 'hex')
    if (byteLength < 128) {
        offset += result.write(byteLength.toString(16).padStart(2, '0'), offset, 'hex')
    } else {
        const lowByte = (byteLength & 0x7F) | 0x80
        const highByte = (byteLength >> 7) & 0xFF
        offset += result.write(
            lowByte.toString(16).padStart(2, '0') + 
            highByte.toString(16).padStart(2, '0'), 
            offset, 
            'hex'
        )
    }
    
    // 写入消息内容
    offset += bytes.copy(result, offset)
    
    // 写入固定后缀
    offset += FIXED_SUFFIX.copy(result, offset)
    
    // 写入模型名称
    offset += result.write(
        modelNameLength.toString(16).padStart(2, '0').toUpperCase() +
        modelNameBuffer.toString('hex').toUpperCase(),
        offset,
        'hex'
    )
    
    // 写入剩余固定内容
    offset += result.write(
        '22004A24' +
        '61383761396133342D323164642D343863372D623434662D616636633365636536663765' +
        '680070007A2436393337376535612D386332642D343835342D623564392D653062623232336163303061' +
        '800101B00100C00100E00100E80100',
        offset,
        'hex'
    )
    
    return result
}

function chunkToUtf8String(chunk) {
    if (!chunk?.length) {
        return ''
    }

    // 只处理以 0x00 0x00 开头的 chunk，其他不处理，不然会有乱码
    if (!(chunk[0] === 0x00 && chunk[1] === 0x00)) {
        try {
            const rawText = Buffer.from(chunk).toString('utf-8')
            
            // 检查是否是流结束的错误消息
            if (rawText.includes('protocol error: received extra input message for server-streaming method')) {
                return '' // 忽略流结束的错误消息
            }
            
            // 尝试解析JSON响应
            const jsonMatch = rawText.match(/\{[\s\S]*\}/m)
            if (jsonMatch) {
                try {
                    const jsonStr = jsonMatch[0].trim()
                    const jsonData = JSON.parse(jsonStr)
                    if (jsonData.error) {
                        const details = jsonData.error.details?.[0]?.debug?.details
                        if (details) {
                            return `Error: ${details.title || details.detail || jsonData.error.message}`
                        }
                        return `Error: ${jsonData.error.message || jsonData.error.code || 'Unknown error'}`
                    }
                } catch (e) {
                    console.debug('JSON parse error:', e.message)
                }
            }
            return ''
        } catch (e) {
            console.error('Error parsing response:', e)
            return 'Error: Failed to parse response'
        }
    }

    console.debug('chunk hex:', Buffer.from(chunk).toString('hex'))
    console.debug('chunk string:', Buffer.from(chunk).toString('utf-8'))

    // 去掉 chunk 中 0x0A 以及之前的字符
    chunk = chunk.slice(chunk.indexOf(0x0A) + 1)

    let filteredChunk = []
    let i = 0
    while (i < chunk.length) {
        // 新的条件��滤：如果遇到连续4个0x00，则移除其之后所有的以 0 开头的字节（0x00 到 0x0F）
        if (chunk.slice(i, i + 4).every(byte => byte === 0x00)) {
            i += 4 // 跳过这4个0x00
            while (i < chunk.length && chunk[i] >= 0x00 && chunk[i] <= 0x0F) {
                i++ // 跳过所有以 0 开头的字节
            }
            continue
        }

        if (chunk[i] === 0x0C) {
            // 遇到 0x0C 时，跳过 0x0C 以及后续的所有连续的 0x0A
            i++ // 跳过 0x0C
            while (i < chunk.length && chunk[i] === 0x0A) {
                i++ // 跳过所有连续的 0x0A
            }
        } else if (
            i > 0 &&
            chunk[i] === 0x0A &&
            chunk[i - 1] >= 0x00 &&
            chunk[i - 1] <= 0x09
        ) {
            // 如果当前字节是 0x0A，且前一个字节在 0x00 至 0x09 之间，跳过前一个字节和当前字节
            filteredChunk.pop() // 移除已添加的前一个字节
            i++ // 跳过当前的 0x0A
        } else {
            filteredChunk.push(chunk[i])
            i++
        }
    }

    // 第二步：去除所有的 0x00 和 0x0C
    filteredChunk = filteredChunk.filter((byte) => byte !== 0x00 && byte !== 0x0C)

    // 去除小于 0x0A 的字节
    filteredChunk = filteredChunk.filter((byte) => byte >= 0x0A)

    const result = Buffer.from(filteredChunk)
    console.debug('hex result:', result.toString('hex'))
    console.debug('utf8 result:', result.toString('utf-8'))
    
    return result.toString('utf-8')
}

function generateRandomString(length) {
    const chars = 'abcdef0123456789'
    const result = new Array(length)
    for (let i = 0; i < length; i++) {
        result[i] = chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result.join('')
}

function generateChecksum() {
    const prefix = 'zo'
    const firstPart = generateRandomString(70)
    const separator = '/'
    const secondPart = generateRandomString(64)
    return `${prefix}${firstPart}${separator}${secondPart}`
}

function generateHex64() {
    const chars = '0123456789abcdef'
    let result = ''
    for (let i = 0; i < 64; i++) {
        result += chars[Math.floor(Math.random() * chars.length)]
    }
    return result
}

function generateDeviceId() {
    const uuid = uuidv4()
    return uuid.toLowerCase() // 确保是小写
}

function generateTelemetryIds() {
    return {
        macMachineId: generateHex64(),
        machineId: generateHex64(),
        deviceId: generateDeviceId()
    }
}

module.exports = {
    stringToHex,
    chunkToUtf8String,
    generateChecksum,
    calculateMessageLength,
    generateTelemetryIds,
}
