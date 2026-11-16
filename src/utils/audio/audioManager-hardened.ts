/** 
 * Enhanced Audio Manager for handling sound recording functionality with security hardening
 * Supports both periodic recordings and live recording with real-time listening
 */
import fs from 'fs';
import path from 'path';

// Define types for audio recording configuration
export type RecordingMode = 'periodic' | 'live';
export type PeriodicInterval = 1 | 2 | 3 | 4 | 5; // Minutes

export interface AudioRecordingConfig {
  mode: RecordingMode;
  interval?: PeriodicInterval; // For periodic recordings
  duration: number; // Duration in seconds for each recording
}

/** 
 * Enhanced Audio Manager singleton class with security hardening
 * Handles audio recording and playback functionality with comprehensive security features
 */
export class AudioManager {
  private static instance: AudioManager;
  private recordingDirectory: string;
  private isRecording: boolean = false;
  private isPlaying: boolean = false;
  private currentRecordingPath: string | null = null;
  private currentPlaybackPath: string | null = null;
  private periodicRecordingTimeouts: Array<NodeJS.Timeout> = [];
  private liveRecordingInterval: NodeJS.Timeout | null = null;
  private securityStats: {
    operationCount: number;
    errorCount: number;
    activeOperations: number;
  } = {
    operationCount: 0,
    errorCount: 0,
    activeOperations: 0
  };
  private maxConcurrentOperations: number = 5;
  private currentOperations: number = 0;

  private constructor() {
    // Initialize with a default directory for audio recordings
    this.recordingDirectory = path.join(process.cwd(), 'audio-recordings');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(this.recordingDirectory)) {
      fs.mkdirSync(this.recordingDirectory, { recursive: true });
    }
  }

  /**
   * Get the singleton instance of AudioManager
   */
  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  /**
   * Validate audio recording parameters for security and correctness
   * @param interval - Interval in minutes (1, 2, 3, 4, or 5)
   * @param duration - Duration of each recording in seconds
   * @returns boolean indicating if parameters are valid
   */
  private validateAudioParameters(interval: number, duration: number): boolean {
    // Check interval is valid (1-5 minutes)
    if (!([1, 2, 3, 4, 5].includes(interval))) {
      return false;
    }
    
    // Check duration is valid (1-300 seconds)
    if (duration < 1 || duration > 300) {
      return false;
    }
    
    return true;
  }

  /**
   * Secure file path generation to prevent directory traversal attacks
   * @param fileName - Name of the audio file
   * @returns Sanitized file path
   */
  private getSecureFilePath(fileName: string): string {
    // Basic sanitization to prevent directory traversal
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '');
    
    // Ensure we stay within our recording directory
    const fullPath = path.join(this.recordingDirectory, sanitizedFileName);
    const resolvedPath = path.resolve(fullPath);
    
    // Verify that the resolved path is within our recording directory
    if (!resolvedPath.startsWith(this.recordingDirectory)) {
      throw new Error('Security violation: Attempted to access file outside recording directory');
    }
    
    return resolvedPath;
  }

  /**
   * Enhanced security check for concurrent operations
   * @returns boolean indicating if operation can proceed
   */
  private canProceedWithOperation(): boolean {
    // Circuit breaker pattern - prevent too many concurrent operations
    if (this.currentOperations >= this.maxConcurrentOperations) {
      this.securityStats.errorCount++;
      throw new Error('Too many concurrent audio operations, circuit breaker activated');
    }
    
    return true;
  }

  /**
   * Increment operation counter for security tracking
   */
  private incrementOperation(): void {
    this.currentOperations++;
    this.securityStats.operationCount++;
    this.securityStats.activeOperations = this.currentOperations;
  }

  /**
   * Decrement operation counter for security tracking
   */
  private decrementOperation(): void {
    this.currentOperations--;
    this.securityStats.activeOperations = this.currentOperations;
  }

  /**
   * Get current security statistics
   */
  getSecurityStats(): { operationCount: number; errorCount: number; activeOperations: number } {
    return { ...this.securityStats };
  }

  /**
   * Start periodic audio recording
   * @param interval - Interval in minutes (1, 2, 3, 4, or 5)
   * @param duration - Duration of each recording in seconds
   * @returns Function to stop the recording
   */
  startPeriodicAudioRecording(interval: PeriodicInterval, duration: number): () => void {
    if (!this.validateAudioParameters(interval, duration)) {
      throw new Error('Invalid audio recording parameters');
    }
    
    this.canProceedWithOperation();
    this.incrementOperation();
    
    // In a real implementation, this would start the actual recording
    // For now, we'll simulate it with timeouts
    const timeout = setTimeout(() => {
      console.log(`Periodic audio recording started for ${duration} seconds at ${interval}-minute interval`);
      // Add actual recording logic here
    }, 0);
    
    this.periodicRecordingTimeouts.push(timeout);
    
    return () => {
      clearTimeout(timeout);
      this.decrementOperation();
    };
  }

  /**
   * Start live audio recording (continuous)
   * @param duration - Duration of each recording in seconds
   * @returns Function to stop the recording
   */
  startLiveAudioRecording(duration: number): () => void {
    if (!this.validateAudioParameters(1, duration)) {
      throw new Error('Invalid audio recording parameters');
    }
    
    this.canProceedWithOperation();
    this.incrementOperation();
    
    // In a real implementation, this would start the actual recording
    // For now, we'll simulate it with intervals
    const interval = setInterval(() => {
      console.log(`Live audio recording ongoing for ${duration} seconds`);
      // Add actual recording logic here
    }, 1000);
    
    this.liveRecordingInterval = interval;
    
    return () => {
      clearInterval(interval);
      this.decrementOperation();
    };
  }

  /**
   * Stop all audio recordings
   */
  stopAllAudioRecordings(): void {
    // Clear all periodic timeouts
    this.periodicRecordingTimeouts.forEach(timeout => clearTimeout(timeout));
    this.periodicRecordingTimeouts = [];
    
    // Clear live recording interval
    if (this.liveRecordingInterval) {
      clearInterval(this.liveRecordingInterval);
      this.liveRecordingInterval = null;
    }
  }

  /**
   * Get current audio recording status
   */
  getStatus(): any {
    return {
      isRecording: this.isRecording,
      isPlaying: this.isPlaying,
      activeOperations: this.currentOperations,
      securityStats: this.securityStats
    };
  }

  /**
   * Get list of audio recordings
   */
  async getAudioRecordingList(): Promise<any[]> {
    // In a real implementation, this would read from file system
    // For now, we'll return an empty array or mock data
    return [];
  }

  /**
   * Clean up old audio recordings
   * @param maxCount - Maximum number of recordings to keep
   */
  async cleanupOldAudioRecordings(maxCount: number = 50): Promise<void> {
    // In a real implementation, this would remove old files from the file system
    // For now, we'll just log that it was called
    console.log(`Cleaning up audio recordings, keeping ${maxCount} most recent`);
  }
}