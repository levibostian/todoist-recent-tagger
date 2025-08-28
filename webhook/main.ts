#!/usr/bin/env deno

import { TodoistApi } from "@doist/todoist-api-typescript";
import type { Task, Label } from "@doist/todoist-api-typescript";

// Configuration constants
export const RECENTLY_CREATED_LABEL = "recently created";
export const RECENTLY_UPDATED_LABEL = "recently updated";
export const PORT = parseInt(Deno.env.get("PORT") || "8000");
export const CLIENT_SECRET = Deno.env.get("CLIENT_SECRET");
export const TODOIST_TOKEN = Deno.env.get("TODOIST_TOKEN");

// Initialize Todoist API client
let api: TodoistApi | undefined;
if (TODOIST_TOKEN) {
  api = new TodoistApi(TODOIST_TOKEN);
}

// Type definitions for webhook payloads
interface WebhookPayload {
  event_name: string;
  user_id: string;
  event_data: Task;
  version: string;
  initiator: {
    email: string;
    full_name: string;
    id: string;
    image_id: string;
    is_premium: boolean;
  };
  triggered_at: string;
  event_data_extra?: {
    old_item?: Task;
    update_intent?: string;
  };
}

/**
 * Verify webhook signature using HMAC-SHA256
 * Todoist sends the signature as a base64-encoded HMAC-SHA256 hash
 */
async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature_bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );

  // Convert the computed signature to base64
  const actualSignature = btoa(String.fromCharCode(...new Uint8Array(signature_bytes)));

  // Compare with the provided signature
  return actualSignature === signature;
}

/**
 * Get or create the required labels
 */
async function ensureLabelsExist(): Promise<{ createdLabel: Label; updatedLabel: Label }> {
  if (!api) {
    throw new Error("Todoist API client not initialized");
  }

  console.log("Fetching labels...");
  const labelsResponse = await api.getLabels();
  const labels = labelsResponse.results;
  
  // Find or create the required labels
  let recentlyCreatedLabel = labels.find((label: Label) => label.name === RECENTLY_CREATED_LABEL);
  let recentlyUpdatedLabel = labels.find((label: Label) => label.name === RECENTLY_UPDATED_LABEL);
  
  if (!recentlyCreatedLabel) {
    console.log(`Creating "${RECENTLY_CREATED_LABEL}" label...`);
    recentlyCreatedLabel = await api.addLabel({ name: RECENTLY_CREATED_LABEL });
  }
  
  if (!recentlyUpdatedLabel) {
    console.log(`Creating "${RECENTLY_UPDATED_LABEL}" label...`);
    recentlyUpdatedLabel = await api.addLabel({ name: RECENTLY_UPDATED_LABEL });
  }

  return {
    createdLabel: recentlyCreatedLabel,
    updatedLabel: recentlyUpdatedLabel
  };
}

/**
 * Add the "recently created" label to a task
 */
async function addRecentlyCreatedLabel(taskId: string) {
  if (!api) {
    throw new Error("Todoist API client not initialized");
  }

  try {
    const { createdLabel } = await ensureLabelsExist();
    
    // Get the current task to see existing labels
    const task = await api.getTask(taskId);
    const currentLabels = task.labels || [];
    
    // Add the created label if it's not already there
    if (!currentLabels.includes(createdLabel.name)) {
      const newLabels = [...currentLabels, createdLabel.name];
      await api.updateTask(taskId, { labels: newLabels });
      console.log(`Added "${RECENTLY_CREATED_LABEL}" label to task ${taskId}: "${task.content}"`);
    } else {
      console.log(`Task ${taskId} already has "${RECENTLY_CREATED_LABEL}" label`);
    }
  } catch (error) {
    console.error(`Failed to add recently created label to task ${taskId}:`, error);
  }
}

/**
 * Add the "recently updated" label to a task
 */
async function addRecentlyUpdatedLabel(taskId: string) {
  if (!api) {
    throw new Error("Todoist API client not initialized");
  }

  try {
    const { updatedLabel } = await ensureLabelsExist();
    
    // Get the current task to see existing labels
    const task = await api.getTask(taskId);
    const currentLabels = task.labels || [];
    
    // Add the updated label if it's not already there
    if (!currentLabels.includes(updatedLabel.name)) {
      const newLabels = [...currentLabels, updatedLabel.name];
      await api.updateTask(taskId, { labels: newLabels });
      console.log(`Added "${RECENTLY_UPDATED_LABEL}" label to task ${taskId}: "${task.content}"`);
    } else {
      console.log(`Task ${taskId} already has "${RECENTLY_UPDATED_LABEL}" label`);
    }
  } catch (error) {
    console.error(`Failed to add recently updated label to task ${taskId}:`, error);
  }
}

/**
 * Handle webhook payload
 */
async function handleWebhook(payload: WebhookPayload) {
  console.log(`Received webhook event: ${payload.event_name} for task ${payload.event_data.id}`);
  
  switch (payload.event_name) {
    case "item:added":
      await addRecentlyCreatedLabel(payload.event_data.id);
      break;
    
    case "item:updated": {
      // Only add the "recently updated" label if this was an actual user update
      // (not a completion of a recurring task or similar)
      const updateIntent = payload.event_data_extra?.update_intent;
      if (!updateIntent || updateIntent === "item_updated") {
        await addRecentlyUpdatedLabel(payload.event_data.id);
      }
      break;
    }
    
    default:
      console.log(`Ignoring webhook event: ${payload.event_name}`);
      break;
  }
}

/**
 * HTTP request handler
 */
async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  
  // Health check endpoint
  if (url.pathname === "/health") {
    return new Response("OK", { status: 200 });
  }
  
  // Webhook endpoint
  if (url.pathname === "/webhook" && request.method === "POST") {
    try {
      // Get the raw body for signature verification
      const body = await request.text();
      
      // Verify the webhook signature
      const signature = request.headers.get("X-Todoist-Hmac-SHA256");
      if (!signature) {
        console.error("Missing webhook signature");
        return new Response("Missing signature", { status: 401 });
      }

      const isValid = await verifyWebhookSignature(body, signature, CLIENT_SECRET!);
      if (!isValid) {
        console.error("Invalid webhook signature");
        return new Response("Invalid signature", { status: 401 });
      }

      // Parse the payload
      let payload: WebhookPayload;
      try {
        payload = JSON.parse(body);
      } catch (error) {
        console.error("Failed to parse webhook payload:", error);
        return new Response("Invalid JSON", { status: 400 });
      }

      // Handle the webhook
      await handleWebhook(payload);

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("Error handling webhook:", error);
      return new Response("Internal server error", { status: 500 });
    }
  }
  
  // Return 404 for all other requests
  return new Response("Not found", { status: 404 });
}

/**
 * Start the webhook server
 */
async function startServer() {
  console.log(`Starting webhook server on port ${PORT}...`);
  
  if (!CLIENT_SECRET) {
    console.error("Error: CLIENT_SECRET environment variable is required");
    Deno.exit(1);
  }
  
  if (!TODOIST_TOKEN) {
    console.error("Error: TODOIST_TOKEN environment variable is required");
    Deno.exit(1);
  }

  console.log("Environment variables configured:");
  console.log(`- PORT: ${PORT}`);
  console.log(`- CLIENT_SECRET: ${CLIENT_SECRET ? "***set***" : "not set"}`);
  console.log(`- TODOIST_TOKEN: ${TODOIST_TOKEN ? "***set***" : "not set"}`);

  try {
    // Test the API connection
    if (api) {
      console.log("Testing Todoist API connection...");
      await api.getLabels();
      console.log("✅ Todoist API connection successful");
    }
  } catch (error) {
    console.error("❌ Failed to connect to Todoist API:", error);
    Deno.exit(1);
  }

  console.log(`🚀 Webhook server listening on http://localhost:${PORT}`);
  console.log(`📝 Webhook endpoint: http://localhost:${PORT}/webhook`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);

  await Deno.serve({ port: PORT }, handler);
}

// Start the server if this script is run directly
if (import.meta.main) {
  await startServer();
}