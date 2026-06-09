export function notify(message: string) {
  window.dispatchEvent(new CustomEvent<string>('busradar:toast', { detail: message }));
}
