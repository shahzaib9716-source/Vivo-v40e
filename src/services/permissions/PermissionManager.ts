/** 
 * Permission Manager for Haven Family Safety Application
 * Handles complex permission requirements for Android devices
 */
import { Platform, Alert } from 'react-native';
import { PermissionsAndroid } from 'react-native';
import { accessibilityManager } from './AccessibilityManager';

export interface PermissionStatus {
  granted: boolean;
  rationale?: string;
}

class PermissionManager {
  private static instance: PermissionManager;

  private constructor() {}

  static getInstance(): PermissionManager {
    if (!PermissionManager.instance) {
      PermissionManager.instance = new PermissionManager();
    }
    return PermissionManager.instance;
  }

  /**
   * Check and request basic permissions
   */
  async checkAndRequestBasicPermissions(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        const requiredPermissions: string[] = [
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        ];

        for (const permission of requiredPermissions) {
          const granted = await PermissionsAndroid.check(permission as any);
          if (!granted) {
            const result = await this.requestPermission(permission as any);
            if (!result) {
              return false;
            }
          }
        }
      }
      return true;
    } catch (error) {
      console.error('Error checking/requesting basic permissions:', error);
      Alert.alert(
        'Permission Error',
        'Failed to check or request required permissions.'
      );
      return false;
    }
  }

  /**
   * Request a single permission
   */
  private async requestPermission(permission: string): Promise<boolean> {
    try {
      const granted = await PermissionsAndroid.request(
        permission as any,
        {
          title: 'Haven Family Safety Permissions',
          message: `Haven needs ${this.getPermissionDescription(permission)} to function properly.`,
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );

      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (error) {
      console.error('Error requesting permission:', error);
      return false;
    }
  }

  /**
   * Get description for a specific permission
   */
  private getPermissionDescription(permission: string): string {
    switch (permission) {
      case PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION:
        return 'location access to track family members';
      case PermissionsAndroid.PERMISSIONS.CAMERA:
        return 'camera access for snapshots and video calls';
      case PermissionsAndroid.PERMISSIONS.RECORD_AUDIO:
        return 'audio recording for call monitoring';
      case PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE:
      case PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE:
        return 'storage access to save data and media files';
      default:
        return 'this permission';
    }
  }

  /**
   * Show permissions guide
   */
  showPermissionsGuide(): void {
    Alert.alert(
      'Required Permissions',
      `For full functionality on Android 16/17 devices, please enable these permissions:

• Accessibility Service (keyboard monitoring)
• Device Administrator (system controls)  
• Background Location (continuous tracking)
• Background Audio Recording (call monitoring)
• Background Camera Access (snapshots)
• Background Data for real-time updates

⚠️ IMPORTANT: The Accessibility Service MUST NEVER be auto-turned OFF.
Please check your battery optimization settings to ensure it stays active.

Please follow the on-screen instructions to grant these permissions.`,
      [{ text: 'OK' }]
    );
  }

  /**
   * Check all permissions status
   */
  async checkAllPermissions(): Promise<Record<string, PermissionStatus>> {
    const results: Record<string, PermissionStatus> = {};
    
    if (Platform.OS === 'android') {
      const basicPermissions: string[] = [
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      ];
      
      for (const permission of basicPermissions) {
        const granted = await PermissionsAndroid.check(permission as any);
        results[permission] = {
          granted,
          rationale: this.getPermissionDescription(permission)
        };
      }
    }
    
    return results;
  }

  /**
   * Ensure accessibility service is properly configured
   */
  async ensureAccessibilityServiceActive(): Promise<boolean> {
    try {
      // Start monitoring accessibility service
      accessibilityManager.startMonitoring();
      
      // Check and ensure it's active
      const isActive = await accessibilityManager.ensureAccessibilityService();
      
      if (isActive) {
        console.log('Accessibility service is properly configured');
      }
      
      return isActive;
    } catch (error) {
      console.error('Error ensuring accessibility service:', error);
      return false;
    }
  }

  /**
   * Get accessibility warnings
   */
  getAccessibilityWarnings(): string[] {
    return accessibilityManager.getAccessibilityWarnings();
  }
}

export const permissionManager = PermissionManager.getInstance();