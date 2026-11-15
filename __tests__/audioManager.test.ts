import { AudioManager } from '../src/utils/audio/audioManager';
import fs from 'fs';
import path from 'path';

// Mock the filesystem for testing
jest.mock('fs');

describe('AudioManager', () => {
  let manager: AudioManager;
  
  beforeEach(() => {
    // Clear singleton instance to ensure fresh setup for each test
    const constructor = AudioManager as any;
    if (constructor.instance) {
      delete constructor.instance;
    }
    
    manager = AudioManager.getInstance();
    
    // Mock fs methods
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
    (fs.readdirSync as jest.Mock).mockReturnValue([]);
    (fs.statSync as jest.Mock).mockReturnValue({
      size: 1024,
      mtime: new Date()
    });
    (fs.unlinkSync as jest.Mock).mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be a singleton', () => {
    const manager1 = AudioManager.getInstance();
    const manager2 = AudioManager.getInstance();
    
    expect(manager1).toBe(manager2);
  });

  it('should start and stop periodic audio recording', () => {
    // Note: Actual timing would be tested with real timeouts
    const stopFunc = manager.startPeriodicAudioRecording(2, 23);
    
    expect(manager.getStatus().isRecording).toBe(true);
    
    // Stop the recording
    stopFunc();
    
    expect(manager.getStatus().isRecording).toBe(false);
  });

  it('should start and stop live audio recording', () => {
    // Note: Actual timing would be tested with real intervals
    const stopFunc = manager.startLiveAudioRecording(23);
    
    expect(manager.getStatus().isRecording).toBe(true);
    
    // Stop the recording
    stopFunc();
    
    expect(manager.getStatus().isRecording).toBe(false);
  });

  it('should record audio successfully', async () => {
    (fs.readdirSync as jest.Mock).mockReturnValue(['audio_2023-01-01T00-00-00.000Z.m4a']);
    
    const result = await manager.recordAudio(23);
    
    expect(result).toBeDefined();
    expect(fs.writeFileSync).toHaveBeenCalledTimes(2); // audio file + metadata
  });

  it('should handle recording failures gracefully', async () => {
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('Failed to write file');
    });
    
    const result = await manager.recordAudio(23);
    
    expect(result).toBeNull();
  });

  it('should get empty recording list when no recordings exist', async () => {
    (fs.readdirSync as jest.Mock).mockReturnValue([]);
    
    const recordings = await manager.getAudioRecordingList();
    
    expect(recordings).toHaveLength(0);
  });

  it('should return status correctly', () => {
    const status = manager.getStatus();
    
    expect(status.isRecording).toBe(false);
  });
});