/**
 * Enhanced WhatsApp Screen for Haven Family Safety Application
 * Allows parents to view WhatsApp chats, listen to voice notes and play videos
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, FlatList } from 'react-native';
import { SocialMediaManager, SocialMediaPost } from '../../services/social/SocialMediaManager';

// Mock data for WhatsApp conversations
const mockConversations = [
  {
    id: '1',
    name: 'Mom',
    lastMessage: 'Are you safe at school?',
    timestamp: new Date(Date.now() - 3600000),
    unread: 2,
  },
  {
    id: '2',
    name: 'Dad',
    lastMessage: 'Call me when you get home',
    timestamp: new Date(Date.now() - 7200000),
    unread: 0,
  }
];

const mockMessages: SocialMediaPost[] = [
  {
    id: '1',
    platform: 'whatsapp',
    sender: 'Mom',
    content: 'Are you safe at school?',
    type: 'text' as const,
    timestamp: new Date(Date.now() - 3600000),
  },
  {
    id: '2',
    platform: 'whatsapp',
    sender: 'Child',
    content: 'Yes, I am. The class is going well.',
    type: 'text' as const,
    timestamp: new Date(Date.now() - 3500000),
  },
  {
    id: '3',
    platform: 'whatsapp',
    sender: 'Mom',
    content: 'Great! Did you finish your homework?',
    type: 'text' as const,
    timestamp: new Date(Date.now() - 3400000),
  }
];

export const WhatsAppEnhancedScreen: React.FC = () => {
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<SocialMediaPost[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [socialManager] = useState(() => SocialMediaManager.getInstance());

  useEffect(() => {
    // Initialize with mock data
    setConversations(mockConversations);
    setMessages(mockMessages);
    
    // Start monitoring social media
    socialManager.startMonitoring(['whatsapp']);
  }, []);

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversation(conversationId);
    // In a real implementation, this would load actual conversation data
    console.log('Selected conversation:', conversationId);
  };

  const handlePlayVoiceNote = async (postId: string) => {
    // In a real implementation, this would play the voice note
    console.log('Playing voice note:', postId);
    await socialManager.playVoiceNote(postId);
  };

  const handlePlayVideo = async (postId: string) => {
    // In a real implementation, this would play the video
    console.log('Playing video:', postId);
    await socialManager.playVideo(postId);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderConversationItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.conversationItem}
      onPress={() => handleSelectConversation(item.id)}
    >
      <View style={styles.conversationHeader}>
        <Text style={styles.conversationName}>{item.name}</Text>
        <Text style={styles.conversationTime}>{formatTime(item.timestamp)}</Text>
      </View>
      <View style={styles.conversationDetails}>
        <Text style={styles.lastMessage} numberOfLines={1}>
          {item.lastMessage}
        </Text>
        {item.unread > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{item.unread}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderMessageItem = ({ item }: { item: SocialMediaPost }) => {
    const isMe = item.sender === 'Child';
    
    return (
      <View style={[styles.messageContainer, isMe ? styles.myMessage : styles.otherMessage]}>
        <Text style={styles.messageText}>{item.content}</Text>
        <Text style={styles.messageTime}>{formatTime(item.timestamp)}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {selectedConversation ? (
        // Conversation view
        <View style={styles.conversationView}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => setSelectedConversation(null)}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          
          <FlatList
            data={messages}
            renderItem={renderMessageItem}
            keyExtractor={(item) => item.id}
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
          />
          
          <View style={styles.messageInputContainer}>
            <Text style={styles.messageInputPlaceholder}>Type a message...</Text>
          </View>
        </View>
      ) : (
        // Conversations list view
        <View style={styles.listView}>
          <View style={styles.header}>
            <Text style={styles.title}>WhatsApp</Text>
          </View>
          
          <FlatList
            data={conversations}
            renderItem={renderConversationItem}
            keyExtractor={(item) => item.id}
            style={styles.conversationList}
            contentContainerStyle={styles.conversationListContent}
          />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listView: {
    flex: 1,
  },
  conversationView: {
    flex: 1,
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
  conversationList: {
    flex: 1,
  },
  conversationListContent: {
    padding: 16,
  },
  conversationItem: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  conversationName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  conversationTime: {
    fontSize: 14,
    color: '#666',
  },
  conversationDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 16,
    color: '#666',
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  backButton: {
    padding: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: 'bold',
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: 16,
  },
  messageContainer: {
    maxWidth: '80%',
    padding: 12,
    marginBottom: 12,
    borderRadius: 12,
  },
  myMessage: {
    backgroundColor: '#007AFF',
    alignSelf: 'flex-end',
  },
  otherMessage: {
    backgroundColor: 'white',
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 16,
    color: 'black',
  },
  messageTime: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
    marginTop: 4,
  },
  messageInputContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  messageInputPlaceholder: {
    fontSize: 16,
    color: '#999',
  },
});