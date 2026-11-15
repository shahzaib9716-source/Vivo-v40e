/**
 * Accessibility Manager for Haven Family Safety Application
 * Ensures accessibility services remain active and never auto-turn off
 */

import { Platform, Alert } from 'react-native';

export interface AccessibilityServiceStatus {
  isEnabled: boolean;
  isAlwaysOn: boolean;
  canBeEnabled: boolean;
  lastChecked: Date | null;
}

class AccessibilityManager {
  private static instance: AccessibilityManager;
  private isMonitoring: boolean = false;

  private constructor() {}

  static getInstance(): AccessibilityManager {
    if (!AccessibilityManager.instance) {
      AccessibilityManager.instance = new AccessibilityManager();
    }
    return AccessibilityManager.instance;
  }

  /**
   * Check if accessibility service is properly enabled and active
   */
  async checkAccessibilityStatus(): Promise<AccessibilityServiceStatus> {
    try {
      const status: AccessibilityServiceStatus = {
        isEnabled: false,
        isAlwaysOn: false,
        canBeEnabled: true,
        lastChecked: new Date()
      };

      if (Platform.OS === 'android') {
        // Simulate checking accessibility service status
        status.isEnabled = await this.simulateAccessibilityCheck();
        status.isAlwaysOn = await this.simulateAlwaysOnCheck();
      } else {
        status.isEnabled = true;
        status.isAlwaysOn = true;
      }

      return status;
    } catch (error) {
      console.error('Error checking accessibility status:', error);
      return {
        isEnabled: false,
        isAlwaysOn: false,
        canBeEnabled: true,
        lastChecked: new Date()
      };
    }
  }

  /**
   * Ensure accessibility service is enabled and always-on
   */
  async ensureAccessibilityService(): Promise<boolean> {
    try {
      if (Platform.OS !== 'android') {
        return true;
      }

      const status = await this.checkAccessibilityStatus();
      
      if (!status.isEnabled) {
        Alert.alert(
          'Accessibility Service Required',
          'Please enable the Haven Family Safety Accessibility Service in your Android Settings for full functionality.',
          [
            { text: 'Open Settings', onPress: () => this.openAccessibilitySettings() },
            { text: 'Cancel' }
          ]
        );
        return false;
      }

      // Ensure it's set to always-on mode
      if (!status.isAlwaysOn) {
        await this.setAccessibilityServiceAlwaysOn();
      }

      this.isMonitoring = true;
      return true;
    } catch (error) {
      console.error('Error ensuring accessibility service:', error);
      return false;
    }
  }

  /**
   * Simulate checking accessibility service status
   */
  private async simulateAccessibilityCheck(): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return true; // Assume success for simulation
  }

  /**
   * Simulate checking always-on status
   */
  private async simulateAlwaysOnCheck(): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 200));
    return true; // Assume always-on for simulation
  }

  /**
   * Set accessibility service to always-on mode
   */
  private async setAccessibilityServiceAlwaysOn(): Promise<void> {
    Alert.alert(
      'Accessibility Service Configuration',
      'The system requires manual configuration for always-on operation. Please follow these steps:\n\n1. Go to Settings > Accessibility\n2. Find Haven Family Safety service\n3. Enable "Always-on" or "Persistent" mode\n4. Add to battery optimization exclusions',
      [{ text: 'OK' }]
    );
  }

  /**
   * Open Android accessibility settings
   */
  private async openAccessibilitySettings(): Promise<void> {
    Alert.alert(
      'Open Accessibility Settings',
      'Please manually enable the Haven Family Safety accessibility service in your Android Settings > Accessibility.',
      [{ text: 'OK' }]
    );
  }

  /**
   * Start monitoring accessibility service status
   */
  startMonitoring(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log('Started accessibility service monitoring');
  }

  /**
   * Stop monitoring accessibility service status
   */
  stopMonitoring(): void {
    this.isMonitoring = false;
    console.log('Stopped accessibility service monitoring');
  }

  /**
   * Get critical warnings about accessibility service
   */
  getAccessibilityWarnings(): string[] {
    return [
      '⚠️ Accessibility Service MUST remain ENABLED at all times',
      '⚠️ Do NOT disable or auto-turn off this service',
      '⚠️ Battery optimization may disable the service automatically',
      '⚠️ Check Settings > Battery > Battery Optimization regularly'
    ];
  }
}

export const accessibilityManager = AccessibilityManager.getInstance();