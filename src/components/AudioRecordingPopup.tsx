import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';

interface AudioRecordingPopupProps {
  isVisible: boolean;
  onClose: () => void;
}

const AudioRecordingPopup: React.FC<AudioRecordingPopupProps> = ({
  isVisible,
  onClose
}) => {
  const [selectedInterval, setSelectedInterval] = useState<number>(1);
  const [isRecording, setIsRecording] = useState(false);

  if (!isVisible) return null;

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.popupContainer}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Audio Recording</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.optionContainer}>
            <Text style={styles.title}>Choose Recording Type</Text>
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.actionButton, styles.periodicButton]}
                onPress={() => {
                  setIsRecording(true);
                }}
              >
                <Text style={styles.actionButtonText}>Periodic Record</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.actionButton, styles.liveButton]}
                onPress={() => {
                  setIsRecording(true);
                }}
              >
                <Text style={styles.actionButtonText}>Live Record</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          <View style={styles.optionContainer}>
            <Text style={styles.title}>Select Interval</Text>
            <View style={styles.intervalButtons}>
              {[1, 2, 3, 4, 5].map((interval) => (
                <TouchableOpacity
                  key={interval}
                  style={[
                    styles.intervalButton,
                    selectedInterval === interval && styles.selectedIntervalButton
                  ]}
                  onPress={() => setSelectedInterval(interval)}
                >
                  <Text 
                    style={[
                      styles.intervalButtonText,
                      selectedInterval === interval && styles.selectedIntervalButtonText
                    ]}
                  >
                    {interval} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          
          {isRecording && (
            <View style={styles.optionContainer}>
              <Text style={styles.title}>Active Recording</Text>
              <Text style={styles.statusText}>
                Recording with {selectedInterval} minute interval
              </Text>
              <TouchableOpacity
                style={[styles.actionButton, styles.stopButton]}
                onPress={() => setIsRecording(false)}
              >
                <Text style={styles.actionButtonText}>Stop Recording</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '85%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#666',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#333',
  },
  optionContainer: {
    marginBottom: 20,
  },
  intervalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  intervalButton: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    margin: 5,
    minWidth: 70,
    alignItems: 'center',
  },
  selectedIntervalButton: {
    backgroundColor: '#007AFF',
  },
  intervalButtonText: {
    fontSize: 14,
    color: '#666',
  },
  selectedIntervalButtonText: {
    color: 'white',
  },
  buttonContainer: {
    flexDirection: 'column',
    gap: 12,
  },
  actionButton: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  periodicButton: {
    backgroundColor: '#34C759',
  },
  liveButton: {
    backgroundColor: '#FF9500',
  },
  stopButton: {
    backgroundColor: '#FF3B30',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  statusText: {
    fontSize: 16,
    marginBottom: 5,
    color: '#333',
  },
});

export default AudioRecordingPopup;