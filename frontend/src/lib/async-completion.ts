export const attachAsyncCompletion = <T>(
  promise: Promise<T>,
  onFulfilled: (value: T) => void,
  onRejected: (error: unknown) => void,
) => {
  let active = true;
  void promise.then(
    (value) => {
      if (active) onFulfilled(value);
    },
    (error) => {
      if (active) onRejected(error);
    },
  );
  return () => {
    active = false;
  };
};
