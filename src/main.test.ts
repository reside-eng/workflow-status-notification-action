import * as core from '@actions/core';
import { context } from '@actions/github';
import * as cache from '@actions/cache';
import { promises as fsp } from 'fs';
import { mocked } from 'ts-jest/utils';
import got from 'got';
import nock from 'nock';
import run from './main';

jest.mock('@actions/core');
jest.mock('@actions/cache');

interface MockObj {
  inputs: Record<string, string | undefined>;
  repo: {
    owner: string;
    repo: string;
  };
  workflow: string;
  prNumber: number;
  runId: number;
  headRef: string;
  ref: string;
  eventName: string;
  actor: string;
  serverUrl: string;
}

let mock: MockObj;

const mockCore = core as jest.Mocked<typeof core>;
const mockCache = cache as jest.Mocked<typeof cache>;
jest.mock('got');
const mockGot = mocked(got);
const mockFn = jest.fn();
mockGot.post = mockFn.bind({});

const slackUrl = 'https://hooks.slack.com';
const slackPath = '/services/test/test';

nock(slackUrl).persist().post(slackPath).reply(200);

/**
 *
 */
function setupMock() {
  jest.clearAllMocks();

  mock = {
    // Default action inputs
    inputs: {
      'current-status': 'success',
      'slack-webhook': `${slackUrl}${slackPath}`,
      'github-token': `${process.env.GITHUB_TOKEN}`,
    },
    repo: {
      owner: 'reside-eng',
      repo: 'workflow-status-slack-notification',
    },
    workflow: 'Failure workflow (for test purpose only)',
    prNumber: 4,
    runId: 23456,
    headRef: 'main',
    ref: 'main',
    eventName: 'pull_request',
    actor: 'workflowactor',
    serverUrl: 'https://github.com',
  };

  mockCore.getInput.mockImplementation(
    (name: string): string => mock.inputs[name] || '',
  );

  mockCache.restoreCache.mockImplementation(
    async (): Promise<string | undefined> => {
      try {
        await fsp.readFile('last-run-status', 'utf8');
        return 'test';
      } catch (err) {
        return undefined;
      }
    },
  );

  // Setting to this Github repo by default
  context.payload.repository = {
    name: mock.repo.repo,
    owner: {
      login: mock.actor,
    },
    clone_url: mock.repo,
  };
  context.workflow = mock.workflow;
  context.runId = mock.runId;
  context.payload.pull_request = {
    number: mock.prNumber,
    head: {
      ref: mock.headRef,
    },
  };
  context.ref = mock.ref;
  context.eventName = mock.eventName;
  context.actor = mock.actor;
  context.serverUrl = mock.serverUrl;
}

/**
 *
 */
async function writeStatusToCache() {
  fsp.writeFile('last-run-status', `completed/failure`, {
    encoding: 'utf8',
  });
}

/**
 *
 */
async function cleanCache() {
  fsp.unlink('last-run-status');
}

// Test using cache only to retrieve previous status (re-run workflow behavior)
describe('last run status retrieved from cache (re-run workflow behavior)', () => {
  beforeEach(() => setupMock());

  beforeAll(() => writeStatusToCache());

  afterAll(() => cleanCache());

  it('should send success notification if last run failed and current succeeded', async () => {
    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockFn).toBeCalledTimes(1);
    expect(mockFn.mock.calls[0][0]).toStrictEqual(mock.inputs['slack-webhook']);
    expect(mockFn.mock.calls[0][1]).toMatchInlineSnapshot(`
      Object {
        "json": Object {
          "attachments": Array [
            Object {
              "author_icon": "https://github.com/workflowactor.png?size=32",
              "author_link": "https://github.com/workflowactor",
              "author_name": "workflowactor",
              "color": "good",
              "fields": Array [
                Object {
                  "short": true,
                  "title": "Repository",
                  "value": "workflow-status-slack-notification",
                },
                Object {
                  "short": true,
                  "title": "Branch",
                  "value": "main",
                },
                Object {
                  "short": true,
                  "title": "Action URL",
                  "value": "<https://github.com/reside-eng/workflow-status-slack-notification/actions/runs/23456|Failure workflow (for test purpose only)>",
                },
                Object {
                  "short": true,
                  "title": "Event",
                  "value": "pull_request",
                },
                Object {
                  "short": false,
                  "title": "Failure workflow (for test purpose only) workflow success",
                  "value": "Previously failing Failure workflow (for test purpose only) workflow in workflow-status-slack-notification succeeded.",
                },
              ],
            },
          ],
          "icon_emoji": ":bangbang:",
        },
      }
    `);
  });

  it('should not send notification if last run succeeded and current succeeded', async () => {
    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockFn).toBeCalledTimes(0);
  });

  it('should send failure notification if last run succeeded and current fails', async () => {
    mock.inputs['current-status'] = 'failure';

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockFn).toBeCalledTimes(1);
    expect(mockFn.mock.calls[0][0]).toStrictEqual(mock.inputs['slack-webhook']);
    expect(mockFn.mock.calls[0][1]).toMatchInlineSnapshot(`
      Object {
        "json": Object {
          "attachments": Array [
            Object {
              "author_icon": "https://github.com/workflowactor.png?size=32",
              "author_link": "https://github.com/workflowactor",
              "author_name": "workflowactor",
              "color": "danger",
              "fields": Array [
                Object {
                  "short": true,
                  "title": "Repository",
                  "value": "workflow-status-slack-notification",
                },
                Object {
                  "short": true,
                  "title": "Branch",
                  "value": "main",
                },
                Object {
                  "short": true,
                  "title": "Action URL",
                  "value": "<https://github.com/reside-eng/workflow-status-slack-notification/actions/runs/23456|Failure workflow (for test purpose only)>",
                },
                Object {
                  "short": true,
                  "title": "Event",
                  "value": "pull_request",
                },
                Object {
                  "short": false,
                  "title": "Failure workflow (for test purpose only) workflow failure",
                  "value": "Failure workflow (for test purpose only) workflow in workflow-status-slack-notification failed.",
                },
              ],
            },
          ],
          "icon_emoji": ":bangbang:",
        },
      }
    `);
  });

  it('should not send notification if last run failed and current fails', async () => {
    mock.inputs['current-status'] = 'failure';

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockFn).toBeCalledTimes(0);
  });

  it('not a pull_request: should send success notification if last run failed and current succeeded', async () => {
    context.payload.pull_request = undefined;
    context.eventName = 'workflow_dispatch';

    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockFn).toBeCalledTimes(1);
    expect(mockFn.mock.calls[0][0]).toStrictEqual(mock.inputs['slack-webhook']);
    expect(mockFn.mock.calls[0][1]).toMatchInlineSnapshot(`
      Object {
        "json": Object {
          "attachments": Array [
            Object {
              "author_icon": "https://github.com/workflowactor.png?size=32",
              "author_link": "https://github.com/workflowactor",
              "author_name": "workflowactor",
              "color": "good",
              "fields": Array [
                Object {
                  "short": true,
                  "title": "Repository",
                  "value": "workflow-status-slack-notification",
                },
                Object {
                  "short": true,
                  "title": "Branch",
                  "value": "main",
                },
                Object {
                  "short": true,
                  "title": "Action URL",
                  "value": "<https://github.com/reside-eng/workflow-status-slack-notification/actions/runs/23456|Failure workflow (for test purpose only)>",
                },
                Object {
                  "short": true,
                  "title": "Event",
                  "value": "workflow_dispatch",
                },
                Object {
                  "short": false,
                  "title": "Failure workflow (for test purpose only) workflow success",
                  "value": "Previously failing Failure workflow (for test purpose only) workflow in workflow-status-slack-notification succeeded.",
                },
              ],
            },
          ],
          "icon_emoji": ":bangbang:",
        },
      }
    `);
  });
});

// Test using GH CLI to retrieve previous status (new commit workflow behavior)
describe('last run status retrieved from GH CLI (new commit workflow behavior)', () => {
  beforeEach(() => setupMock());

  afterEach(() => cleanCache());

  it('should send success notification if last run failed and current succeeded', async () => {
    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockFn).toBeCalledTimes(1);
    expect(mockFn.mock.calls[0][1]).toMatchInlineSnapshot(`
      Object {
        "json": Object {
          "attachments": Array [
            Object {
              "author_icon": "https://github.com/workflowactor.png?size=32",
              "author_link": "https://github.com/workflowactor",
              "author_name": "workflowactor",
              "color": "good",
              "fields": Array [
                Object {
                  "short": true,
                  "title": "Repository",
                  "value": "workflow-status-slack-notification",
                },
                Object {
                  "short": true,
                  "title": "Branch",
                  "value": "main",
                },
                Object {
                  "short": true,
                  "title": "Action URL",
                  "value": "<https://github.com/reside-eng/workflow-status-slack-notification/actions/runs/23456|Failure workflow (for test purpose only)>",
                },
                Object {
                  "short": true,
                  "title": "Event",
                  "value": "pull_request",
                },
                Object {
                  "short": false,
                  "title": "Failure workflow (for test purpose only) workflow success",
                  "value": "Previously failing Failure workflow (for test purpose only) workflow in workflow-status-slack-notification succeeded.",
                },
              ],
            },
          ],
          "icon_emoji": ":bangbang:",
        },
      }
    `);
  });

  it('should not send notification if last run succeeded and current succeeded', async () => {
    context.workflow = 'Success workflow (for test purpose only)';

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockFn).toBeCalledTimes(0);
  });

  it('should send failure notification if last run succeeded and current fails', async () => {
    context.workflow = 'Success workflow (for test purpose only)';
    mock.inputs['current-status'] = 'failure';

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockFn).toBeCalledTimes(1);
    expect(mockFn.mock.calls[0][1]).toMatchInlineSnapshot(`
      Object {
        "json": Object {
          "attachments": Array [
            Object {
              "author_icon": "https://github.com/workflowactor.png?size=32",
              "author_link": "https://github.com/workflowactor",
              "author_name": "workflowactor",
              "color": "danger",
              "fields": Array [
                Object {
                  "short": true,
                  "title": "Repository",
                  "value": "workflow-status-slack-notification",
                },
                Object {
                  "short": true,
                  "title": "Branch",
                  "value": "main",
                },
                Object {
                  "short": true,
                  "title": "Action URL",
                  "value": "<https://github.com/reside-eng/workflow-status-slack-notification/actions/runs/23456|Success workflow (for test purpose only)>",
                },
                Object {
                  "short": true,
                  "title": "Event",
                  "value": "pull_request",
                },
                Object {
                  "short": false,
                  "title": "Success workflow (for test purpose only) workflow failure",
                  "value": "Success workflow (for test purpose only) workflow in workflow-status-slack-notification failed.",
                },
              ],
            },
          ],
          "icon_emoji": ":bangbang:",
        },
      }
    `);
  });

  it('should not send notification if last run failed and current fails', async () => {
    mock.inputs['current-status'] = 'failure';

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockFn).toBeCalledTimes(0);
  });

  it('not a pull_request: should send success notification if last run failed and current succeeded', async () => {
    context.payload.pull_request = undefined;
    context.eventName = 'workflow_dispatch';

    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockFn.mock.calls.length).toStrictEqual(1);
    expect(mockFn.mock.calls[0][1]).toMatchInlineSnapshot(`
      Object {
        "json": Object {
          "attachments": Array [
            Object {
              "author_icon": "https://github.com/workflowactor.png?size=32",
              "author_link": "https://github.com/workflowactor",
              "author_name": "workflowactor",
              "color": "good",
              "fields": Array [
                Object {
                  "short": true,
                  "title": "Repository",
                  "value": "workflow-status-slack-notification",
                },
                Object {
                  "short": true,
                  "title": "Branch",
                  "value": "main",
                },
                Object {
                  "short": true,
                  "title": "Action URL",
                  "value": "<https://github.com/reside-eng/workflow-status-slack-notification/actions/runs/23456|Failure workflow (for test purpose only)>",
                },
                Object {
                  "short": true,
                  "title": "Event",
                  "value": "workflow_dispatch",
                },
                Object {
                  "short": false,
                  "title": "Failure workflow (for test purpose only) workflow success",
                  "value": "Previously failing Failure workflow (for test purpose only) workflow in workflow-status-slack-notification succeeded.",
                },
              ],
            },
          ],
          "icon_emoji": ":bangbang:",
        },
      }
    `);
  });
});

// Test inputs format
describe('inputs format', () => {
  beforeEach(() => setupMock());

  beforeAll(() => writeStatusToCache());

  afterAll(() => cleanCache());

  it('should not fail with expected inputs format', async () => {
    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockFn).toBeCalledTimes(1);
  });

  it('should fail with wrong current status value', async () => {
    mock.inputs['current-status'] = 'notgood';
    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(1);
    expect(mockFn).toBeCalledTimes(0);
  });

  it('should fail with wrong slack webhook format', async () => {
    mock.inputs['slack-webhook'] = 'htp:/hooks.slack.com/services/test/test';
    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(1);
    expect(mockCore.setFailed.mock.calls[0][0]).toMatchInlineSnapshot(
      `"Wrong Slack Webhook URL format"`,
    );
    expect(mockFn).toBeCalledTimes(0);
  });
});
