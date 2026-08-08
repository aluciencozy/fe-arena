export type RoomAsyncContext = {
  roomId: string;
  seatId: string | null;
  stageId: string;
};

export const isActiveRoomAsyncContext = (captured: RoomAsyncContext, current: RoomAsyncContext) =>
  captured.roomId === current.roomId && captured.seatId === current.seatId && captured.stageId === current.stageId;
