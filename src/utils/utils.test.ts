import { describe, test, expect } from 'bun:test'
import { convertToUTC } from './utils'

// describe('utils', () => {
//   describe('convertToUTC', () => {
//     test('should convert EST time to UTC correctly', () => {
//       const result = convertToUTC('January 1', '14:00', 'America/New_York')
//       expect(result).toBe('2025-01-01T19:00:00.000Z')
//     })
//     test('should convert PST time to UTC correctly', () => {
//       const result = convertToUTC('January 1', '14:00', 'America/Los_Angeles')
//       expect(result).toBe('2025-01-01T22:00:00.000Z')
//     })
//     test('should convert MST time to UTC correctly', () => {
//       const result = convertToUTC('January 1', '14:00', 'America/Edmonton')
//       expect(result).toBe('2025-01-01T21:00:00.000Z')
//     })
//     test('should convert CST time to UTC correctly', () => {
//       const result = convertToUTC('January 1', '14:00', 'America/Chicago')
//       expect(result).toBe('2025-01-01T20:00:00.000Z')
//     })
//   })
// })
