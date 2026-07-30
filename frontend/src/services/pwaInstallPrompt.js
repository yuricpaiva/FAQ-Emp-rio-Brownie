let deferredInstallPrompt = null;
let installed = false;
const subscribers = new Set();

const notifySubscribers = () => {
  const state = {
    installPrompt: deferredInstallPrompt,
    installed,
  };
  subscribers.forEach((subscriber) => subscriber(state));
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    notifySubscribers();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installed = true;
    notifySubscribers();
  });
}

export function subscribeToInstallPrompt(subscriber) {
  subscribers.add(subscriber);
  subscriber({
    installPrompt: deferredInstallPrompt,
    installed,
  });

  return () => subscribers.delete(subscriber);
}

export function clearInstallPrompt() {
  deferredInstallPrompt = null;
  notifySubscribers();
}
