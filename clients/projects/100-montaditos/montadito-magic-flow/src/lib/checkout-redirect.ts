export const redirectToCheckout = (url: string) => {
  window.open(url, '_top');
  window.setTimeout(() => {
    window.location.assign(url);
  }, 250);
};