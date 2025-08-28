# Todoist Recent Tasks Manager

A complete system for automatically managing "recent" labels on Todoist tasks, consisting of a real-time webhook service and a periodic maintenance service.

> **Note**: This project is new and doesn't have a lot of real-world testing yet. You may encounter bugs or unexpected behavior.

## Architecture

This project uses a two-service architecture for optimal performance and reliability:

### Services

1. **[Webhook Service](./webhook/)** (`webhook/`):
   - Receives real-time notifications from Todoist
   - Instantly adds labels when tasks are created or updated
   - Runs continuously as a web server
   - Handles webhook signature verification

2. **[Maintainer Service](./maintainer/)** (`maintainer/`):
   - Removes labels from tasks that are no longer "recent"
   - Runs periodically via cron jobs
   - Focuses only on cleanup (no adding labels)
   - Efficient API usage with targeted queries

## Features

- **🚀 Real-time Response**: Labels are added immediately when tasks change
- **🧹 Automatic Cleanup**: Stale labels are removed automatically
- **🔒 Secure**: Webhook signature verification ensures authenticity
- **📊 Efficient**: Minimal API calls through smart architecture
- **🐳 Docker Ready**: Both services include Docker support
- **📝 Comprehensive Logging**: Detailed logs for monitoring and debugging

## Quick Start

### 1. Prerequisites

- **Docker** this application is setup to run Deno applications in Docker containers
- **Todoist Account** with API access
- **Todoist App** configured for webhooks (for webhook service)

### 2. Get Your Credentials

**API Token:**
- Go to Todoist Settings → Integrations
- Copy your API token

**App Credentials (for webhooks):**
- Create an app at [App Management Console](https://app.todoist.com/app/settings/integrations/app-management)
- Configure webhook URL and events (`item:added`, `item:updated`)
- Copy your Client Secret

### 3. Deploy Services

**Webhook Service:**
```bash
cd webhook
docker build -t todoist-webhook .
docker run -p 8000:8000 \
  -e TODOIST_TOKEN="your_token" \
  -e CLIENT_SECRET="your_secret" \
  todoist-webhook
```

**Maintainer Service (with cron):**
```bash
cd maintainer
docker build -t todoist-maintainer .

# Add to crontab:
0 * * * * docker run --rm -e TODOIST_TOKEN="your_token" todoist-maintainer
```

## Configuration

Both services can be configured by modifying constants in their respective `main.ts` files:

- **`RECENTLY_CREATED_LABEL`**: Label for newly created tasks (default: "recently created")
- **`RECENTLY_UPDATED_LABEL`**: Label for updated tasks (default: "recently updated")
- **`RECENT_THRESHOLD_HOURS`**: Hours to consider recent (default: 24)

## Label Behavior

### "Recently Created" Label
- **Added**: When a task is created (webhook service)
- **Removed**: After 24 hours (maintainer service)

### "Recently Updated" Label  
- **Added**: When a task is updated (webhook service)
- **Removed**: After 24 hours since last update (maintainer service)

### Label Preservation
- Existing labels on tasks are always preserved
- Only the specific "recent" labels are managed
- Labels are created automatically if they don't exist

## Monitoring

### Webhook Service
- **Health Check**: `GET /health`
- **Logs**: Detailed request/response logging
- **Metrics**: Request counts, processing times

### Maintainer Service
- **Logs**: Task processing statistics
- **Output**: Number of labels cleaned up
- **Errors**: Failed API calls and reasons

## Development

### Webhook application 

While you can build the docker container and run it, running with Deno is going to increase your feedback loop speed.

```bash
$> cd webhook 

$> TODOIST_TOKEN="<your token here>" \
CLIENT_SECRET="<your secret here>" \
deno task run 
```

Now that the application is running, setup a public tunnel so the Todoist API can talk to your local application. Use something like ngrok or cloudflared. 

```bash 
$> cloudflared tunnel --url localhost:8000
```

Lastly, update your Todoist application webhook URL to point to the public tunnel URL.

### Maintainer application 

```bash 
$> cd maintainer
$> docker build -t todoist-maintainer .
$> docker run --rm -e TODOIST_TOKEN="<your token here>" todoist-maintainer
```

### Running Tests

At this time, testing of this application is done by running the server and QA testing using the Todoist API. 

### Type Checking

```bash
# Both services support type checking
deno task check
```

