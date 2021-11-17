# workflow-status-slack-notification

test
Github action that keeps track and retrieves previous workflow runs status for the same workflow on the same branch.
According to current and previous runs status, it will send a notification to a Slack channel using an Incoming webhook app.

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

    # Slack channel to send the notification to
    slack-channel: ''

    # Webhook URL with token for notifications
    #
    # Required: true
    slack-webhook: ''

    # Status of the current run
    #
    # Required: true
    github-token: ''

    # Current commit sha
    #
    # Required: true
    github-sha: ''
```
<!-- end usage -->

# Local Development

## Testing

To run your tests in watch mode, open up one terminal and run:

```sh
yarn tsc --watch
```

And in a second terminal, start up your tests in watch mode:

```sh
yarn test --watch
```

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE).
