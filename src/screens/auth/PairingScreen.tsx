/**
 * Pairing Screen for Haven Family Safety Application
 * Allows parents to pair with child devices using pairing codes
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, SafeAreaView } from 'react-native';
import { authService } from '../../services/auth/service';

export const PairingScreen: React.FC = () => {
  const [pairingCode, setPairingCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePairDevice = async () => {
    if (!pairingCode.trim()) {
      Alert.alert('Error', 'Please enter a pairing code');
      return;
    }

    setLoading(true);
    try {
      // In a real app, this would call the actual service
      const result = await authService.validateAndCompletePairing(pairingCode.trim());
      Alert.alert('Success', 'Device paired successfully!');
      // In a real app, we would navigate to the main dashboard here
    } catch (error) {
      if (error instanceof Error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert('Error', 'Failed to pair device');
      }
    } finally {
      setLoading(false);
    }
  };

  const generatePairingCode = async () => {
    try {
      // In a real app, this would call the actual service
      const pairingCode = await authService.createPairingCode('parent_123'); // Mock parent ID
      Alert.alert('Pairing Code Generated', `Use code: ${pairingCode.code}`);
    } catch (error) {
      Alert.alert('Error', 'Failed to generate pairing code');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Device Pairing</Text>
          <Text style={styles.subtitle}>Connect your child's device</Text>
        </View>

        <View style={styles.content}>
          <Text style={styles.instructionText}>
            Enter the pairing code from your child's device to connect them to your account.
          </Text>

          <View style={styles.codeContainer}>
            <TextInput
              style={styles.codeInput}
              placeholder="Enter pairing code (e.g. ABC123)"
              value={pairingCode}
              onChangeText={setPairingCode}
              autoCapitalize="characters"
              maxLength={6}
            />
          </View>

          <TouchableOpacity 
            style={[styles.button, loading && styles.buttonDisabled]} 
            onPress={handlePairDevice}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Pairing...' : 'Pair Device'}
            </Text>
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.divider} />
          </View>

          <TouchableOpacity 
            style={[styles.secondaryButton, styles.generateButton]} 
            onPress={generatePairingCode}
          >
            <Text style={styles.secondaryButtonText}>Generate Pairing Code</Text>
          </TouchableOpacity>

          <View style={styles.infoContainer}>
            <Text style={styles.infoTitle}>How to pair:</Text>
            <Text style={styles.infoText}>1. On your child's device, go to Settings → Pairing</Text>
            <Text style={styles.infoText}>2. Enter the code shown on this screen</Text>
            <Text style={styles.infoText}>3. Confirm on both devices</Text>
          </View>
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
    fontSize: 28,
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
    paddingTop: 30,
  },
  instructionText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 20,
    lineHeight: 24,
  },
  codeContainer: {
    marginBottom: 20,
  },
  codeInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisabled: {
    backgroundColor: '#cccccc',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginBottom: 20,
  },
  generateButton: {
    backgroundColor: '#f0f8ff',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#ddd',
  },
  dividerText: {
    paddingHorizontal: 15,
    color: '#666',
    fontSize: 14,
  },
  infoContainer: {
    marginTop: 30,
    padding: 15,
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
});