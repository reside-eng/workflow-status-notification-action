# Workflow Status Slack Notification Action

> Github action that keeps track and retrieves previous workflow runs status for the same workflow on the same branch. 
  According to current and previous runs status, it will send a notification to a Slack channel using an Incoming webhook app.

## How it works

At the end of a workflow, on success() and on failure(), call this action with the current status as a parameter (success/failure).
This action will first check the previous status and according to the current status. It will send a notification to Slack if:
- Current status is `failure` and it's the first time this workflow runs for the current branch.
- Current status is `failure` and previous run status was `success`.
- Current status is `success` and previous run status was `failure`.


## Notes

You need to define this secret:
SLACK_WEBHOOK: Webhook URL from Slack Incoming Webhook application

## Examples

### Basic

```yaml
name: Build

on:
  pull_request:
    branches:
      - main

jobs:
  build:
    name: build
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest]
        node-version: [14.x]
    steps:
      - name: Checkout code
        uses: actions/checkout@v2

      # Your steps...


  success-notification:
    if: success()
    name: success-notification
    needs: [build]
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest]
    steps:
      - name: Checkout Code
        uses: actions/checkout@v2.3.4

      - id: foo
        uses: actions/workflow-status-slack-notification@v1
        with:
          current-status: 'success'

  failure-notification:
    if: failure()
    name: failure-notification
    needs: [build]
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest]
    steps:
      - name: Checkout Code
        uses: actions/checkout@v2.3.4

      - id: foo
        uses: actions/workflow-status-slack-notification@v1
        with:
          current-status: 'failure'

```
