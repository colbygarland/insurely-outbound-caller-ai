"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bun_test_1 = require("bun:test");
const utils_1 = require("./utils");
(0, bun_test_1.describe)('utils', () => {
    (0, bun_test_1.describe)('convertToUTC', () => {
        (0, bun_test_1.test)('should convert EST time to UTC correctly', () => {
            const result = (0, utils_1.convertToUTC)('January 1', '14:00', 'America/New_York');
            (0, bun_test_1.expect)(result).toBe('2025-01-01T19:00:00.000Z');
        });
        (0, bun_test_1.test)('should convert PST time to UTC correctly', () => {
            const result = (0, utils_1.convertToUTC)('January 1', '14:00', 'America/Los_Angeles');
            (0, bun_test_1.expect)(result).toBe('2025-01-01T22:00:00.000Z');
        });
        (0, bun_test_1.test)('should convert MST time to UTC correctly', () => {
            const result = (0, utils_1.convertToUTC)('January 1', '14:00', 'America/Edmonton');
            (0, bun_test_1.expect)(result).toBe('2025-01-01T21:00:00.000Z');
        });
        (0, bun_test_1.test)('should convert CST time to UTC correctly', () => {
            const result = (0, utils_1.convertToUTC)('January 1', '14:00', 'America/Chicago');
            (0, bun_test_1.expect)(result).toBe('2025-01-01T20:00:00.000Z');
        });
    });
});
