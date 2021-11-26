import * as core from '@actions/core';
import { context } from '@actions/github';
import * as cache from '@actions/cache';
import { promises as fsp } from 'fs';
import got from 'got';
import { exec, ExecOptions } from '@actions/exec';
import { URL } from 'url';

export enum Inputs {
  Success = 'success',
  SlackWebhook = 'slack-webhook',
  GithubToken = 'github-token',
}

const repository = context.repo.repo;
const cachePrimaryKey = `last-run-status-${context.runId}-${Math.random()
  .toString(36)
  .substr(2, 12)}`;
const cacheRestoreKeys = [`last-run-status-${context.runId}-`];
const cachePaths = ['last-run-status'];

/**
 * Gets headRef according to context
 *
 * @returns headRef
 */
function getHeadRef() {
  if (context.payload.pull_request !== undefined) {
    return context.payload.pull_request.head.ref;
  }
  return context.ref.split('/').pop();
}

/**
 * Gets last run status from GH CLI
 *
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
 *
 * @returns last run status
 */
async function getLastRunStatus() {
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
 * Prepare slack notification
 *
 * @param message contained in the Slack notification
 * @param status current status to notify
 * @returns the Slack message body
 */
async function prepareSlackNotification(
  message: string,
  status: string,
): Promise<Record<string, string | number | boolean | unknown>> {
  const {
    runId,
    workflow,
    actor,
    serverUrl,
    eventName: event,
    repo: { owner },
  } = context;
  const color = status === 'success' ? 'good' : 'danger';

  const headRef = await getHeadRef();

  const messageBody = {
    icon_emoji: ':bangbang:', // User icon, you can also use custom icons here
    attachments: [
      {
        // this defines the attachment block, allows for better layout usage
        color: `${color}`, // color of the attachments sidebar.
        author_name: `${actor}`,
        author_link: `${serverUrl}/${actor}`,
        author_icon: `${serverUrl}/${actor}.png?size=32`,
        fields: [
          // actual fields
          {
            title: 'Repository',
            value: `${repository}`,
            short: true,
          },
          {
            title: 'Branch',
            value: `${headRef}`,
            short: true,
          },
          {
            title: 'Action URL',
            value: `<${serverUrl}/${owner}/${repository}/actions/runs/${runId}|${workflow}>`,
            short: true,
          },
          {
            title: 'Event',
            value: `${event}`,
            short: true,
          },
          {
            title: `${workflow} workflow ${status}`,
            value: `${message}`, // Custom value
            short: false, // long fields will be full width
          },
        ],
      },
    ],
  };
  return messageBody;
}

/**
 * Handles the actual sending request.
 * We're turning the https.request into a promise here for convenience
 *
 * @param webhookURL URL of the Slack channel Webhook
 * @param messageBody Payload to send to Slack
 */
async function sendSlackMessage(
  webhookURL: string,
  messageBody: Record<string, string | number | boolean | unknown>,
) {
  core.info(`Message body: ${JSON.stringify(messageBody)}`);

  await got.post(webhookURL, {
    json: messageBody,
  });
}

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
  const lastStatus = await getLastRunStatus();
  const success = core.getInput(Inputs.Success);
  const webhookUrl = core.getInput(Inputs.SlackWebhook);

  if (success !== 'true' && success !== 'false') {
    core.setFailed('Wrong success value');
    return;
  }

  const currentStatus = success === 'true' ? 'success' : 'failure';

  core.info(`Last run status: ${lastStatus}`);
  core.info(`Current run status: ${currentStatus}`);

  let url;
  try {
    url = new URL(webhookUrl);
  } catch (err) {
    core.setFailed('Wrong Slack Webhook URL format');
    return;
  }

  if (url.protocol !== 'https:') {
    core.setFailed('Wrong Slack Webhook URL format');
    return;
  }

  await fsp.writeFile(cachePaths[0], `completed/${currentStatus}`, {
    encoding: 'utf8',
  });

  await cache.saveCache(cachePaths, cachePrimaryKey);

  if (currentStatus === 'success' && lastStatus === 'completed/failure') {
    core.info(`Success notification`);
    const message = await prepareSlackNotification(
      `Previously failing ${context.workflow} workflow in ${repository} succeeded.`,
      currentStatus,
    );
    await sendSlackMessage(webhookUrl, message);
  } else if (
    currentStatus === 'failure' &&
    (lastStatus === 'completed/success' || lastStatus === '')
  ) {
    core.info(`Failure notification`);
    const message = await prepareSlackNotification(
      `${context.workflow} workflow in ${repository} failed.`,
      currentStatus,
    );
    await sendSlackMessage(webhookUrl, message);
  } else {
    core.info(`No notification needed`);
  }
}

/**
 * Main function to execute the Github Action
 */
export default async function run(): Promise<void> {
  process.on('unhandledRejection', handleError);
  await pipeline().catch(handleError);
  // ensures listener is removed after the run
  process.removeListener('unhandledRejection', handleError);
}
