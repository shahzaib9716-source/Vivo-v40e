# Camera Snapshot System Documentation

This document explains the implementation and usage of the camera snapshot system for the Haven Family Safety Application.

## Overview

The camera snapshot system captures images from both front and rear cameras at specific timing intervals as requested in the requirements. It works alongside the existing screenshot functionality to provide comprehensive monitoring capabilities.

## Implementation Details

### Camera Snapshot Manager (`CameraSnapshotManager`)

The core of the system is the `CameraSnapshotManager` class which:

1. Manages camera snapshot captures
2. Handles storage and organization of captured images
3. Provides methods for cleanup and status checking
4. Implements a singleton pattern to ensure consistent state

### Configuration

The system supports specific timing intervals:
- 3 minutes with rear camera
- 6 minutes with front camera  
- 9 minutes with rear camera
- 12 minutes with front camera

## Usage Examples

### Basic Setup

```typescript
import { setupSpecificIntervalCameraSnapshots } from './src/utils/camera/periodicCameraSnapshotSetup';

// Start camera snapshots at specified intervals
const stopCapture = setupSpecificIntervalCameraSnapshots();

// Later to stop:
stopCapture();
```

### Integration with Existing Screenshots

```typescript
import { initializeMonitoringSystem } from './src/utils/initCameraAndScreenshots';

// This initializes both screenshot and camera snapshot systems
const stopAllMonitoring = initializeMonitoringSystem();

// Stop both systems
stopAllMonitoring();
```

### Manual Camera Capture

```typescript
import { CameraSnapshotManager } from './src/utils/camera/cameraSnapshotManager';

const manager = CameraSnapshotManager.getInstance();

// Take a front camera snapshot
const frontSnapshotPath = await manager.captureCameraSnapshot('front');

// Take a rear camera snapshot  
const rearSnapshotPath = await manager.captureCameraSnapshot('rear');
```

### Camera Status and Cleanup

```typescript
import { CameraSnapshotManager } from './src/utils/camera/cameraSnapshotManager';

const manager = CameraSnapshotManager.getInstance();

// Check current status
const status = manager.getStatus();
console.log('Is capturing:', status.isCapturing);
console.log('Active intervals:', status.activeIntervals);

// Cleanup old snapshots (keeps 50 most recent)
await manager.cleanupOldCameraSnapshots(50);
```

## File Structure

```
/src/utils/camera/
├── cameraSnapshotManager.ts      # Main camera snapshot manager
├── periodicCameraSnapshotSetup.ts # Setup functions for different capture patterns
└── /tests/                       # Test files
    └── cameraSnapshotManager.test.ts
```

## Key Features

1. **Dual Camera Support**: Captures from both front and rear cameras
2. **Configurable Intervals**: Supports custom timing intervals 
3. **Automatic Cleanup**: Removes old snapshots to manage storage
4. **Metadata Tracking**: Stores information about each snapshot
5. **Background Processing**: Runs in background without blocking UI
6. **Flexible Setup**: Multiple initialization patterns for different use cases

## Integration with Existing Screenshot System

The camera snapshot system integrates seamlessly with the existing screenshot system:

- Both systems run simultaneously 
- Each has its own storage directory
- Both support cleanup and status monitoring
- Shared interface for starting/stopping monitoring