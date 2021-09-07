import * as fs from 'fs';
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as exec from '@actions/exec';
import * as cache from '@actions/cache';
import * as https from 'https';

export enum Inputs {
  CurrentStatus = 'current-status',
  SlackChannel = 'slack-channel',
  SlackWebhook = 'slack-webhook',
  GithubToken = 'github-token',
}

const { context } = github;
const { workflow } = context;
const repository = context.repo.repo;
const cachePrimaryKey = `last-run-status-${context.runId}-${Math.random()
  .toString(36)
  .substr(2, 12)}`;
const cacheRestoreKeys = [`last-run-status-${context.runId}-`];
const cachePaths = ['last-run-status'];

/**
 * Gets the last workflow run status
 *
 * @returns last run status
 */
async function getLastRunStatus() {
  let lastStatus = '';
  try {
    const cacheKey = await cache.restoreCache(
      cachePaths,
      cachePrimaryKey,
      cacheRestoreKeys,
    );

    if (!cacheKey || (cacheKey && !fs.existsSync(cachePaths[0]))) {
      core.info('Cache not found, retrieve status from previous run.');

      let headRef;

      if (context.payload.pull_request !== undefined) {
        headRef = JSON.parse(JSON.stringify(context.payload.pull_request)).head
          .ref;
      } else {
        headRef = context.ref.split('/').pop();
      }

      core.info(`Branch name: ${headRef}`);

      const githubToken = core.getInput(Inputs.GithubToken);
      core.exportVariable('GITHUB_TOKEN', `${githubToken}`);

      const options: any = {};
      options.listeners = {
        stdout: (data: Buffer) => {
          lastStatus += data.toString();
        },
      };

      await exec.exec(
        '/bin/bash',
        [
          '-c',
          `gh run list -w "${workflow}" | grep "${workflow}	${headRef}" | grep -v "completed	cancelled" | grep -v "in_progress" | head -n 1 | awk -F" " '{print $1"/"$2}'`,
        ],
        options,
      );

      core.info(`GH Found status: ${lastStatus}`);
    } else {
      core.info('Cache found, retrieve status from same run.');

      lastStatus = fs.readFileSync(cachePaths[0], 'utf8');

      core.info(`Cache Found status: ${lastStatus}`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }

  return lastStatus;
}

/**
 * Prepare slack notification
 *
 * @param webhookURL
 * @param messageBody
 * @param message
 * @param status
 * @returns the Slack message body
 */
async function prepareSlackNotification(
  message: string,
  status: string,
): Promise<any> {
  const { sha } = context;
  const { ref } = context;
  const event = context.eventName;
  const { actor } = context;
  const { serverUrl } = context;
  const color = status === 'success' ? 'good' : 'danger';

  const messageBody = {
    username: `${repository} CI alert`, // This will appear as user name who posts the message
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
            title: 'Ref',
            value: `${ref}`,
            short: true,
          },
          {
            title: 'Event',
            value: `${event}`,
            short: true,
          },
          {
            title: 'Action URL',
            value: `<${serverUrl}/${repository}/commit/${sha}/checks|${workflow}>`,
            short: true,
          },
          {
            title: 'Commit',
            value: `<${serverUrl}/${repository}/commit/${sha}|${sha}>`,
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
 * @param webhookURL
 * @param messageBody
 * @returns {Promise}
 */
function sendSlackMessage(webhookURL: string, messageBody: string) {
  // make sure the incoming message body can be parsed into valid JSON

  core.info(`Message body: ${messageBody}`);

  // Promisify the https.request
  return new Promise((resolve, reject) => {
    // general request options, we defined that it's a POST request and content is JSON
    const requestOptions = {
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
      },
    };

    // actual request
    const req = https.request(webhookURL, requestOptions, (res: any) => {
      let response = '';

      res.on('data', (d: any) => {
        response += d;
      });

      // response finished, resolve the promise with data
      res.on('end', () => {
        resolve(response);
      });
    });

    // there was an error, reject the promise
    req.on('error', (e: any) => {
      reject(e);
    });

    // send our message body (was parsed to JSON beforehand)
    req.write(messageBody);
    req.end();
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
  // eslint-disable-next-line camelcase

  const lastStatus = await getLastRunStatus();
  const currentStatus = core.getInput(Inputs.CurrentStatus);
  const webhookUrl = core.getInput(Inputs.SlackWebhook);

  core.info(`Last run status: ${lastStatus}`);
  core.info(`Current run status: ${currentStatus}`);

  fs.writeFileSync(cachePaths[0], `completed/${currentStatus}`, 'utf8');

  await cache.saveCache(cachePaths, cachePrimaryKey);

  if (currentStatus === 'success' && lastStatus === 'completed/failure') {
    const message = await prepareSlackNotification(
      `Previously failing ${workflow} workflow in ${repository} succeed.`,
      currentStatus,
    );
    const slackResponse = await sendSlackMessage(webhookUrl, message);
    core.info(`Message response ${slackResponse}`);
  } else if (
    currentStatus === 'failure' &&
    (lastStatus === 'completed/success' || lastStatus === '')
  ) {
    const message = await prepareSlackNotification(
      `${workflow} workflow in ${repository} failed.`,
      currentStatus,
    );
    const slackResponse = await sendSlackMessage(webhookUrl, message);
    core.info(`Message response ${slackResponse}`);
  } else {
    core.info(`No notification needed.`);
  }
}

/**
 * Main function to execute the Github Action
 */
export default async function run(): Promise<void> {
  process.on('unhandledRejection', handleError);
  await pipeline().catch(handleError);
}
