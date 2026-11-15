/**
 * WhatsApp Screen for Haven Family Safety Application
 * Displays WhatsApp messages, voice notes, photos and call recordings
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';

export const WhatsAppScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'messages' | 'calls' | 'media'>('messages');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>WhatsApp Monitoring</Text>
          <Text style={styles.subtitle}>Messages, calls and media from child's WhatsApp</Text>
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'messages' && styles.activeTab]} 
            onPress={() => setActiveTab('messages')}
          >
            <Text style={[styles.tabText, activeTab === 'messages' && styles.activeTabText]}>Messages</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'calls' && styles.activeTab]} 
            onPress={() => setActiveTab('calls')}
          >
            <Text style={[styles.tabText, activeTab === 'calls' && styles.activeTabText]}>Calls</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'media' && styles.activeTab]} 
            onPress={() => setActiveTab('media')}
          >
            <Text style={[styles.tabText, activeTab === 'media' && styles.activeTabText]}>Media</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.placeholderText}>
            {activeTab === 'messages' && 'WhatsApp Messages will appear here'}
            {activeTab === 'calls' && 'WhatsApp Calls and Recordings will appear here'}
            {activeTab === 'media' && 'WhatsApp Photos and Voice Notes will appear here'}
          </Text>
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
    backgroundColor: '#128C7E',
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
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 3,
    borderBottomColor: '#128C7E',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  activeTabText: {
    color: '#128C7E',
    fontWeight: 'bold',
  },
  content: {
    padding: 20,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
  },
});