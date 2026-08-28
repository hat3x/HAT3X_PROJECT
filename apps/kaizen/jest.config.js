module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.integracion\\.test\\.ts$',
  ],
  moduleNameMapper: {
    '^test-renderer$': 'react-test-renderer',
  },
}
