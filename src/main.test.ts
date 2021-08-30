import { join } from 'path';
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as exec from '@actions/exec';
import * as cache from '@actions/cache';
import fse from 'fs-extra';
import { PayloadRepository } from '@actions/github/lib/interfaces';
import { WebhookPayload } from '@actions/github/lib/interfaces';
import run from './main';

jest.mock('@actions/core');
jest.mock('@actions/github');
jest.mock('@actions/exec');
jest.mock('@actions/cache');

interface MockObj {
  inputs: Record<string, string | undefined>;
  repo: string;
  workflow: string;
  runId: number;
  head_ref: string;
  sha: string;
  ref: string;
  eventName: string;
  actor: string;
  serverUrl: string;
}

let mock: MockObj;

const autPath = join(process.cwd(), 'aut');
const expectedSuccess = 'Tag "v0.0.0-pass" is available to use.';
const mockCore = core as jest.Mocked<typeof core>;

describe('@reside-eng/workflow-status-slack-notification', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mock = {
      // Default action inputs
      inputs: {
        'current-status': 'success',
        'slack-channel': 'test-channel',
        'slack-webhook': 'test-webhook',
        'github-token': 'test-token',
      },
      repo: 'workflow-status-slack-notification',
      workflow: 'Verify',
      runId: 23456,
      head_ref: 'test-ci',
      sha: 'af3ec70',
      ref: 'af3ec704b410630b7fb60b458a4c0aff261959b4',
      eventName: 'pull_request',
      actor: 'camacho',
      serverUrl: 'https://github.com',
    };

    // All tests will work under the AUT directory
    process.env.GITHUB_WORKSPACE = join(process.cwd(), 'aut');

    mockCore.getInput.mockImplementation(
      (name: string): string =>
        // console.log('name:', name);
        mock.inputs[name] || '',
    );

    // Setting to this Github repo by default
    (github.context.payload.repository as Partial<PayloadRepository>) = {
      clone_url: mock.repo,
    };
    (github.context.repo.repo as string) = mock.repo;
    (github.context.workflow as string) = mock.workflow;
    (github.context.runId as number) = mock.runId;
    (github.context.payload.pull_request as Partial<PayloadRepository>) = {
      head: {
        ref: mock.head_ref
      }
    };
    (github.context.sha as string) = mock.sha;
    (github.context.ref as string) = mock.ref;
    (github.context.eventName as string) = mock.eventName;
    (github.context.actor as string) = mock.actor;
    (github.context.serverUrl as string) = mock.serverUrl;
  });

  afterEach(async () => {
    delete process.env.GITHUB_WORKSPACE;
  });

  it('should run with default action inputs', async () => {
    await run();
    expect(mockCore.info).toHaveBeenCalledWith(expectedSuccess);
    expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
  });

  it('should fail if the package.json file can not be found', async () => {
    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(1);
    expect(mockCore.setFailed.mock.calls[0][0]).toMatch(
      'ENOENT: no such file or directory',
    );
  });

  it('should fail if no version is found in package.json', async () => {
    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(1);
    expect(mockCore.setFailed.mock.calls[0][0]).toMatch(/Missing "version"/);
  });

  it('should fail if a tag already exists', async () => {
    await run();
    expect(mockCore.setFailed).toHaveBeenCalledTimes(1);
    expect(mockCore.setFailed.mock.calls[0][0]).toMatch(
      /Tag .* already exists/,
    );
  });

  describe('package-directory input', () => {
    it('should support a path with no slashes in path', async () => {
      mock.inputs['package-directory'] = 'nested';

      await run();

      expect(mockCore.info).toHaveBeenCalledWith(expectedSuccess);
      expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    });

    it('should support a path with ./ prepended', async () => {
      mock.inputs['package-directory'] = './nested';

      await run();

      expect(mockCore.info).toHaveBeenCalledWith(expectedSuccess);
      expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    });

    it('should support a trailing slash (/)', async () => {
      mock.inputs['package-directory'] = 'nested/';

      await run();

      expect(mockCore.info).toHaveBeenCalledWith(expectedSuccess);
      expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    });
  });

  describe('tag-format input', () => {
    it('should support a modified format', async () => {
      mock.inputs['tag-format'] = 'ima-$version-custom';
      // Purposely use the failing package.json to prove that the tag-format has
      // changed
      await fse.copy(join(autPath, 'package-fail.json'), packagePath);

      await run();

      expect(mockCore.info).toHaveBeenCalledWith(
        `Tag "ima-0.0.0-integration-test-custom" is available to use.`,
      );
      expect(mockCore.setFailed).toHaveBeenCalledTimes(0);
    });

    it('should fail if missing the REQUIRED_TAG_FORMAT minimal requirements', async () => {
      mock.inputs['tag-format'] = 'missing';
      await fse.copy(join(autPath, 'package-pass.json'), packagePath);

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledTimes(1);
      expect(mockCore.setFailed.mock.calls[0][0]).toMatch(
        /tag-format is missing required .* pattern/,
      );
    });
  });
});
