export interface UnifiedMessage {
  id: string;
  type: "SYSTEM" | "USER";
  sender?: string;
  text: string;
  timestamp: number;
}
