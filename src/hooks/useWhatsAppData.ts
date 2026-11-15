/**
 * Custom hook for WhatsApp data management
 */

import { useState, useEffect } from 'react';
import { whatsappService, WhatsAppMessage, WhatsAppCall, WhatsAppMedia } from '../services/whatsapp/WhatsAppService';

export interface WhatsAppData {
  messages: WhatsAppMessage[];
  calls: WhatsAppCall[];
  media: WhatsAppMedia[];
  loading: boolean;
  error: string | null;
}

export const useWhatsAppData = (contact: string) => {
  const [data, setData] = useState<WhatsAppData>({
    messages: [],
    calls: [],
    media: [],
    loading: false,
    error: null
  });

  const fetchData = async () => {
    setData(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const result = await whatsappService.getAllData(contact);
      setData({
        messages: result.messages,
        calls: result.calls,
        media: result.media,
        loading: false,
        error: null
      });
    } catch (error) {
      setData(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch WhatsApp data'
      }));
    }
  };

  useEffect(() => {
    fetchData();
  }, [contact]);

  const refreshData = () => {
    fetchData();
  };

  return {
    ...data,
    refreshData
  };
};