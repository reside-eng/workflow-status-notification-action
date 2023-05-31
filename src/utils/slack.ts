import { context } from '@actions/github';
import * as core from '@actions/core';
import got from 'got';
import { getHeadRef } from './github';

/**
 * Handles the actual sending request.
 * We're turning the https.request into a promise here for convenience
 *
 * @param webhookURL URL of the Slack channel Webhook
 * @param messageBody Payload to send to Slack
 */
export async function sendSlackMessage(
  webhookURL: string,
  messageBody: Record<string, string | number | boolean | unknown>,
): Promise<void> {
  core.info(`Message body: ${JSON.stringify(messageBody)}`);

  await got.post(webhookURL, {
    json: messageBody,
  });
}

/**
 * Prepare slack notification
 *
 * @param message contained in the Slack notification
 * @param status current status to notify
 * @returns the Slack message body
 */
export async function prepareSlackNotification(
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
  const repository = context.repo.repo;
  const headRef = getHeadRef();
  const authorName = event === 'schedule' ? 'reside-camacho' : `${actor}`;

  const messageBody = {
    icon_emoji: ':bangbang:', // User icon, you can also use custom icons here
    attachments: [
      {
        // this defines the attachment block, allows for better layout usage
        color: `${color}`, // color of the attachments sidebar.
        author_name: authorName,
        author_link: `${serverUrl}/${authorName}`,
        author_icon: `${serverUrl}/${authorName}.png?size=32`,
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
