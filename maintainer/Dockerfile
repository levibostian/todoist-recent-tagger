# Build stage - compile Deno to binary
FROM denoland/deno:2.1.4 AS builder

# Set working directory
WORKDIR /app

# Copy source files
COPY deno.json deno.lock ./
COPY main.ts ./

# Cache dependencies and check types
RUN deno cache main.ts

# Compile to binary
RUN deno compile \
    --allow-net \
    --allow-env \
    --output todoist-recent \
    main.ts

# Runtime stage - minimal image with just the binary
FROM debian:bookworm-slim

# Copy the compiled binary from the builder stage
COPY --from=builder /app/todoist-recent /usr/local/bin/todoist-recent

# Make the binary executable
RUN chmod +x /usr/local/bin/todoist-recent

# Set environment variable
ENV TODOIST_TOKEN=""

# Run the binary directly
ENTRYPOINT ["/usr/local/bin/todoist-recent"]
