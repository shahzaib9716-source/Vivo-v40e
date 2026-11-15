/**
 * Comprehensive Security and Performance Tests for Enhanced Audio Manager
 */

import { AudioManager } from '../src/utils/audio/audioManager-hardened';

describe('Enhanced Audio Manager Security Tests', () => {
  let audioManager: AudioManager;
  
  beforeEach(() => {
    // Reset singleton instance before each test
    (AudioManager as any).instance = null;
    audioManager = AudioManager.getInstance();
  });

  afterEach(async () => {
    // Clean up any active recordings
    await audioManager.stopAllAudioRecordings();
  });

  test('should initialize with secure directory', () => {
    expect(audioManager).toBeDefined();
    expect(() => AudioManager.getInstance()).not.toThrow();
  });

  test('should validate input parameters correctly', () => {
    // Valid intervals
    expect(audioManager['validateAudioParameters'](1, 23)).toBe(true);
    expect(audioManager['validateAudioParameters'](5, 23)).toBe(true);
    
    // Invalid intervals
    expect(audioManager['validateAudioParameters'](6, 23)).toBe(false); // Out of range
    expect(audioManager['validateAudioParameters'](0, 23)).toBe(false); // Out of range
    
    // Valid durations
    expect(audioManager['validateAudioParameters'](1, 1)).toBe(true);
    expect(audioManager['validateAudioParameters'](1, 300)).toBe(true);
    
    // Invalid durations
    expect(audioManager['validateAudioParameters'](1, 0)).toBe(false); // Zero duration
    expect(audioManager['validateAudioParameters'](1, 301)).toBe(false); // Too long
  });

  test('should handle errors gracefully', async () => {
    // Test that error handling works for invalid parameters
    expect(() => {
      audioManager.startPeriodicAudioRecording(6 as any, 23); // Invalid interval
    }).toThrow('Invalid parameters for periodic audio recording');
    
    expect(() => {
      audioManager.startPeriodicAudioRecording(1, 301); // Invalid duration
    }).toThrow('Invalid parameters for periodic audio recording');
  });

  test('should create secure file paths', () => {
    // Test that directory path validation works properly
    const originalDirectory = (audioManager as any).recordingDirectory;
    
    // This should be a valid secure path
    expect(originalDirectory).toBeDefined();
    expect(originalDirectory).toContain('audio-recordings');
  });

  test('should track security statistics', () => {
    const stats = audioManager['getSecurityStats']();
    expect(stats.operationCount).toBeGreaterThanOrEqual(0);
    expect(stats.activeOperations).toBeGreaterThanOrEqual(0);
    expect(stats.errorCount).toBeGreaterThanOrEqual(0);
  });
});

describe('Audio Manager Integration Tests', () => {
  let audioManager: AudioManager;
  
  beforeEach(() => {
    // Reset singleton instance before each test
    (AudioManager as any).instance = null;
    audioManager = AudioManager.getInstance();
  });

  afterEach(async () => {
    // Clean up any active recordings
    await audioManager.stopAllAudioRecordings();
  });

  test('should start and stop periodic recording correctly', async () => {
    const stopFunc = audioManager.startPeriodicAudioRecording(1, 23);
    
    // Check that recording is active
    const status = audioManager.getStatus();
    expect(status.isRecording).toBe(true);
    
    // Stop the recording
    stopFunc();
    
    // Check that recording is stopped
    const finalStatus = audioManager.getStatus();
    expect(finalStatus.isRecording).toBe(false);
  });

  test('should start and stop live recording correctly', async () => {
    const stopFunc = audioManager.startLiveAudioRecording(23);
    
    // Check that recording is active
    const status = audioManager.getStatus();
    expect(status.isRecording).toBe(true);
    
    // Stop the recording
    stopFunc();
    
    // Check that recording is stopped
    const finalStatus = audioManager.getStatus();
    expect(finalStatus.isRecording).toBe(false);
  });
});