module.exports = {
  transform: {
    '^.+\\.ts$': '@swc/jest',
  },
  testEnvironment: 'node',
  verbose: true,
  modulePathIgnorePatterns: ['<rootDir>/aut/'],
  // Strip .js extension from relative imports (needed for ESM-style source under Jest).
  // Removed once Vitest takes over.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
