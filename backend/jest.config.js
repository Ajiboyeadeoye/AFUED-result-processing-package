// jest.config.js
export default {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/test/**/*.test.js',
    '<rootDir>/**/test/**/*.test.js'
  ],
  transform: {},
  verbose: true,
  
  // Increase global timeout
  testTimeout: 10000, // 10 seconds per test
  
  // Use setup file
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  
  detectOpenHandles: true,
  forceExit: true,
  
  // Coverage settings
  collectCoverageFrom: [
    'domain/payment/**/*.js',
    '!**/node_modules/**',
    '!**/test/**',
  ],
  
  coverageDirectory: 'coverage',
};