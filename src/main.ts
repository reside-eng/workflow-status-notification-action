import * as fs from 'fs';
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as exec from '@actions/exec';
import * as cache from '@actions/cache';
import * as fsp from 'fs/promises';
import got from 'got';
import { ExecOptions } from '@actions/exec';

export enum Inputs {
  CurrentStatus = 'current-status',
  SlackWebhook = 'slack-webhook',
  GithubToken = 'github-token',
}

const { context } = github;
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
async function getHeadRef() {
  let headRef;
  if (context.payload.pull_request !== undefined) {
    headRef = context.payload.pull_request.head.ref;
  } else {
    headRef = context.ref.split('/').pop();
  }
  return headRef;
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

  if (!cacheKey || (cacheKey && !fs.existsSync(cachePaths[0]))) {
    core.info('Cache not found, retrieve status from previous run.');

    const headRef = await getHeadRef();

    core.info(`Branch name: ${headRef}`);

    const githubToken = core.getInput(Inputs.GithubToken);
    core.exportVariable('GITHUB_TOKEN', `${githubToken}`);

    const options: ExecOptions = {};
    options.listeners = {
      stdout: (data: Buffer) => {
        lastStatus += data.toString();
      },
    };

    await exec.exec(
      '/bin/bash',
      [
        '-c',
        `gh run list -w "${context.workflow}" | grep "${context.workflow}	${headRef}" | grep -v "completed	cancelled" | grep -v "in_progress" | head -n 1 | awk -F" " '{print $1"/"$2}'`,
      ],
      options,
    );

    core.info(`GH Found status: ${lastStatus}`);
  } else {
    core.info('Cache found, retrieve status from same run.');

    lastStatus = await fsp.readFile(cachePaths[0], 'utf8');

    core.info(`Cache Found status: ${lastStatus}`);
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
): Promise<Record<string, any>> {
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
  messageBody: Record<string, any>,
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
  const currentStatus = core.getInput(Inputs.CurrentStatus);
  const webhookUrl = core.getInput(Inputs.SlackWebhook);

  core.info(`Last run status: ${lastStatus}`);
  core.info(`Current run status: ${currentStatus}`);

  if (currentStatus !== 'success' && currentStatus !== 'failure') {
    core.setFailed('Wrong current status value');
  }

  const expressionUrl =
    /https:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)?/gi;
  const regexUrl = new RegExp(expressionUrl);

  if (!webhookUrl.match(regexUrl)) {
    core.setFailed('Wrong Slack Webhook URL format');
  }

  await fsp.writeFile(cachePaths[0], `completed/${currentStatus}`, {
    encoding: 'utf8',
  });

  await cache.saveCache(cachePaths, cachePrimaryKey);

  if (currentStatus === 'success' && lastStatus === 'completed/failure') {
    core.info(`Success notification`);
    const message = await prepareSlackNotification(
      `Previously failing ${context.workflow} workflow in ${repository} succeed.`,
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
