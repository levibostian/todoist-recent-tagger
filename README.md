# Todoist Recent Tasks Labeler

A Deno script that automatically manages labels for recently created and recently updated tasks in Todoist. This script is designed to run periodically (e.g., via cron) to keep your task labels up-to-date.

## Features

- Automatically adds "recently created" labels to tasks created within the last 24 hours
- Automatically adds "recently updated" labels to tasks updated within the last 24 hours 
- Removes labels from tasks that are no longer recent
- Preserves existing labels on tasks
- Creates the required labels if they don't exist
- Rate-limited to avoid hitting API limits

## Prerequisites

- Deno v2.4 or later
- A Todoist account with API access
- Todoist API token

## Setup

1. **Get your Todoist API token:**
   - Go to Todoist Settings > Integrations
   - Find the "API token" section and copy your token

2. **Set environment variables:**
   ```bash
   export TODOIST_TOKEN="your_api_token_here"
   ```

3. **Install and verify Deno:**
   ```bash
   deno --version
   ```

## Usage

### Run via deno task:
```bash
deno task run
```

### Run tests:
```bash
deno task test
```

### Type check:
```bash
deno task check
```

## Configuration

You can modify these constants in `main.ts` to customize the behavior:

- `RECENTLY_CREATED_LABEL`: The label name for recently created tasks (default: "recently created")
- `RECENTLY_UPDATED_LABEL`: The label name for recently updated tasks (default: "recently updated") 
- `RECENT_THRESHOLD_HOURS`: Hours to consider a task "recent" (default: 24)

## Dependencies

- `@doist/todoist-api-typescript` - Official Todoist API client for node 

## License

MIT
