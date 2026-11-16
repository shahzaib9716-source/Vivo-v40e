/**
 * Call Record Type Definitions for Haven Family Safety Application
 */

export interface CallRecord {
  id: string;
  contactName?: string;
  phoneNumber: string;
  type: 'incoming' | 'outgoing';
  duration?: number; // in seconds
  timestamp: Date;
  recordingUrl?: string;
  isMissed?: boolean;
}

/**
 * Call Statistics Interface
 */
export interface CallStats {
  totalCalls: number;
  totalDuration: number;
  incomingCalls: number;
  outgoingCalls: number;
}
