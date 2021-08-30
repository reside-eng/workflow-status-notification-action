export enum Inputs {
    CurrentStatus = "current-status",
    SlackChannel = "slack-channel",
    SlackWebhook = "slack-webhook",
    GithubToken = "github-token",
    UploadChunkSize = "upload-chunk-size",
    Key = "key",
    Path = "path",
    RestoreKeys = "restore-keys",
}

export enum Outputs {
    CacheHit = "cache-hit"
}

export enum State {
    CachePrimaryKey = "CACHE_KEY",
    CacheMatchedKey = "CACHE_RESULT"
}

export enum Events {
    Key = "GITHUB_EVENT_NAME",
    Push = "push",
    PullRequest = "pull_request"
}

export const RefKey = "GITHUB_REF";
