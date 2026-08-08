export type RoomAsyncContext = {
  roomId: string;
  seatId: string | null;
  stageId: string;
};

export const isActiveRoomAsyncContext = (captured: RoomAsyncContext, current: RoomAsyncContext) =>
  captured.roomId === current.roomId && captured.seatId === current.seatId && captured.stageId === current.stageId;

export const attachRoomAsyncCompletion = <T>(
  promise: Promise<T>,
  captured: RoomAsyncContext,
  getCurrent: () => RoomAsyncContext,
  onFulfilled: (value: T) => void,
  onRejected: (error: unknown) => void,
) => {
  let active = true;
  void promise.then(
    (value) => {
      if (active && isActiveRoomAsyncContext(captured, getCurrent())) onFulfilled(value);
    },
    (error) => {
      if (active && isActiveRoomAsyncContext(captured, getCurrent())) onRejected(error);
    },
  );
  return () => {
    active = false;
  };
};
