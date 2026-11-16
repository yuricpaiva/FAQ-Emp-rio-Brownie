import { useEffect } from "react";

export default function useUnsavedChanges(isDirty) {
  useEffect(() => {
    if (!isDirty) return undefined;
    const message = "Existem alterações não salvas. Deseja sair e descartá-las?";
    const beforeUnload = (event) => { event.preventDefault(); event.returnValue = ""; };
    const linkGuard = (event) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link || link.target === "_blank" || link.origin !== window.location.origin) return;
      if (!window.confirm(message)) event.preventDefault();
    };
    const historyGuard = () => {
      if (!window.confirm(message)) window.history.forward();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", linkGuard, true);
    window.addEventListener("popstate", historyGuard);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", linkGuard, true);
      window.removeEventListener("popstate", historyGuard);
    };
  }, [isDirty]);
}
