#!/usr/bin/env deno

import { TodoistApi } from "@doist/todoist-api-typescript";
import type { Task, Label } from "@doist/todoist-api-typescript";

// Type definitions for better type safety
interface TaskUpdateInfo {
  task: Task;
  shouldHaveCreatedLabel: boolean;
  shouldHaveUpdatedLabel: boolean;
  currentlyHasCreatedLabel: boolean;
  currentlyHasUpdatedLabel: boolean;
}

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
 * Main function to update task labels based on recent activity
 */
export async function main() {
  console.log("Starting Todoist recent tasks labeling process...");
  
  if (!api) {
    throw new Error("Todoist API client not initialized. Please set TODOIST_TOKEN environment variable.");
  }
  
  try {
    // Get current date threshold for "recent" tasks
    const now = new Date();
    const recentThreshold = new Date(now.getTime() - (RECENT_THRESHOLD_HOURS * 60 * 60 * 1000));
    
    console.log(`Threshold for recent tasks: ${recentThreshold.toISOString()}`);
    
    // Fetch labels first to ensure our required labels exist
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
    
    // Strategy: Use API filtering for performance - avoid fetching all tasks
    console.log("Processing tasks with targeted API queries...");
    
    // 1. Get tasks that currently have the "recently created" label
    console.log(`Fetching tasks with "${RECENTLY_CREATED_LABEL}" label...`);
    const currentlyCreatedTasksResponse = await api.getTasks({ label: RECENTLY_CREATED_LABEL });
    const currentlyCreatedTasks = currentlyCreatedTasksResponse.results;
    
    // 2. Get tasks that currently have the "recently updated" label  
    console.log(`Fetching tasks with "${RECENTLY_UPDATED_LABEL}" label...`);
    const currentlyUpdatedTasksResponse = await api.getTasks({ label: RECENTLY_UPDATED_LABEL });
    const currentlyUpdatedTasks = currentlyUpdatedTasksResponse.results;
    
    // 3. Since Todoist doesn't have a direct "created after" filter, we'll get tasks from the last few days
    // and filter them. This is still more efficient than getting ALL tasks.
    console.log("Fetching recent tasks to check for recent creation/modification...");
    
    // Get tasks created in the last 7 days - this gives us a reasonable working set
    // instead of fetching ALL tasks from the entire account
    const recentTasksResponse = await api.getTasksByFilter({ 
      query: "created after: -7 days" 
    });
    const recentTasks = recentTasksResponse.results;
    
    // Filter for tasks created within our 24-hour threshold
    const recentCreatedTasks = recentTasks.filter((task: Task) => {
      const createdDate = new Date(task.addedAt || '');
      return createdDate >= recentThreshold;
    });
    
    // Filter for tasks modified recently (but not just created)
    const recentModifiedTasks = recentTasks.filter((task: Task) => {
      if (!task.updatedAt) return false;
      
      const updatedDate = new Date(task.updatedAt);
      const createdDate = new Date(task.addedAt || '');
      
      // Task was updated recently AND the update time is different from creation time
      return updatedDate >= recentThreshold && updatedDate.getTime() !== createdDate.getTime();
    });
    
    console.log(`Found ${currentlyCreatedTasks.length} tasks with "recently created" label`);
    console.log(`Found ${currentlyUpdatedTasks.length} tasks with "recently updated" label`);
    console.log(`Found ${recentCreatedTasks.length} recently created tasks`);
    console.log(`Found ${recentModifiedTasks.length} recently modified tasks`);
    
    // Create a map to track all tasks we need to process
    const tasksToProcess = new Map<string, Task>();
    
    // Add all tasks with current labels
    currentlyCreatedTasks.forEach((task: Task) => {
      tasksToProcess.set(task.id, task);
    });
    currentlyUpdatedTasks.forEach((task: Task) => {
      tasksToProcess.set(task.id, task);
    });
    
    // Add all recently created and modified tasks
    recentCreatedTasks.forEach((task: Task) => {
      tasksToProcess.set(task.id, task);
    });
    recentModifiedTasks.forEach((task: Task) => {
      tasksToProcess.set(task.id, task);
    });
    
    console.log(`Processing ${tasksToProcess.size} unique tasks...`);
    
    // Process each task to determine if it should have recent labels
    const tasksToUpdate: TaskUpdateInfo[] = [];
    
    for (const task of tasksToProcess.values()) {
      // Use the correct property names from the Task type: addedAt and updatedAt
      const createdDate = new Date(task.addedAt || '');
      const updatedDate = new Date(task.updatedAt || task.addedAt || '');
      
      const isRecentlyCreated = createdDate >= recentThreshold;
      const isRecentlyUpdated = updatedDate >= recentThreshold && updatedDate.getTime() !== createdDate.getTime();
      
      const currentlyHasCreatedLabel = task.labels?.includes(recentlyCreatedLabel.name) || false;
      const currentlyHasUpdatedLabel = task.labels?.includes(recentlyUpdatedLabel.name) || false;
      
      // Debug logging to help diagnose label removal
      if (currentlyHasCreatedLabel || currentlyHasUpdatedLabel) {
        console.log(`\nDebugging task "${task.content}" (${task.id}):`);
        console.log(`  Created: ${task.addedAt} -> isRecent: ${isRecentlyCreated}`);
        console.log(`  Updated: ${task.updatedAt} -> isRecent: ${isRecentlyUpdated}`);
        console.log(`  Has created label: ${currentlyHasCreatedLabel} -> should have: ${isRecentlyCreated}`);
        console.log(`  Has updated label: ${currentlyHasUpdatedLabel} -> should have: ${isRecentlyUpdated}`);
        console.log(`  Current labels: [${task.labels?.join(', ')}]`);
      }
      
      // Only track tasks that need changes
      if (
        isRecentlyCreated !== currentlyHasCreatedLabel ||
        isRecentlyUpdated !== currentlyHasUpdatedLabel
      ) {
        tasksToUpdate.push({
          task,
          shouldHaveCreatedLabel: isRecentlyCreated,
          shouldHaveUpdatedLabel: isRecentlyUpdated,
          currentlyHasCreatedLabel,
          currentlyHasUpdatedLabel
        });
      }
    }
    
    console.log(`Found ${tasksToUpdate.length} tasks that need label updates`);
    
    // Update tasks with correct labels
    let updatedCount = 0;
    for (const { task, shouldHaveCreatedLabel, shouldHaveUpdatedLabel } of tasksToUpdate) {
      try {
        // Build the new labels array
        const newLabels = [...(task.labels || [])];
        
        // Handle recently created label
        if (shouldHaveCreatedLabel && !newLabels.includes(recentlyCreatedLabel.name)) {
          newLabels.push(recentlyCreatedLabel.name);
        } else if (!shouldHaveCreatedLabel && newLabels.includes(recentlyCreatedLabel.name)) {
          const index = newLabels.indexOf(recentlyCreatedLabel.name);
          newLabels.splice(index, 1);
        }
        
        // Handle recently updated label
        if (shouldHaveUpdatedLabel && !newLabels.includes(recentlyUpdatedLabel.name)) {
          newLabels.push(recentlyUpdatedLabel.name);
        } else if (!shouldHaveUpdatedLabel && newLabels.includes(recentlyUpdatedLabel.name)) {
          const index = newLabels.indexOf(recentlyUpdatedLabel.name);
          newLabels.splice(index, 1);
        }
        
        // Update the task if labels changed
        if (JSON.stringify(newLabels.sort()) !== JSON.stringify((task.labels || []).sort())) {
          await api.updateTask(task.id, { labels: newLabels });
          updatedCount++;
          
          console.log(
            `Updated task "${task.content}" (${task.id}): ` +
            `created=${shouldHaveCreatedLabel ? '✓' : '✗'}, ` +
            `updated=${shouldHaveUpdatedLabel ? '✓' : '✗'}`
          );
        }
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to update task ${task.id}: ${errorMessage}`);
      }
    }
    
    console.log(`Successfully updated ${updatedCount} tasks`);
    console.log("Todoist recent tasks labeling process completed!");
    
  } catch (error) {
    console.error("Error in main process:", error);
    Deno.exit(1);
  }
}

// Run the main function if this script is executed directly
if (import.meta.main) {
  await main();
}
