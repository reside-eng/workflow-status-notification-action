import { join } from 'path';
import { readJson } from 'fs-extra';
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as exec from '@actions/exec';

const REQUIRED_TAG_FORMAT = 'abc';

// /**
//  * Gets the last workflow run status
//  *
//  * @returns version of the code
//  */
// async function getLastRunStatus(): Promise<string> {
//   const packagePath = join(
//     process.env.GITHUB_WORKSPACE || '',
//     core.getInput('package-directory'),
//     'package.json',
//   );

//   core.debug(`Reading ${packagePath}...`);

//   const { version } = await readJson(packagePath);
//   if (!version) {
//     throw new Error(`Missing "version" in ${packagePath}`);
//   }

//   core.info(`Found version ${version} in ${packagePath}`);
//   return version;
// }

// /**
//  * Store the current workflow run status using Actions cache
//  */
// async function storeCurrentRunStatus(): Promise<string> {
//   const packagePath = join(
//     process.env.GITHUB_WORKSPACE || '',
//     core.getInput('package-directory'),
//     'package.json',
//   );

//   core.debug(`Reading ${packagePath}...`);

//   const { version } = await readJson(packagePath);
//   if (!version) {
//     throw new Error(`Missing "version" in ${packagePath}`);
//   }

//   core.info(`Found version ${version} in ${packagePath}`);
// }

// /**
//  * Store the current workflow run status using Actions cache
//  */
// async function sendSlackNotification(): Promise<string> {
//   const packagePath = join(
//     process.env.GITHUB_WORKSPACE || '',
//     core.getInput('package-directory'),
//     'package.json',
//   );

//   core.debug(`Reading ${packagePath}...`);

//   const { version } = await readJson(packagePath);
//   if (!version) {
//     throw new Error(`Missing "version" in ${packagePath}`);
//   }

//   core.info(`Found version ${version} in ${packagePath}`);
//   return version;
// }

/**
 * Logs an error and fails the Github Action
 *
 * @param err Any possible errors
 */
function handleError(err: Error): void {
  console.error(err);
  core.setFailed(err.message);
}

/**
 * Action run pipeline
 */
async function pipeline() {
  // eslint-disable-next-line camelcase
  const cloneUrl = github.context.payload.repository?.clone_url;
  // const tagFormat = core.getInput('tag-format');

  // if (!tagFormat.includes(REQUIRED_TAG_FORMAT)) {
  //   console.log('ERROR!');
  //   throw new Error(
  //     `tag-format is missing required "${REQUIRED_TAG_FORMAT}" pattern`,
  //   );
  // }

  // const version = await getVersion();
  // const tagName = tagFormat.replace('$version', version);

  const currentStatus = core.getInput('current-status');
  core.info(`Current status ${currentStatus}`);

  await exec.exec('gh', ['run', 'list']);
}

/**
 * Main function to execute the Github Action
 */
export default async function run(): Promise<void> {
  process.on('unhandledRejection', handleError);
  await pipeline().catch(handleError);
}
