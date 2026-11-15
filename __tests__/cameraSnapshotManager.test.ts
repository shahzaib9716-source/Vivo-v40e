import { CameraSnapshotManager } from '../src/utils/camera/cameraSnapshotManager';
import fs from 'fs';
import path from 'path';

// Mock the filesystem for testing
jest.mock('fs');

describe('CameraSnapshotManager', () => {
  let manager: CameraSnapshotManager;
  
  beforeEach(() => {
    // Clear singleton instance to ensure fresh setup for each test
    const constructor = CameraSnapshotManager as any;
    if (constructor.instance) {
      delete constructor.instance;
    }
    
    manager = CameraSnapshotManager.getInstance();
    
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
    const manager1 = CameraSnapshotManager.getInstance();
    const manager2 = CameraSnapshotManager.getInstance();
    
    expect(manager1).toBe(manager2);
  });

  it('should capture camera snapshots for front camera', async () => {
    (fs.readdirSync as jest.Mock).mockReturnValue(['front_snapshot_2023-01-01T00-00-00.000Z.png']);
    
    const result = await manager.captureCameraSnapshot('front');
    
    expect(result).toBeDefined();
    expect(fs.writeFileSync).toHaveBeenCalledTimes(2); // snapshot + metadata
  });

  it('should capture camera snapshots for rear camera', async () => {
    (fs.readdirSync as jest.Mock).mockReturnValue(['rear_snapshot_2023-01-01T00-00-00.000Z.png']);
    
    const result = await manager.captureCameraSnapshot('rear');
    
    expect(result).toBeDefined();
    expect(fs.writeFileSync).toHaveBeenCalledTimes(2); // snapshot + metadata
  });

  it('should handle capture failures gracefully', async () => {
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('Failed to write file');
    });
    
    const result = await manager.captureCameraSnapshot('front');
    
    expect(result).toBeNull();
  });

  it('should get empty snapshot list when no snapshots exist', async () => {
    (fs.readdirSync as jest.Mock).mockReturnValue([]);
    
    const snapshots = await manager.getCameraSnapshotList();
    
    expect(snapshots).toHaveLength(0);
  });

  it('should return status correctly', () => {
    const status = manager.getStatus();
    
    expect(status.isCapturing).toBe(false);
    expect(status.activeIntervals).toEqual([]);
  });
});