FROM denoland/deno:2.4.2

# Create app directory
WORKDIR /app

# Copy dependency files first for better caching
COPY deno.json ./

# Install dependencies
RUN deno cache --lock-write deno.json

# Copy source code
COPY main.ts ./
COPY README.md ./

# Create a non-root user to run our application
RUN groupadd --gid 1001 todoistwebhook \
  && useradd --uid 1001 --gid todoistwebhook --shell /bin/bash --create-home todoistwebhook \
  && chown -R todoistwebhook:todoistwebhook /app

# Switch to non-root user
USER todoistwebhook

# Expose the port the app runs on
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["deno", "task", "run"]
