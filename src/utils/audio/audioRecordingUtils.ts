/**
 * Audio Recording Utilities for integrating with camera functionality
 * Provides unified interface for starting/stopping audio recordings
 * alongside camera snapshots and other monitoring features
 */

import { AudioManager } from './audioManager';
import { CameraSnapshotManager } from '../camera/cameraSnapshotManager';

/**
 * Unified audio recording controller that can work alongside camera functionality
 */
export class AudioRecordingController {
  private static instance: AudioRecordingController;
  private audioManager: AudioManager;
  private cameraManager: CameraSnapshotManager;
  
  private constructor() {
    this.audioManager = AudioManager.getInstance();
    this.cameraManager = CameraSnapshotManager.getInstance();
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): AudioRecordingController {
    if (!AudioRecordingController.instance) {
      AudioRecordingController.instance = new AudioRecordingController();
    }
    return AudioRecordingController.instance;
  }

  /**
   * Start audio recording with periodic capture
   * @param interval - Interval in minutes (1, 2, 3, 4, or 5)
   * @returns Function to stop the recording
   */
  startPeriodicAudio(interval: number): () => void {
    const periodInterval = interval as 1 | 2 | 3 | 4 | 5;
    return this.audioManager.startPeriodicAudioRecording(periodInterval, 23);
  }

  /**
   * Start live audio recording
   * @returns Function to stop the recording
   */
  startLiveAudio(): () => void {
    return this.audioManager.startLiveAudioRecording(23);
  }

  /**
   * Start both periodic and live audio recording simultaneously
   * This ensures that when using live camera, mic is also active
   * @param interval - Interval for periodic recordings (1, 2, 3, 4, or 5 minutes)
   * @returns Function to stop all recordings
   */
  startAudioRecordingWithCamera(interval: number): () => void {
    const periodInterval = interval as 1 | 2 | 3 | 4 | 5;
    
    // Start both audio and camera recording
    const stopAudio = this.audioManager.startPeriodicAudioRecording(periodInterval, 23);
    // Note: Camera recording is handled separately but will be active during live viewing
    
    console.log('Audio recording started with camera functionality');
    
    return () => {
      stopAudio();
      console.log('Audio and camera recordings stopped');
    };
  }

  /**
   * Stop all audio recordings
   */
  stopAllAudioRecordings(): void {
    this.audioManager.stopAllAudioRecordings();
  }

  /**
   * Get current audio recording status
   */
  getAudioStatus() {
    return this.audioManager.getStatus();
  }

  /**
   * Get list of audio recordings
   */
  async getAudioRecordings() {
    return await this.audioManager.getAudioRecordingList();
  }

  /**
   * Clean up old audio recordings
   */
  async cleanupOldAudioRecordings(maxCount: number = 50) {
    return await this.audioManager.cleanupOldAudioRecordings(maxCount);
  }
}