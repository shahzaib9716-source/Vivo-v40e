# Audio Recording System Documentation

This document explains the implementation and usage of the audio recording system for the Haven Family Safety Application.

## Overview

The audio recording system provides two main features:
1. **Periodic Recording**: Record audio every X minutes (where X can be 1, 2, 3, 4, or 5) for 23 seconds each time
2. **Live Recording**: Continuous live recording with real-time listening capability

Both features include pop-up interfaces that work alongside existing camera functionality.

## Implementation Details

### Audio Manager (`AudioManager`)

The core of the system is the `AudioManager` class which:

1. Manages audio recording operations
2. Handles storage and organization of recorded files
3. Provides methods for cleanup, listing, and status checking
4. Implements a singleton pattern to ensure consistent state

### Configuration

- **Periodic Recording**: Can be set for intervals of 1, 2, 3, 4, or 5 minutes
- **Duration**: Each recording is 23 seconds as specified in requirements
- **Live Recording**: Continuous capture with 23-second segments

## Usage Examples

### Basic Setup

```typescript
import { setupPeriodicAudioRecording } from './src/utils/audio/periodicAudioSetup';

// Start periodic audio recording every 3 minutes for 23 seconds
const stopRecording = setupPeriodicAudioRecording(3);

// Later to stop:
stopRecording();
```

### Live Recording

```typescript
import { setupLiveAudioRecording } from './src/utils/audio/periodicAudioSetup';

// Start continuous live audio recording 
const stopRecording = setupLiveAudioRecording();

// Later to stop:
stopRecording();
```

### Complete Setup (Both Features)

```typescript
import { setupCompleteAudioRecording } from './src/utils/audio/periodicAudioSetup';

// Start both periodic and live recording
const stopAllRecording = setupCompleteAudioRecording(2);

// Later to stop both:
stopAllRecording();
```

### Manual Control

```typescript
import { AudioRecordingController } from './src/utils/audio/audioRecordingUtils';

const controller = AudioRecordingController.getInstance();

// Start periodic recording every 1 minute
const stopPeriodic = controller.startPeriodicAudio(1);

// Start live recording  
const stopLive = controller.startLiveAudio();

// Stop both
stopPeriodic();
stopLive();
```

### Pop-up Interface Integration

```typescript
import AudioRecordingPopup from './src/components/AudioRecordingPopup';

// In your component:
const [showAudioPopup, setShowAudioPopup] = useState(false);

// Render the popup when needed
<AudioRecordingPopup 
  isVisible={showAudioPopup}
  onClose={() => setShowAudioPopup(false)}
/>
```

## File Structure

```
/src/utils/audio/
├── audioManager.ts                 # Core audio management
├── periodicAudioSetup.ts          # Setup functions for different capture patterns
├── audioRecordingUtils.ts         # Unified controller for audio operations
└── /tests/                       # Test files
    └── audioManager.test.ts

/src/components/
└── AudioRecordingPopup.tsx       # Pop-up UI component
```

## Key Features

1. **Periodic Recording**: Every 1, 2, 3, 4, or 5 minutes for 23 seconds
2. **Live Recording**: Continuous capture with real-time listening
3. **Pop-up Interface**: User-friendly controls for both recording types
4. **Integrated UI**: Works seamlessly with camera features
5. **Storage Management**: Automatic cleanup of old recordings
6. **Metadata Tracking**: Stores information about each recording
7. **Background Processing**: Runs without blocking UI
8. **Flexible Setup**: Multiple initialization patterns

## Integration with Existing Features

The audio system integrates seamlessly with the existing camera snapshot and screenshot systems:

1. **Camera + Audio Synchronization**: When using live camera, mic is automatically active
2. **Pop-up Interface**: Both features use the same pop-up pattern as other monitoring tools
3. **Background Operation**: All recording runs in background without UI interference
4. **Unified Control**: Can be controlled independently or together with other monitoring systems

## Example Use Case: Live Camera + Audio

When using live camera viewing, both camera and audio recording should be active simultaneously:

1. User opens live camera view
2. Camera starts streaming 
3. Microphone activates automatically for audio recording
4. All recordings are saved to separate directories
5. Pop-up allows user to control recording settings
6. User can stop either recording independently

This system works alongside your existing camera snapshot and screenshot functionality, providing comprehensive monitoring capabilities.