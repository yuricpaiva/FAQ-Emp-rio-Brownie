import { useEffect, useState } from "react";
import api from "../services/api";

function PowerBI() {
  const [configuration, setConfiguration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/knowledge/power-bi-config")
      .then((res) => setConfiguration(res.data))
      .catch(() => setError("Não foi possível carregar a configuração do Power BI."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="app-loader"><div className="app-loader__card">Carregando Power BI...</div></div>;
  }

  if (error) {
    return <p className="form-message form-message--error">{error}</p>;
  }

  if (!configuration?.enabled || !configuration?.hasAccess || !configuration?.url) {
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
      <div className="power-bi-stage">
        <h1 className="power-bi-title">De olho no resultado!</h1>
        <div className="power-bi-frame">
          <iframe
            title="BI_OPERACIONAL_DQ"
            src={configuration.url}
            allowFullScreen
          />
        </div>
        <img
          src="/power-bi-presenter.png"
          alt="Gerente financeira apresentando o painel de resultados"
          className="power-bi-presenter"
        />
      </div>
    </section>
  );
}

export default PowerBI;
