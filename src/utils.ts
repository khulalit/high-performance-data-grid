export function debounce<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: number | null = null;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId!);
    timeoutId = window.setTimeout(() => callback(...args), delay);
  };
}

export function calculateHeight(fixedDeduction: number) {
  const viewportHeight = window.innerHeight;
  const calculatedHeight = viewportHeight - fixedDeduction;
  return calculatedHeight;
}

export function throttle<A extends any[], R>(
  func: (...args: A) => R,
  delay: number
): (...args: A) => void {
  let isThrottled = false;
  let lastArgs: A | null = null;
  let lastThis: any = null;

  return function (this: any, ...args: A) {
    lastArgs = args;
    lastThis = this;

    if (isThrottled) {
      return;
    }

    func.apply(lastThis, lastArgs);

    isThrottled = true;

    setTimeout(() => {
      isThrottled = false;
    }, delay);
  } as any;
}
