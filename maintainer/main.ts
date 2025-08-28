#!/usr/bin/env deno

import { TodoistApi } from "@doist/todoist-api-typescript";
import type { Task, Label } from "@doist/todoist-api-typescript";

// Configuration constants
export const RECENTLY_CREATED_LABEL = "recently created";
export const RECENTLY_UPDATED_LABEL = "recently updated";
export const RECENT_THRESHOLD_HOURS = 24; // Tasks are considered recent if created/updated within last 24 hours

// Environment variables
const TODOIST_TOKEN = Deno.env.get("TODOIST_TOKEN");

// Only check for token when running as main script, not when importing
if (!TODOIST_TOKEN && import.meta.main) {
  console.error("Error: TODOIST_TOKEN environment variable is required");
  Deno.exit(1);
}

// Initialize Todoist API client (only if token is available)
let api: TodoistApi | undefined;
if (TODOIST_TOKEN) {
  api = new TodoistApi(TODOIST_TOKEN);
}

/**
 * Main function to remove task labels based on recent activity
 * Note: Label addition is now handled by the webhook service
 */
export async function main() {
  console.log("Starting Todoist recent tasks label cleanup process...");
  
  if (!api) {
    throw new Error("Todoist API client not initialized. Please set TODOIST_TOKEN environment variable.");
  }
  
  try {
    // Get current date threshold for "recent" tasks
    const now = new Date();
    const recentThreshold = new Date(now.getTime() - (RECENT_THRESHOLD_HOURS * 60 * 60 * 1000));
    
    console.log(`Threshold for recent tasks: ${recentThreshold.toISOString()}`);
    
    // Fetch labels to ensure our required labels exist
    console.log("Fetching labels...");
    const labelsResponse = await api.getLabels();
    const labels = labelsResponse.results;
    
    // Find the required labels
    const recentlyCreatedLabel = labels.find((label: Label) => label.name === RECENTLY_CREATED_LABEL);
    const recentlyUpdatedLabel = labels.find((label: Label) => label.name === RECENTLY_UPDATED_LABEL);
    
    if (!recentlyCreatedLabel && !recentlyUpdatedLabel) {
      console.log("No recent labels found to manage. Nothing to do.");
      return;
    }
    
    // Get tasks that currently have recent labels
    const tasksToCheck = new Map<string, Task>();
    
    if (recentlyCreatedLabel) {
      console.log(`Fetching tasks with "${RECENTLY_CREATED_LABEL}" label...`);
      const currentlyCreatedTasksResponse = await api.getTasks({ label: RECENTLY_CREATED_LABEL });
      const currentlyCreatedTasks = currentlyCreatedTasksResponse.results;
      currentlyCreatedTasks.forEach((task: Task) => {
        tasksToCheck.set(task.id, task);
      });
    }
    
    if (recentlyUpdatedLabel) {
      console.log(`Fetching tasks with "${RECENTLY_UPDATED_LABEL}" label...`);
      const currentlyUpdatedTasksResponse = await api.getTasks({ label: RECENTLY_UPDATED_LABEL });
      const currentlyUpdatedTasks = currentlyUpdatedTasksResponse.results;
      currentlyUpdatedTasks.forEach((task: Task) => {
        tasksToCheck.set(task.id, task);
      });
    }
    
    console.log(`Found ${tasksToCheck.size} tasks with recent labels to check`);
    
    // Process each task to determine if labels should be removed
    const tasksToUpdate: Task[] = [];
    
    for (const task of tasksToCheck.values()) {
      const createdDate = new Date(task.addedAt || '');
      const updatedDate = new Date(task.updatedAt || task.addedAt || '');
      
      const isRecentlyCreated = createdDate >= recentThreshold;
      const isRecentlyUpdated = updatedDate >= recentThreshold && updatedDate.getTime() !== createdDate.getTime();
      
      const currentlyHasCreatedLabel = recentlyCreatedLabel && task.labels?.includes(recentlyCreatedLabel.name) || false;
      const currentlyHasUpdatedLabel = recentlyUpdatedLabel && task.labels?.includes(recentlyUpdatedLabel.name) || false;
      
      let shouldRemoveLabels = false;
      
      // Remove "recently created" label if task is no longer recently created
      if (currentlyHasCreatedLabel && !isRecentlyCreated) {
        shouldRemoveLabels = true;
        console.log(`Task "${task.content}" (${task.id}) is no longer recently created - removing label`);
      }
      
      // Remove "recently updated" label if task is no longer recently updated
      if (currentlyHasUpdatedLabel && !isRecentlyUpdated) {
        shouldRemoveLabels = true;
        console.log(`Task "${task.content}" (${task.id}) is no longer recently updated - removing label`);
      }
      
      if (shouldRemoveLabels) {
        tasksToUpdate.push(task);
      }
    }
    
    console.log(`Found ${tasksToUpdate.length} tasks that need label cleanup`);
    
    // Update tasks by removing stale labels
    let updatedCount = 0;
    for (const task of tasksToUpdate) {
      try {
        // Build the new labels array by removing stale recent labels
        const newLabels = [...(task.labels || [])];
        let labelsChanged = false;
        
        // Remove "recently created" label if task is no longer recently created
        if (recentlyCreatedLabel && newLabels.includes(recentlyCreatedLabel.name)) {
          const createdDate = new Date(task.addedAt || '');
          const isRecentlyCreated = createdDate >= recentThreshold;
          
          if (!isRecentlyCreated) {
            const index = newLabels.indexOf(recentlyCreatedLabel.name);
            newLabels.splice(index, 1);
            labelsChanged = true;
          }
        }
        
        // Remove "recently updated" label if task is no longer recently updated
        if (recentlyUpdatedLabel && newLabels.includes(recentlyUpdatedLabel.name)) {
          const updatedDate = new Date(task.updatedAt || task.addedAt || '');
          const createdDate = new Date(task.addedAt || '');
          const isRecentlyUpdated = updatedDate >= recentThreshold && updatedDate.getTime() !== createdDate.getTime();
          
          if (!isRecentlyUpdated) {
            const index = newLabels.indexOf(recentlyUpdatedLabel.name);
            newLabels.splice(index, 1);
            labelsChanged = true;
          }
        }
        
        // Update the task if labels changed
        if (labelsChanged) {
          await api.updateTask(task.id, { labels: newLabels });
          updatedCount++;
          
          console.log(`Cleaned up labels for task "${task.content}" (${task.id})`);
        }
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to update task ${task.id}: ${errorMessage}`);
      }
    }
    
    console.log(`Successfully cleaned up labels on ${updatedCount} tasks`);
    console.log("Todoist recent tasks label cleanup process completed!");
    
  } catch (error) {
    console.error("Error in main process:", error);
    Deno.exit(1);
  }
}

// Run the main function if this script is executed directly
if (import.meta.main) {
  await main();
}
