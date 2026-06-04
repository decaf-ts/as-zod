// import { Config } from "@jest/types";
const conf = require("../../jest.config.cjs");

const config = {
  ...conf,
  watchman: false,
  maxWorkers: 1,
  collectCoverage: true,
  coverageDirectory: "./workdocs/reports/coverage",
  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "./workdocs/reports/junit",
        outputName: "junit-report.xml",
      },
    ],
    [
      "jest-html-reporters",
      {
        publicPath: "./workdocs/reports/html",
        filename: "test-report.html",
        openReport: true,
        expand: true,
        pageTitle: "@decaf-ts/as-zod",
        stripSkippedTest: true,
        darkTheme: true,
        enableMergeData: true,
        dataMergeLevel: 2,
      },
    ],
  ],
  coverageThreshold: {
    global: {
      branches: 56,
      functions: 81,
      lines: 69,
      statements: 67,
    },
  },
};

module.exports = config;
