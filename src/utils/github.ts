import * as core from '@actions/core';
import { context } from '@actions/github';
import * as cache from '@actions/cache';
import { promises as fsp } from 'fs';
import { exec, ExecOptions } from '@actions/exec';
import { Inputs } from '../inputs';

const cachePrimaryKey = `last-run-status-${context.runId}-${Math.random()
  .toString(36)
  .substr(2, 12)}`;
const cacheRestoreKeys = [`last-run-status-${context.runId}-`];
const cachePaths = ['last-run-status'];

/**
 * Gets headRef according to context
 * @returns headRef
 */
export function getHeadRef(): string | undefined {
  if (context.payload.pull_request !== undefined) {
    return context.payload.pull_request.head.ref;
  }
  return context.ref.split('/').pop();
}

/**
 * Gets last run status from GH CLI
 * @returns status
 */
async function getStatusFromGithub() {
  const headRef = getHeadRef();

  const githubToken = core.getInput(Inputs.GithubToken);
  core.exportVariable('GITHUB_TOKEN', `${githubToken}`);

  const options: ExecOptions = {};
  let lastStatus = '';
  options.listeners = {
    stdout: (data: Buffer) => {
      lastStatus += data.toString();
    },
  };

  await exec(
    '/bin/bash',
    [
      '-c',
      `gh run list -w "${context.workflow}" | grep "${context.workflow}	${headRef}" | grep -v "completed	cancelled" | grep -v "in_progress" | head -n 1 | awk -F" " '{print $1"/"$2}'`,
    ],
    options,
  );

  core.info(`GH Found status: ${lastStatus}`);

  return lastStatus;
}

/**
 * Gets the last workflow run status
 * @returns last run status
 */
export async function getLastRunStatus(): Promise<string> {
  let lastStatus = '';

  const cacheKey = await cache.restoreCache(
    cachePaths,
    cachePrimaryKey,
    cacheRestoreKeys,
  );

  if (cacheKey) {
    try {
      lastStatus = await fsp.readFile(cachePaths[0], 'utf8');
      core.info(`Cache Found status: ${lastStatus}`);
    } catch (err) {
      lastStatus = await getStatusFromGithub();
    }
  } else {
    lastStatus = await getStatusFromGithub();
  }

  return lastStatus.trim();
}

/**
 *
 * @param status - Status to write to cache
 */
export async function writeStatusToCache(status: string): Promise<void> {
  await fsp.writeFile(cachePaths[0], `completed/${status}`, {
    encoding: 'utf8',
  });

  await cache.saveCache(cachePaths, cachePrimaryKey);
}
