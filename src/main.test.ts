import { join } from 'path';
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as cache from '@actions/cache';
import * as fs from 'fs';
import fse from 'fs-extra';
import nock from 'nock';
import {
  PayloadRepository,
  WebhookPayload,
} from '@actions/github/lib/interfaces';
import { DownloadOptions } from '@actions/cache/lib/options';
import run from './main';

jest.mock('@actions/core');
jest.mock('@actions/cache');

jest.setTimeout(100000);

interface MockObj {
  inputs: Record<string, string | undefined>;
  repo: {
    owner: string;
    repo: string;
  };
  workflow: string;
  runId: number;
  headRef: string;
  sha: string;
  ref: string;
  eventName: string;
  actor: string;
  serverUrl: string;
}

let mock: MockObj;

const autPath = join(process.cwd(), 'aut');
const mockCore = core as jest.Mocked<typeof core>;
const mockCache = cache as jest.Mocked<typeof cache>;

const slackUrl = 'https://hooks.slack.com';
const slackPath = '/services/test/test';

const scope = nock(slackUrl).persist().post(slackPath).reply(200);

describe('@reside-eng/workflow-status-slack-notification', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mock = {
      // Default action inputs
      inputs: {
        'current-status': 'success',
        'slack-channel': 'test-channel',
        'slack-webhook': `${slackUrl}${slackPath}`,
        'github-token': `${process.env.GITHUB_TOKEN}`,
      },
      repo: {
        owner: 'reside-eng',
        repo: 'workflow-status-slack-notification',
      },
      workflow: 'Publish Action',
      runId: 23456,
      headRef: 'master',
      sha: 'af3ec70',
      ref: 'af3ec704b410630b7fb60b458a4c0aff261959b4',
      eventName: 'pull_request',
      actor: 'workflowactor',
      serverUrl: 'https://github.com',
    };

    // All tests will work under the AUT directory
    process.env.GITHUB_WORKSPACE = join(process.cwd(), 'aut');

    mockCore.getInput.mockImplementation(
      (name: string): string =>
        // console.log('name:', name);
        mock.inputs[name] || '',
    );

    mockCache.restoreCache.mockImplementation(
      (
        paths: string[],
        primaryKey: string,
        restoreKeys?: string[] | undefined,
        options?: DownloadOptions | undefined,
      ): Promise<string | undefined> =>
        // console.log('name:', name);
        new Promise((resolve) => {
          if (fs.existsSync('last-run-status')) {
            resolve('test');
          } else {
            resolve(undefined);
          }
        }),
    );

    // Setting to this Github repo by default
    (github.context.payload.repository as Partial<PayloadRepository>) = {
      clone_url: mock.repo,
    };
    (github.context.workflow as string) = mock.workflow;
    (github.context.runId as number) = mock.runId;
    (github.context.payload.pull_request as Partial<PayloadRepository>) = {
      head: {
        ref: mock.headRef,
      },
    };
    (github.context.sha as string) = mock.sha;
    (github.context.ref as string) = mock.ref;
    (github.context.eventName as string) = mock.eventName;
    (github.context.actor as string) = mock.actor;
    (github.context.serverUrl as string) = mock.serverUrl;
  });

  beforeAll(() => {
    fs.writeFileSync('last-run-status', `completed/failure`, {
      encoding: 'utf8',
    });
  });

  afterAll(() => {
    delete process.env.GITHUB_WORKSPACE;
    fs.unlink('last-run-status', (err) => {
      if (err) {
        console.error(err);
      }
    });
  });

  it('should send success notification if last run failed and current succeed', async () => {
    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockCore.info).toHaveBeenCalledWith('Current run status: success');
    expect(mockCore.info).toHaveBeenCalledWith('Success notification');
    expect(mockCore.info).toHaveBeenCalledWith(
      'Last run status: completed/failure',
    );
    expect(mockCore.info).toHaveBeenCalledWith(
      'Message body: {"username":"workflow-status-slack-notification CI alert","icon_emoji":":bangbang:","attachments":[{"color":"good","author_name":"workflowactor","author_link":"https://github.com/workflowactor","author_icon":"https://github.com/workflowactor.png?size=32","fields":[{"title":"Ref","value":"af3ec704b410630b7fb60b458a4c0aff261959b4","short":true},{"title":"Event","value":"pull_request","short":true},{"title":"Action URL","value":"<https://github.com/reside-eng/workflow-status-slack-notification/commit/af3ec70/checks|Publish Action>","short":true},{"title":"Commit","value":"<https://github.com/reside-eng/workflow-status-slack-notification/commit/af3ec70|af3ec70>","short":true},{"title":"Publish Action workflow success","value":"Previously failing Publish Action workflow in workflow-status-slack-notification succeed.","short":false}]}]}',
    );
  });

  it('should not send notification if last run succeeded and current succeed', async () => {
    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockCore.info).toHaveBeenCalledWith('Current run status: success');
    expect(mockCore.info).toHaveBeenCalledWith('No notification needed');
    expect(mockCore.info).toHaveBeenCalledWith(
      'Last run status: completed/success',
    );
  });

  it('should send failure notification if last run succeeded and current fails', async () => {
    mock.inputs['current-status'] = 'failure';

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockCore.info).toHaveBeenCalledWith('Current run status: failure');
    expect(mockCore.info).toHaveBeenCalledWith('Failure notification');
    expect(mockCore.info).toHaveBeenCalledWith(
      'Last run status: completed/success',
    );
    expect(mockCore.info).toHaveBeenCalledWith(
      'Message body: {"username":"workflow-status-slack-notification CI alert","icon_emoji":":bangbang:","attachments":[{"color":"danger","author_name":"workflowactor","author_link":"https://github.com/workflowactor","author_icon":"https://github.com/workflowactor.png?size=32","fields":[{"title":"Ref","value":"af3ec704b410630b7fb60b458a4c0aff261959b4","short":true},{"title":"Event","value":"pull_request","short":true},{"title":"Action URL","value":"<https://github.com/reside-eng/workflow-status-slack-notification/commit/af3ec70/checks|Publish Action>","short":true},{"title":"Commit","value":"<https://github.com/reside-eng/workflow-status-slack-notification/commit/af3ec70|af3ec70>","short":true},{"title":"Publish Action workflow failure","value":"Publish Action workflow in workflow-status-slack-notification failed.","short":false}]}]}',
    );
  });

  it('should not send notification if last run failed and current fails', async () => {
    mock.inputs['current-status'] = 'failure';

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockCore.info).toHaveBeenCalledWith('Current run status: failure');
    expect(mockCore.info).toHaveBeenCalledWith('No notification needed');
    expect(mockCore.info).toHaveBeenCalledWith(
      'Last run status: completed/failure',
    );
  });
});
