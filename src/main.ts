import * as core from '@actions/core';
import { context } from '@actions/github';
import { URL } from 'url';
import { getLastRunStatus, writeStatusToCache } from './utils/github';
import { Inputs } from './inputs';
import { prepareSlackNotification, sendSlackMessage } from './utils/slack';

/**
 * Action run pipeline
 */
async function pipeline(): Promise<void> {
  const lastStatus = await getLastRunStatus();
  const currentStatus = core.getInput(Inputs.CurrentStatus);
  const webhookUrl = core.getInput(Inputs.SlackWebhook);
  const notifyType = core.getInput(Inputs.NotifyType);
  core.info(`Current run status: ${currentStatus}`);

  if (currentStatus !== 'success' && currentStatus !== 'failure' && currentStatus !== 'skipped') {
    core.setFailed('Wrong current status value');
    return;
  }

  let url;
  try {
    url = new URL(webhookUrl);
  } catch {
    core.setFailed('Wrong Slack Webhook URL format');
    return;
  }

  if (url.protocol !== 'https:') {
    core.setFailed('Wrong Slack Webhook URL format');
    return;
  }
  const repository = context.repo.repo;

  // Release messaging
  if (notifyType === 'release' && currentStatus !== 'skipped') {
    const releaseAction = ['select-for-release.yml', 'merge-main.yml'].includes(
      context.workflow,
    )
      ? 'deploy'
      : 'releas';
    const message = await prepareSlackNotification(
      currentStatus === 'success'
        ? `${repository} successfully ${releaseAction}ed`
        : `error ${releaseAction}ing ${repository}`,
      currentStatus,
    );
    await sendSlackMessage(webhookUrl, message);
    return;
  }

  // Previous status dependent messaging (i.e. messaging on success only if previous)
  core.info(`Last run status: ${lastStatus}`);

  if (currentStatus !== 'skipped') {
    await writeStatusToCache(currentStatus);
  }

  if (currentStatus === 'success' && lastStatus === 'completed/failure') {
    core.info(`Success notification`);
    const message = await prepareSlackNotification(
      `Previously failing ${context.workflow} workflow in ${repository} succeeded.`,
      currentStatus,
    );
    await sendSlackMessage(webhookUrl, message);
  } else if (
    currentStatus === 'failure' &&
    (lastStatus === 'completed/success' || lastStatus === '' || notifyType === 'on-failure-and-recovery')
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
 * Logs an error and fails the Github Action
 * @param err Any possible errors
 */
function handleError(err: Error): void {
  console.error(err);
  core.setFailed(err.message);
}

/**
 * Main function to execute the Github Action
 */
export async function run(): Promise<void> {
  process.on('unhandledRejection', handleError);
  await pipeline().catch(handleError);
  // ensures listener is removed after the run
  process.removeListener('unhandledRejection', handleError);
}
