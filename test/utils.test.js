const { expect } = require('chai')
const { chunkToUtf8String } = require('../src/utils')
const responses = require('./fixtures/real-responses')

describe('Utils Tests', () => {
    describe('chunkToUtf8String', () => {
        it('should handle resource exhausted error', () => {
            const result = chunkToUtf8String(responses.response1.buffer)
            expect(result).to.include('Error:')
            expect(result).to.include('Too many free trials')
        })

        it('should handle another resource exhausted error', () => {
            const result = chunkToUtf8String(responses.response2.buffer)
            expect(result).to.include('Error:')
            expect(result).to.include('Too many free trials')
        })

        it('should handle unauthenticated error', () => {
            const result = chunkToUtf8String(responses.response3.buffer)
            expect(result).to.include('Error:')
            expect(result).to.include('Not logged in')
        })

        it('should handle null or empty chunk', () => {
            expect(chunkToUtf8String(null)).to.equal('')
            expect(chunkToUtf8String(Buffer.from([]))).to.equal('')
        })

        it('should handle non-0x00-0x00 chunks', () => {
            const chunk = Buffer.from([0x01, 0x02, 0x03])
            expect(chunkToUtf8String(chunk)).to.equal('')
        })

        it('should handle invalid JSON in chunk', () => {
            const chunk = Buffer.from([0x00, 0x00, 0x7B, 0x7D]) // "{}"
            expect(chunkToUtf8String(chunk)).to.equal('')
        })
    })
}) 