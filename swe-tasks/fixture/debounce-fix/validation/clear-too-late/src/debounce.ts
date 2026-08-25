export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return function (this: unknown, ...args: Parameters<T>) {
    timeout = setTimeout(() => {
      clearTimeout(timeout);
      fn.apply(this, args);
    }, delay);
  };
}
