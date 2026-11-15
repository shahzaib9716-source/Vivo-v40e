/**
 * Camera Snapshot Manager for handling camera snapshot functionality
 * Manages taking snapshots and storing them appropriately
 */
import fs from 'fs';
import path from 'path';

/** 
 * Camera Snapshot Manager singleton class
 * Handles taking and managing camera snapshots
 */
export class CameraSnapshotManager {
  private static instance: CameraSnapshotManager;
  private snapshotDirectory: string;
  private isTakingSnapshot: boolean = false;

  private constructor() {
    // Initialize with a default directory for camera snapshots
    this.snapshotDirectory = path.join(process.cwd(), 'camera-snapshots');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(this.snapshotDirectory)) {
      fs.mkdirSync(this.snapshotDirectory, { recursive: true });
    }
  }

  /** 
   * Get the singleton instance of CameraSnapshotManager
   */
  static getInstance(): CameraSnapshotManager {
    if (!CameraSnapshotManager.instance) {
      CameraSnapshotManager.instance = new CameraSnapshotManager();
    }
    return CameraSnapshotManager.instance;
  }

  /** 
   * Take a camera snapshot
   * @param fileName - Optional custom filename for the snapshot
   * @returns Promise resolving to the path of the saved snapshot or null if failed
   */
  async takeSnapshot(fileName?: string): Promise<string | null> {
    try {
      if (this.isTakingSnapshot) {
        console.warn('Camera snapshot is already in progress');
        return null;
      }
      
      this.isTakingSnapshot = true;
      
      // Generate timestamp for filename if none provided
      const timestamp = new Date().toISOString();
      const safeTimestamp = timestamp.replace(/[:.]/g, '-');
      const finalFileName = fileName || `snapshot_${safeTimestamp}.jpg`;
      
      const filePath = path.join(this.snapshotDirectory, finalFileName);
      
      // In a real implementation, this would use native camera APIs
      // For now, we'll create a mock snapshot file with metadata
      
      // Create a mock image data (in real app this would be actual image data)
      const mockImageData = `Mock camera snapshot at ${timestamp}`;
      
      // Write the mock image data
      fs.writeFileSync(filePath, mockImageData);
      
      // Create metadata file
      const metaPath = path.join(this.snapshotDirectory, `${finalFileName}.metadata.json`);
      const metadata = {
        timestamp,
        filePath,
        description: 'Camera snapshot'
      };
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
      
      console.log(`Camera snapshot taken: ${filePath}`);
      
      this.isTakingSnapshot = false;
      return filePath;
    } catch (error) {
      console.error('Failed to take camera snapshot:', error);
      this.isTakingSnapshot = false;
      return null;
    }
  }

  /** 
   * Get list of all camera snapshots in the directory
   */
  async getSnapshotList(): Promise<Array<{name: string, path: string, timestamp: Date}>> {
    try {
      const files = fs.readdirSync(this.snapshotDirectory);
      const snapshots: Array<{name: string, path: string, timestamp: Date}> = [];
      
      for (const file of files) {
        if (file.endsWith('.jpg') || file.endsWith('.png')) {
          const filePath = path.join(this.snapshotDirectory, file);
          const stats = fs.statSync(filePath);
          
          // Extract timestamp from filename
          const timestampMatch = file.match(/_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d+Z)/);
          let timestamp = new Date();
          
          if (timestampMatch && timestampMatch[1]) {
            timestamp = new Date(timestampMatch[1].replace(/-/g, '/').replace('T', ' ').replace(/\.\d+Z/, 'Z'));
          }
          
          snapshots.push({
            name: file,
            path: filePath,
            timestamp
          });
        }
      }
      
      // Sort by timestamp descending (newest first)
      snapshots.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      return snapshots;
    } catch (error) {
      console.error('Failed to get snapshot list:', error);
      return [];
    }
  }

  /** 
   * Delete a specific snapshot
   * @param filePath - Path to the snapshot file to delete
   */
  async deleteSnapshot(filePath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`Snapshot file not found: ${filePath}`);
        return false;
      }
      
      // Delete the main file
      fs.unlinkSync(filePath);
      
      // Also delete associated metadata file
      const metaPath = `${filePath}.metadata.json`;
      if (fs.existsSync(metaPath)) {
        fs.unlinkSync(metaPath);
      }
      
      console.log(`Deleted snapshot: ${filePath}`);
      return true;
    } catch (error) {
      console.error('Failed to delete snapshot:', error);
      return false;
    }
  }

  /** 
   * Clean up old snapshots (keep only the most recent N)
   * @param maxCount - Maximum number of snapshots to keep
   */
  async cleanupOldSnapshots(maxCount: number = 50): Promise<void> {
    try {
      const snapshots = await this.getSnapshotList();
      
      if (snapshots.length <= maxCount) {
        return;
      }
      
      // Keep only the most recent snapshots
      const snapshotsToKeep = snapshots.slice(0, maxCount);
      const snapshotsToDelete = snapshots.slice(maxCount);
      
      for (const snapshot of snapshotsToDelete) {
        try {
          await this.deleteSnapshot(snapshot.path);
        } catch (deleteError) {
          console.error(`Failed to delete snapshot ${snapshot.name}:`, deleteError);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup snapshots:', error);
    }
  }

  /** 
   * Check if a snapshot is currently being taken
   */
  isSnapshotInProgress(): boolean {
    return this.isTakingSnapshot;
  }
}