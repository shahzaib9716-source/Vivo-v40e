// Test file to verify all core modules compile correctly after fixes
import { AuthProvider } from './src/hooks/useAuth';
import { AudioManager } from './src/utils/audio/audioManager';
import { CameraSnapshotManager } from './src/utils/camera/cameraSnapshotManager';
import { ScreenshotManager } from './src/utils/screenshots/screenshotManager';

// Simple test that imports work correctly
const authProvider = AuthProvider;
const audioManager = AudioManager.getInstance();
const cameraManager = CameraSnapshotManager.getInstance();
const screenshotManager = ScreenshotManager.getInstance();

console.log('All core modules imported and instantiated successfully');