// Test file to verify all our fixed modules compile correctly
import { AudioManager } from './src/utils/audio/audioManager';
import { CameraSnapshotManager } from './src/utils/camera/cameraSnapshotManager';
import { ScreenshotManager } from './src/utils/screenshots/screenshotManager';

// Just test that the imports work
const audioManager = AudioManager.getInstance();
const cameraManager = CameraSnapshotManager.getInstance();
const screenshotManager = ScreenshotManager.getInstance();

console.log('All modules compiled and imported successfully');