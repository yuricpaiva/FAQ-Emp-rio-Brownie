import { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";
import SystemNotification from "../components/SystemNotification";

const BI_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const BI_UPDATED_MESSAGE_MS = 2500;

function addRefreshParameter(url, refreshToken) {
  try {
    const refreshedUrl = new URL(url);
    refreshedUrl.searchParams.set("faq_refresh", String(refreshToken));
    return refreshedUrl.toString();
  } catch {
    return url;
  }
}

function formatTime(timestamp) {
  if (!timestamp) return "--:--";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function formatCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function PowerBI() {
  const [configuration, setConfiguration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(() => Date.now());
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(BI_REFRESH_INTERVAL_MS / 1000);
  const [recentlyUpdated, setRecentlyUpdated] = useState(false);
  const updatedMessageTimerRef = useRef(null);

  useEffect(() => {
    api
      .get("/knowledge/power-bi-config")
      .then((res) => setConfiguration(res.data))
      .catch(() => setError("Não foi possível carregar a configuração do Power BI."))
      .finally(() => setLoading(false));
  }, []);

  const canDisplayBi = Boolean(
    configuration?.enabled && configuration?.hasAccess && configuration?.url
  );

  useEffect(() => {
    if (!canDisplayBi) return undefined;

    let nextRefreshAt = Date.now() + BI_REFRESH_INTERVAL_MS;
    const initialTime = Date.now();
    setLastUpdatedAt(initialTime);
    setRemainingSeconds(BI_REFRESH_INTERVAL_MS / 1000);

    const refreshBi = () => {
      const refreshedAt = Date.now();
      nextRefreshAt = refreshedAt + BI_REFRESH_INTERVAL_MS;
      setRefreshToken(refreshedAt);
      setLastUpdatedAt(refreshedAt);
      setRemainingSeconds(BI_REFRESH_INTERVAL_MS / 1000);
      setRecentlyUpdated(true);

      if (updatedMessageTimerRef.current) {
        window.clearTimeout(updatedMessageTimerRef.current);
      }
      updatedMessageTimerRef.current = window.setTimeout(() => {
        setRecentlyUpdated(false);
        updatedMessageTimerRef.current = null;
      }, BI_UPDATED_MESSAGE_MS);
    };

    const updateCountdown = () => {
      const now = Date.now();
      if (now >= nextRefreshAt) {
        refreshBi();
        return;
      }
      setRemainingSeconds(Math.ceil((nextRefreshAt - now) / 1000));
    };

    const countdownTimer = window.setInterval(updateCountdown, 1000);

    return () => {
      window.clearInterval(countdownTimer);
      if (updatedMessageTimerRef.current) {
        window.clearTimeout(updatedMessageTimerRef.current);
        updatedMessageTimerRef.current = null;
      }
    };
  }, [canDisplayBi, configuration?.url]);

  const iframeUrl = useMemo(
    () => addRefreshParameter(configuration?.url || "", refreshToken),
    [configuration?.url, refreshToken]
  );

  if (loading) {
    return <div className="app-loader"><div className="app-loader__card">Carregando Power BI...</div></div>;
  }

  if (error) {
    return <SystemNotification variant="error">{error}</SystemNotification>;
  }

  if (!canDisplayBi) {
    return (
      <section className="power-bi-unavailable">
        <img src="/icon-power-bi.svg" alt="" />
        <h1>Power BI indisponível</h1>
        <p>Seu usuário não possui acesso a este relatório ou o recurso está desabilitado.</p>
      </section>
    );
  }

  return (
    <section className="power-bi-page">
      <div className="power-bi-frame">
        <iframe
          key={refreshToken}
          title="BI_OPERACIONAL_DQ"
          src={iframeUrl}
          allowFullScreen
        />
      </div>
      <aside
        className={`power-bi-refresh-status ${recentlyUpdated ? "power-bi-refresh-status--updated" : ""}`}
        aria-label="Status da atualização automática do BI"
      >
        {recentlyUpdated ? (
          <div className="power-bi-refresh-status__success" role="status" aria-live="polite">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m5 12 4 4L19 6" />
            </svg>
            <strong>BI atualizado</strong>
          </div>
        ) : (
          <>
            <div className="power-bi-refresh-status__heading">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 6v5h-5" />
                <path d="M4 18v-5h5" />
                <path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5" />
              </svg>
              <strong>Atualização automática a cada 5 min</strong>
            </div>
            <div className="power-bi-refresh-status__details">
              <span>Última atualização: <strong>{formatTime(lastUpdatedAt)}</strong></span>
              <span>Próxima atualização em: <strong>{formatCountdown(remainingSeconds)}</strong></span>
            </div>
          </>
        )}
      </aside>
    </section>
  );
}

export default PowerBI;
