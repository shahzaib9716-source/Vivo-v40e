/**
 * Screenshot Manager for handling screenshot functionality
 * Manages taking screenshots and storing them appropriately
 */
import fs from 'fs';
import path from 'path';

/** 
 * Screenshot Manager singleton class
 * Handles taking and managing screenshots
 */
export class ScreenshotManager {
  private static instance: ScreenshotManager;
  private screenshotDirectory: string;
  private isTakingScreenshot: boolean = false;

  private constructor() {
    // Initialize with a default directory for screenshots
    this.screenshotDirectory = path.join(process.cwd(), 'screenshots');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(this.screenshotDirectory)) {
      fs.mkdirSync(this.screenshotDirectory, { recursive: true });
    }
  }

  /** 
   * Get the singleton instance of ScreenshotManager
   */
  static getInstance(): ScreenshotManager {
    if (!ScreenshotManager.instance) {
      ScreenshotManager.instance = new ScreenshotManager();
    }
    return ScreenshotManager.instance;
  }

  /** 
   * Take a screenshot
   * @param fileName - Optional custom filename for the screenshot
   * @returns Promise resolving to the path of the saved screenshot or null if failed
   */
  async takeScreenshot(fileName?: string): Promise<string | null> {
    try {
      if (this.isTakingScreenshot) {
        console.warn('Screenshot is already in progress');
        return null;
      }
      
      this.isTakingScreenshot = true;
      
      // Generate timestamp for filename if none provided
      const timestamp = new Date().toISOString();
      const safeTimestamp = timestamp.replace(/[:.]/g, '-');
      const finalFileName = fileName || `screenshot_${safeTimestamp}.png`;
      
      const filePath = path.join(this.screenshotDirectory, finalFileName);
      
      // In a real implementation, this would use native screenshot APIs
      // For now, we'll create a mock screenshot file with metadata
      
      // Create a mock image data (in real app this would be actual image data)
      const mockImageData = `Mock screenshot at ${timestamp}`;
      
      // Write the mock image data
      fs.writeFileSync(filePath, mockImageData);
      
      // Create metadata file
      const metaPath = path.join(this.screenshotDirectory, `${finalFileName}.metadata.json`);
      const metadata = {
        timestamp,
        filePath,
        description: 'Screenshot'
      };
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
      
      console.log(`Screenshot taken: ${filePath}`);
      
      this.isTakingScreenshot = false;
      return filePath;
    } catch (error) {
      console.error('Failed to take screenshot:', error);
      this.isTakingScreenshot = false;
      return null;
    }
  }

  /** 
   * Get list of all screenshots in the directory
   */
  async getScreenshotList(): Promise<Array<{name: string, path: string, timestamp: Date}>> {
    try {
      const files = fs.readdirSync(this.screenshotDirectory);
      const screenshots: Array<{name: string, path: string, timestamp: Date}> = [];
      
      for (const file of files) {
        if (file.endsWith('.png') || file.endsWith('.jpg')) {
          const filePath = path.join(this.screenshotDirectory, file);
          const stats = fs.statSync(filePath);
          
          // Extract timestamp from filename
          const timestampMatch = file.match(/_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d+Z)/);
          let timestamp = new Date();
          
          if (timestampMatch && timestampMatch[1]) {
            timestamp = new Date(timestampMatch[1].replace(/-/g, '/').replace('T', ' ').replace(/\.\d+Z/, 'Z'));
          }
          
          screenshots.push({
            name: file,
            path: filePath,
            timestamp
          });
        }
      }
      
      // Sort by timestamp descending (newest first)
      screenshots.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      return screenshots;
    } catch (error) {
      console.error('Failed to get screenshot list:', error);
      return [];
    }
  }

  /** 
   * Delete a specific screenshot
   * @param filePath - Path to the screenshot file to delete
   */
  async deleteScreenshot(filePath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`Screenshot file not found: ${filePath}`);
        return false;
      }
      
      // Delete the main file
      fs.unlinkSync(filePath);
      
      // Also delete associated metadata file
      const metaPath = `${filePath}.metadata.json`;
      if (fs.existsSync(metaPath)) {
        fs.unlinkSync(metaPath);
      }
      
      console.log(`Deleted screenshot: ${filePath}`);
      return true;
    } catch (error) {
      console.error('Failed to delete screenshot:', error);
      return false;
    }
  }

  /** 
   * Clean up old screenshots (keep only the most recent N)
   * @param maxCount - Maximum number of screenshots to keep
   */
  async cleanupOldScreenshots(maxCount: number = 50): Promise<void> {
    try {
      const screenshots = await this.getScreenshotList();
      
      if (screenshots.length <= maxCount) {
        return;
      }
      
      // Keep only the most recent screenshots
      const screenshotsToKeep = screenshots.slice(0, maxCount);
      const screenshotsToDelete = screenshots.slice(maxCount);
      
      for (const screenshot of screenshotsToDelete) {
        try {
          await this.deleteScreenshot(screenshot.path);
        } catch (deleteError) {
          console.error(`Failed to delete screenshot ${screenshot.name}:`, deleteError);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup screenshots:', error);
    }
  }

  /** 
   * Check if a screenshot is currently being taken
   */
  isScreenshotInProgress(): boolean {
    return this.isTakingScreenshot;
  }
}