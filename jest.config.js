/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  moduleDirectories: ["node_modules", "src"],
  moduleNameMapper: {
    "@raycast/api": "<rootDir>/__mocks__/@raycast-api.js",
  },
};
