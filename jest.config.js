module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.js'],
  transform: {
    '^.+\\.js$': ['babel-jest', {
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    }],
  },
  collectCoverageFrom: ['src/**/*.js', '!src/index.html'],
  modulePathIgnorePatterns: ['<rootDir>/node_modules/'],
  coverageThreshold: {
    global: {
      branches: 45,
      functions: 45,
      lines: 55,
      statements: 55,
    },
  },
};
