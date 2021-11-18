# Workflow Status Slack Notification Action

> Github action that keeps track and retrieves previous workflow runs status for the same workflow on the same branch.
> According to current and previous runs status, it will send a notification to a Slack channel using an Incoming webhook app.

## How it works

At the end of a workflow, on success() and on failure(), call this action with the current status as a parameter (success/failure).
This action will first check the previous workflow status and will send a Slack notification according to the current workflow status.
Status is retrieved from cache if the current workflow has already run previously (from `re-run all jobs` button for example).
If it's the first time this workflow runs, this action will retrieve previous workflow status on the same branch with `gh` cli using provided `github-token`.

It'll compare last/current workflow status and will send a notification to Slack if:

- Current status is `failure` and it's the first time this workflow runs for the current branch.
- Current status is `failure` and previous run status was `success`.
- Current status is `success` and previous run status was `failure`.

## Notes

You need to define this secret:
YOUR_SLACK_WEBHOOK: Webhook URL from Slack Incoming Webhook application

# Usage

<!-- start usage -->
<!-- Warning: Content between these comments is auto-generated. Do NOT manually edit. -->
```yaml
- uses: reside-eng/workflow-status-slack-notification@v1
  with:
    # Status of the current run
    #
    # Default: failure
    # Required: true
    current-status: ''

    # Webhook URL with token for notifications
    #
    # Required: true
    slack-webhook: ''

    # Status of the current run
    #
    # Required: true
    github-token: ''
```
<!-- end usage -->

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
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v2

      # Your steps...

  success-notification:
    if: success()
    name: success-notification
    needs: [build]
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v2.3.4

      - uses: reside-eng/workflow-status-slack-notification@v1.0.7
        with:
          current-status: "success"
          slack-webhook: "${{ secrets.YOUR_SLACK_WEBHOOK }}"
          github-token: "${{ secrets.GITHUB_TOKEN }}"

  failure-notification:
    if: failure()
    name: failure-notification
    needs: [build]
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v2.3.4

      - uses: reside-eng/workflow-status-slack-notification@v1.0.7
        with:
          current-status: "failure"
          slack-webhook: "${{ secrets.YOUR_SLACK_WEBHOOK }}"
          github-token: "${{ secrets.GITHUB_TOKEN }}"
```

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE).
