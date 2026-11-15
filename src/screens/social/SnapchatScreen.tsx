/**
 * Snapchat Screen for Haven Family Safety Application
 * Displays Snapchat snaps, stories and interactions
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';

export const SnapchatScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'snaps' | 'stories' | 'interactions'>('snaps');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Snapchat Monitoring</Text>
          <Text style={styles.subtitle}>Snaps, stories and interactions from child's Snapchat</Text>
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'snaps' && styles.activeTab]} 
            onPress={() => setActiveTab('snaps')}
          >
            <Text style={[styles.tabText, activeTab === 'snaps' && styles.activeTabText]}>Snaps</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'stories' && styles.activeTab]} 
            onPress={() => setActiveTab('stories')}
          >
            <Text style={[styles.tabText, activeTab === 'stories' && styles.activeTabText]}>Stories</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'interactions' && styles.activeTab]} 
            onPress={() => setActiveTab('interactions')}
          >
            <Text style={[styles.tabText, activeTab === 'interactions' && styles.activeTabText]}>Interactions</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.placeholderText}>
            {activeTab === 'snaps' && 'Snapchat Snaps will appear here'}
            {activeTab === 'stories' && 'Snapchat Stories will appear here'}
            {activeTab === 'interactions' && 'Snapchat Interactions will appear here'}
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
    backgroundColor: '#FFFC00',
    padding: 20,
    paddingTop: 50,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(51, 51, 51, 0.8)',
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
    borderBottomColor: '#FFFC00',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  activeTabText: {
    color: '#FFFC00',
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