module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest', {
      jsc: {
        parser: { syntax: 'ecmascript', jsx: true },
        transform: { react: { runtime: 'automatic' } }
      }
    }]
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.js'],
};
