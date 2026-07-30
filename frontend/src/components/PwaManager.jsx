import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useAuth } from "../context/AuthContext";
import {
  clearInstallPrompt,
  subscribeToInstallPrompt,
} from "../services/pwaInstallPrompt";
import SystemNotification from "./SystemNotification";

const isStandaloneMode = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

const isIosDevice = () => {
  const userAgent = window.navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (/Macintosh/.test(userAgent) && window.navigator.maxTouchPoints > 1)
  );
};

const isProtectedEditingRoute = (pathname) =>
  pathname.startsWith("/contagem-estoque") ||
  pathname.startsWith("/planejamento-producao");

function PwaManager() {
  const { user } = useAuth();
  const location = useLocation();
  const previousUserRef = useRef(null);
  const offlineDialogRef = useRef(null);
  const [isOnline, setIsOnline] = useState(() => window.navigator.onLine);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [showInstallInstructions, setShowInstallInstructions] = useState(false);
  const [installClosing, setInstallClosing] = useState(false);
  const [standalone, setStandalone] = useState(isStandaloneMode);
  const dismissTimerRef = useRef(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error("Não foi possível registrar o aplicativo PWA.", error);
    },
  });

  useEffect(() => {
    return subscribeToInstallPrompt(({ installPrompt: nextPrompt, installed }) => {
      setInstallPrompt(nextPrompt);
      if (nextPrompt) setShowInstallInstructions(false);
      if (installed) {
        setInstallDismissed(true);
        setStandalone(true);
      }
    });
  }, []);

  useEffect(
    () => () => {
      if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
    },
    []
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const syncStandalone = () => setStandalone(isStandaloneMode());
    mediaQuery.addEventListener("change", syncStandalone);
    return () => mediaQuery.removeEventListener("change", syncStandalone);
  }, []);

  useEffect(() => {
    const previousUser = previousUserRef.current;
    if (user && !previousUser) {
      setInstallDismissed(false);
      setShowInstallInstructions(false);
    }
    previousUserRef.current = user;
  }, [user]);

  useEffect(() => {
    const handleOffline = () => setIsOnline(false);
    const handleOnline = () => setIsOnline(true);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  useEffect(() => {
    if (!isOnline) {
      offlineDialogRef.current?.focus();
    }
  }, [isOnline]);

  const canOfferInstall = Boolean(
    user &&
      !standalone &&
      !installDismissed
  );

  const showUpdate =
    needRefresh &&
    isOnline &&
    !isProtectedEditingRoute(location.pathname);

  const handleInstall = async () => {
    if (!installPrompt) {
      setShowInstallInstructions(true);
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    clearInstallPrompt();
    setInstallDismissed(true);
  };

  const dismissInstall = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInstallDismissed(true);
      return;
    }

    setInstallClosing(true);
    dismissTimerRef.current = window.setTimeout(() => {
      setInstallDismissed(true);
      setInstallClosing(false);
    }, 280);
  };

  const retryConnection = async () => {
    setCheckingConnection(true);
    try {
      const response = await fetch("/api/health", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.ok) setIsOnline(true);
    } catch {
      setIsOnline(false);
    } finally {
      setCheckingConnection(false);
    }
  };

  return (
    <>
      {!isOnline && (
        <div
          ref={offlineDialogRef}
          className="pwa-offline-overlay"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="pwa-offline-title"
          tabIndex="-1"
        >
          <div className="pwa-offline-card">
            <img src="/pwa/icon-192.png" alt="" />
            <h2 id="pwa-offline-title">Você está sem conexão</h2>
            <p>
              O FAQ EB precisa de internet para consultar dados e salvar alterações.
              A tela atual foi preservada.
            </p>
            <button type="button" onClick={retryConnection} disabled={checkingConnection}>
              {checkingConnection ? "Verificando..." : "Tentar novamente"}
            </button>
          </div>
        </div>
      )}

      {showUpdate && (
        <SystemNotification
          variant="info"
          title="Nova versão disponível"
          actions={
            <button type="button" onClick={() => updateServiceWorker(true)}>
              Atualizar agora
            </button>
          }
        >
          Atualize para usar a versão mais recente do FAQ EB.
        </SystemNotification>
      )}

      {!showUpdate && canOfferInstall && (
        <SystemNotification
          variant="brand"
          title="Instale o FAQ EB"
          className={installClosing ? "system-notification--leaving" : ""}
          actions={
            <>
              {showInstallInstructions ? (
                <button type="button" onClick={dismissInstall}>
                  Entendi
                </button>
              ) : (
                <button type="button" onClick={handleInstall}>
                  Instalar app
                </button>
              )}
              {!showInstallInstructions && (
                <button type="button" className="system-notification__secondary" onClick={dismissInstall}>
                  Agora não
                </button>
              )}
            </>
          }
        >
          {showInstallInstructions
            ? isIosDevice()
              ? "No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”."
              : "Abra o menu do navegador e escolha “Instalar FAQ EB” ou “Adicionar à tela inicial”."
            : "Acesse o FAQ EB pela tela inicial do seu dispositivo através do app."}
        </SystemNotification>
      )}
    </>
  );
}

export default PwaManager;
