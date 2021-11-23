import * as core from '@actions/core';
import * as github from '@actions/github';
import * as cache from '@actions/cache';
import * as fs from 'fs';
import nock from 'nock';
import { PayloadRepository } from '@actions/github/lib/interfaces';
import run from './main';

jest.mock('@actions/core');
jest.mock('@actions/cache');

// interface MockObj {
//   inputs: Record<string, string | undefined>;
//   context: Context;
// }

interface MockObj {
  inputs: Record<string, string | undefined>;
  repo: {
    owner: string;
    repo: string;
  };
  workflow: string;
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

const slackUrl = 'https://hooks.slack.com';
const slackPath = '/services/test/test';

nock(slackUrl).persist().post(slackPath).reply(200);

// function setupMock () {
//   jest.clearAllMocks();

//   mock = {
//     // Default action inputs
//     inputs: {
//       'current-status': 'success',
//       'slack-webhook': `${slackUrl}${slackPath}`,
//       'github-token': `${process.env.GITHUB_TOKEN}`,
//     },
//     context: {
//       workflow: 'Failure workflow (for test purpose only)',
//       runId: 23456,
//       payload: {
//         repository: {
//           name: 'test',
//           owner: {
//             login: 'login'
//           },
//           clone_url: {
//             owner: 'reside-eng',
//             repo: 'workflow-status-slack-notification',
//           },
//         },
//         pull_request: {
//           number: 4,
//           head: {
//             ref: 'main',
//           },
//         },
//       },
//       ref: 'main',
//       eventName: 'pull_request',
//       actor: 'workflowactor',
//       serverUrl: 'https://github.com',
//       sha: 'bcbe896219b8390df78b7d43c00a7e679d7da429',
//       action: 'Failure workflow (for test purpose only)',
//       job: 'build',
//       runNumber: 12,
//       apiUrl: 'https://api.github.com',
//       graphqlUrl: 'https://api.github.com/graphql',
//       issue: {
//         owner: 'workflowactor',
//         repo: 'workflow-status-slack-notification',
//         number: 1,
//       },
//       repo: {
//         owner: 'reside-eng',
//         repo: 'workflow-status-slack-notification',
//       },
//     }
//   };

//   mockCore.getInput.mockImplementation(
//     (name: string): string => mock.inputs[name] || '',
//   );

//   mockCache.restoreCache.mockImplementation(
//     (): Promise<string | undefined> =>
//       new Promise((resolve) => {
//         if (fs.existsSync('last-run-status')) {
//           resolve('test');
//         } else {
//           resolve(undefined);
//         }
//       }),
//   );

//   // Setting to this Github repo by default
//   (github.context as Context) = mock.context;
// }

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
    (): Promise<string | undefined> =>
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
  github.context.workflow = mock.workflow;
  github.context.runId = mock.runId;
  (github.context.payload.pull_request as Partial<PayloadRepository>) = {
    head: {
      ref: mock.headRef,
    },
  };
  github.context.ref = mock.ref;
  github.context.eventName = mock.eventName;
  github.context.actor = mock.actor;
  github.context.serverUrl = mock.serverUrl;
}

// Test using cache only to retrieve previous status (re-run workflow behavior)
describe('last run status retrieved from cache (re-run workflow behavior)', () => {
  beforeEach(() => setupMock());

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

  it('should send success notification if last run failed and current succeeded', async () => {
    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockCore.info).toHaveBeenCalledWith('Current run status: success');
    expect(mockCore.info).toHaveBeenCalledWith('Success notification');
    expect(mockCore.info).toHaveBeenCalledWith(
      'Last run status: completed/failure',
    );
    expect(mockCore.info).toHaveBeenCalledWith(
      'Message body: {"icon_emoji":":bangbang:","attachments":[{"color":"good","author_name":"workflowactor","author_link":"https://github.com/workflowactor","author_icon":"https://github.com/workflowactor.png?size=32","fields":[{"title":"Repository","value":"workflow-status-slack-notification","short":true},{"title":"Branch","value":"main","short":true},{"title":"Action URL","value":"<https://github.com/reside-eng/workflow-status-slack-notification/actions/runs/23456|Failure workflow (for test purpose only)>","short":true},{"title":"Event","value":"pull_request","short":true},{"title":"Failure workflow (for test purpose only) workflow success","value":"Previously failing Failure workflow (for test purpose only) workflow in workflow-status-slack-notification succeed.","short":false}]}]}',
    );
  });

  it('should not send notification if last run succeeded and current succeeded', async () => {
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
      'Message body: {"icon_emoji":":bangbang:","attachments":[{"color":"danger","author_name":"workflowactor","author_link":"https://github.com/workflowactor","author_icon":"https://github.com/workflowactor.png?size=32","fields":[{"title":"Repository","value":"workflow-status-slack-notification","short":true},{"title":"Branch","value":"main","short":true},{"title":"Action URL","value":"<https://github.com/reside-eng/workflow-status-slack-notification/actions/runs/23456|Failure workflow (for test purpose only)>","short":true},{"title":"Event","value":"pull_request","short":true},{"title":"Failure workflow (for test purpose only) workflow failure","value":"Failure workflow (for test purpose only) workflow in workflow-status-slack-notification failed.","short":false}]}]}',
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

  it('not a pull_request: should send success notification if last run failed and current succeeded', async () => {
    github.context.payload.pull_request = undefined;
    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockCore.info).toHaveBeenCalledWith('Current run status: success');
    expect(mockCore.info).toHaveBeenCalledWith('Success notification');
    expect(mockCore.info).toHaveBeenCalledWith(
      'Last run status: completed/failure',
    );
    expect(mockCore.info).toHaveBeenCalledWith(
      'Message body: {"icon_emoji":":bangbang:","attachments":[{"color":"good","author_name":"workflowactor","author_link":"https://github.com/workflowactor","author_icon":"https://github.com/workflowactor.png?size=32","fields":[{"title":"Repository","value":"workflow-status-slack-notification","short":true},{"title":"Branch","value":"main","short":true},{"title":"Action URL","value":"<https://github.com/reside-eng/workflow-status-slack-notification/actions/runs/23456|Failure workflow (for test purpose only)>","short":true},{"title":"Event","value":"pull_request","short":true},{"title":"Failure workflow (for test purpose only) workflow success","value":"Previously failing Failure workflow (for test purpose only) workflow in workflow-status-slack-notification succeed.","short":false}]}]}',
    );
  });
});

// Test using GH CLI to retrieve previous status (new commit workflow behavior)
describe('last run status retrieved from GH CLI (new commit workflow behavior)', () => {
  beforeEach(() => setupMock());

  afterEach(() => {
    delete process.env.GITHUB_WORKSPACE;
    fs.unlink('last-run-status', (err) => {
      if (err) {
        console.log('no cached status');
      }
    });
  });

  it('should send success notification if last run failed and current succeeded', async () => {
    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockCore.info).toHaveBeenCalledWith('Current run status: success');
    expect(mockCore.info).toHaveBeenCalledWith('Success notification');
    expect(mockCore.info).toHaveBeenCalledWith(
      'Last run status: completed/failure',
    );
    expect(mockCore.info).toHaveBeenCalledWith(
      'Message body: {"icon_emoji":":bangbang:","attachments":[{"color":"good","author_name":"workflowactor","author_link":"https://github.com/workflowactor","author_icon":"https://github.com/workflowactor.png?size=32","fields":[{"title":"Repository","value":"workflow-status-slack-notification","short":true},{"title":"Branch","value":"main","short":true},{"title":"Action URL","value":"<https://github.com/reside-eng/workflow-status-slack-notification/actions/runs/23456|Failure workflow (for test purpose only)>","short":true},{"title":"Event","value":"pull_request","short":true},{"title":"Failure workflow (for test purpose only) workflow success","value":"Previously failing Failure workflow (for test purpose only) workflow in workflow-status-slack-notification succeed.","short":false}]}]}',
    );
  });

  it('should not send notification if last run succeeded and current succeeded', async () => {
    github.context.workflow = 'Success workflow (for test purpose only)';

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockCore.info).toHaveBeenCalledWith('Current run status: success');
    expect(mockCore.info).toHaveBeenCalledWith('No notification needed');
    expect(mockCore.info).toHaveBeenCalledWith(
      'Last run status: completed/success',
    );
  });

  it('should send failure notification if last run succeeded and current fails', async () => {
    github.context.workflow = 'Success workflow (for test purpose only)';
    mock.inputs['current-status'] = 'failure';

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockCore.info).toHaveBeenCalledWith('Current run status: failure');
    expect(mockCore.info).toHaveBeenCalledWith('Failure notification');
    expect(mockCore.info).toHaveBeenCalledWith(
      'Last run status: completed/success',
    );
    expect(mockCore.info).toHaveBeenCalledWith(
      'Message body: {"icon_emoji":":bangbang:","attachments":[{"color":"danger","author_name":"workflowactor","author_link":"https://github.com/workflowactor","author_icon":"https://github.com/workflowactor.png?size=32","fields":[{"title":"Repository","value":"workflow-status-slack-notification","short":true},{"title":"Branch","value":"main","short":true},{"title":"Action URL","value":"<https://github.com/reside-eng/workflow-status-slack-notification/actions/runs/23456|Success workflow (for test purpose only)>","short":true},{"title":"Event","value":"pull_request","short":true},{"title":"Success workflow (for test purpose only) workflow failure","value":"Success workflow (for test purpose only) workflow in workflow-status-slack-notification failed.","short":false}]}]}',
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

  it('not a pull_request: should send success notification if last run failed and current succeeded', async () => {
    github.context.payload.pull_request = undefined;
    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    expect(mockCore.info).toHaveBeenCalledWith('Current run status: success');
    expect(mockCore.info).toHaveBeenCalledWith('Success notification');
    expect(mockCore.info).toHaveBeenCalledWith(
      'Last run status: completed/failure',
    );
    expect(mockCore.info).toHaveBeenCalledWith(
      'Message body: {"icon_emoji":":bangbang:","attachments":[{"color":"good","author_name":"workflowactor","author_link":"https://github.com/workflowactor","author_icon":"https://github.com/workflowactor.png?size=32","fields":[{"title":"Repository","value":"workflow-status-slack-notification","short":true},{"title":"Branch","value":"main","short":true},{"title":"Action URL","value":"<https://github.com/reside-eng/workflow-status-slack-notification/actions/runs/23456|Failure workflow (for test purpose only)>","short":true},{"title":"Event","value":"pull_request","short":true},{"title":"Failure workflow (for test purpose only) workflow success","value":"Previously failing Failure workflow (for test purpose only) workflow in workflow-status-slack-notification succeed.","short":false}]}]}',
    );
  });
});

// Test inputs format
describe('inputs format', () => {
  beforeEach(() => setupMock());

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

  it('should not fail with expected inputs format', async () => {
    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
  });

  it('should fail with wrong slack webhook format', async () => {
    mock.inputs['slack-webhook'] = 'htt:/hooks.slack.com/services/test/test';
    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(1);
  });

  it('should fail with wrong current status value', async () => {
    mock.inputs['current-status'] = 'notgood';
    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(1);
  });
});
