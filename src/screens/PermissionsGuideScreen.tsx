import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { permissionManager } from '../services/permissions/PermissionManager';

export const PermissionsGuideScreen: React.FC = () => {
  const handleShowGuide = () => {
    // In a real implementation, this would show the detailed guide
    console.log('Showing permissions guide');
  };

  const handleCheckPermissions = async () => {
    // In a real implementation, this would check actual permissions
    // For now we'll just show an alert
    const permissions = await permissionManager.checkAllPermissions();
    console.log('Current permissions:', permissions);
    // Would normally navigate to permission status screen
  };

  return (
    <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Required Permissions</Text>
            <Text style={styles.subtitle}>For full functionality on Android 16/17</Text>
          </View>

          <View style={styles.content}>
            <Text style={styles.sectionTitle}>Why These Permissions Are Needed</Text>
            
            <View style={styles.infoCard}>
              <Text style={styles.cardTitle}>Accessibility Service</Text>
              <Text style={styles.cardDescription}>
                Required for monitoring keyboard input, screen activities, and app usage to detect 
                potential safety issues or inappropriate content.
              </Text>
              <Text style={[styles.warningText, styles.accessibilityWarning]}>
                ⚠️ CRITICAL: This service MUST NEVER be auto-turned OFF
              </Text>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.cardTitle}>Device Administrator</Text>
              <Text style={styles.cardDescription}>
                Needed for background services, app restrictions, and system-level controls 
                to maintain family safety settings.
              </Text>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.cardTitle}>Background Location</Text>
              <Text style={styles.cardDescription}>
                Essential for continuous location tracking when the app is in the background, 
                ensuring real-time monitoring of family members.
              </Text>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.cardTitle}>Audio Recording</Text>
              <Text style={styles.cardDescription}>
                Required for monitoring phone calls and capturing audio conversations to 
                detect potential safety concerns.
              </Text>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.cardTitle}>Camera Access</Text>
              <Text style={styles.cardDescription}>
                Needed for taking snapshots and video calls to provide visual monitoring 
                capabilities for parents.
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Accessibility Service Critical Requirements</Text>
            
            <View style={styles.warningCard}>
              <Text style={styles.warningText}>⚠️ Accessibility Service MUST remain ENABLED at all times</Text>
            </View>
            <View style={styles.warningCard}>
              <Text style={styles.warningText}>⚠️ Do NOT disable or auto-turn off this service</Text>
            </View>
            <View style={styles.warningCard}>
              <Text style={styles.warningText}>⚠️ Battery optimization may disable the service automatically</Text>
            </View>
            <View style={styles.warningCard}>
              <Text style={styles.warningText}>⚠️ Check Settings &gt; Battery &gt; Battery Optimization regularly</Text>
            </View>

            <TouchableOpacity style={styles.button} onPress={handleShowGuide}>
              <Text style={styles.buttonText}>View Detailed Permissions Guide</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={handleCheckPermissions}>
              <Text style={styles.secondaryButtonText}>Check Current Permissions</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flexGrow: 1,
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 20,
    paddingTop: 50,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 8,
  },
  content: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  warningText: {
    fontSize: 14,
    color: '#d32f2f',
    fontWeight: '500',
  },
  accessibilityWarning: {
    backgroundColor: '#fff3e0',
    padding: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  warningCard: {
    backgroundColor: '#ffebee',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});