# Builder stage
FROM denoland/deno:2.4.2 AS builder

# Create app directory
WORKDIR /app

# Copy dependency files first for better caching
COPY deno.json ./
COPY deno.lock ./

# Copy source code
COPY main.ts ./

# Compile the application to a binary
RUN deno task compile

# Runtime stage
FROM debian:bookworm-slim AS runtime

# Create app directory
WORKDIR /app

# Create a non-root user to run our application
RUN groupadd --gid 1001 todoistmaintainer \
  && useradd --uid 1001 --gid todoistmaintainer --shell /bin/bash --create-home todoistmaintainer \
  && chown -R todoistmaintainer:todoistmaintainer /app

# Copy the compiled binary from builder stage
COPY --from=builder /app/todoist-recent ./todoist-recent

# Make binary executable and change ownership
RUN chmod +x ./todoist-recent && chown todoistmaintainer:todoistmaintainer ./todoist-recent

# Switch to non-root user
USER todoistmaintainer

# Run the compiled binary
CMD ["./todoist-recent"]
