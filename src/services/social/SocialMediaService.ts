/**
 * Social Media Service for Haven Family Safety Application
 * Handles multiple social media platforms (WhatsApp, Instagram, Snapchat)
 */

import { Platform } from 'react-native';

// Types for social media data
export interface SocialPost {
  id: string;
  platform: 'whatsapp' | 'instagram' | 'snapchat';
  type: 'text' | 'image' | 'video' | 'voice_note' | 'call' | 'photo' | 'story';
  content: string;
  timestamp: Date;
  isRead?: boolean;
  sender?: string;
  likes?: number;
  comments?: number;
  viewed?: boolean;
  duration?: number;
  contact?: string;
}

export interface SocialCall {
  id: string;
  platform: 'whatsapp' | 'instagram' | 'snapchat';
  contact: string;
  duration: number; // in seconds
  timestamp: Date;
  type: 'incoming' | 'outgoing';
  recordingUrl?: string;
}

export interface SocialMedia {
  id: string;
  platform: 'whatsapp' | 'instagram' | 'snapchat';
  type: 'image' | 'voice_note' | 'photo';
  url: string;
  timestamp: Date;
  sender: 'me' | 'contact';
  contact?: string;
}

class SocialMediaService {
  private static instance: SocialMediaService;

  private constructor() {}

  static getInstance(): SocialMediaService {
    if (!SocialMediaService.instance) {
      SocialMediaService.instance = new SocialMediaService();
    }
    return SocialMediaService.instance;
  }

  /**
   * Get social media posts for a specific platform
   */
  async getPosts(platform: 'whatsapp' | 'instagram' | 'snapchat'): Promise<SocialPost[]> {
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return [
      {
        id: `${platform}1`,
        platform,
        type: 'text',
        content: `Sample ${platform} post content`,
        timestamp: new Date(),
        sender: 'child'
      }
    ];
  }

  /**
   * Get social media calls for a specific platform
   */
  async getCalls(platform: 'whatsapp' | 'instagram' | 'snapchat'): Promise<SocialCall[]> {
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return [
      {
        id: `${platform}call1`,
        platform,
        contact: 'Friend',
        duration: 180,
        timestamp: new Date(),
        type: 'incoming'
      }
    ];
  }

  /**
   * Get social media media (photos and voice notes)
   */
  async getMedia(platform: 'whatsapp' | 'instagram' | 'snapchat'): Promise<SocialMedia[]> {
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return [
      {
        id: `${platform}media1`,
        platform,
        type: 'image',
        url: `sample_${platform}_photo.jpg`,
        timestamp: new Date(),
        sender: 'child'
      }
    ];
  }

  /**
   * Get all social media data for a specific platform
   */
  async getAllData(platform: 'whatsapp' | 'instagram' | 'snapchat'): Promise<{
    posts: SocialPost[];
    calls: SocialCall[];
    media: SocialMedia[];
  }> {
    try {
      const [posts, calls, media] = await Promise.all([
        this.getPosts(platform),
        this.getCalls(platform),
        this.getMedia(platform)
      ]);

      return { posts, calls, media };
    } catch (error) {
      console.error(`Error fetching ${platform} data:`, error);
      throw new Error(`Failed to fetch ${platform} data`);
    }
  }

  /**
   * Get all available social platforms
   */
  getAvailablePlatforms(): Array<{ id: 'whatsapp' | 'instagram' | 'snapchat', name: string, icon: string }> {
    return [
      { id: 'whatsapp', name: 'WhatsApp', icon: '💬' },
      { id: 'instagram', name: 'Instagram', icon: '📷' },
      { id: 'snapchat', name: 'Snapchat', icon: '👻' }
    ];
  }

  /**
   * Check if social platform is installed on the device
   */
  async isPlatformInstalled(platform: 'whatsapp' | 'instagram' | 'snapchat'): Promise<boolean> {
    // Mock implementation
    return true;
  }
}

export const socialMediaService = SocialMediaService.getInstance();