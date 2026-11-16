/**
 * Permission Guide Component for Haven Family Safety Application
 * Helps guide users through required Android permissions
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { permissionManager } from '../services/permissions/PermissionManager';

export const PermissionGuide: React.FC = () => {
  const handleCheckPermissions = async () => {
    // In a real implementation, this would check actual permissions
    // For now we'll just show an alert
    await permissionManager.checkAllPermissions();
    // Would normally navigate to permission status screen
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Permissions Required</Text>
      <Text style={styles.description}>
        To provide full family safety monitoring, Haven needs several permissions to be enabled.
      </Text>
      
      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={handleCheckPermissions}>
        <Text style={styles.secondaryButtonText}>Check Permissions Now</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 8,
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