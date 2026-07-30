import { useEffect, useMemo, useState } from "react";
import ParticipantAvatar from "../components/ParticipantAvatar";
import api from "../services/api";
import SystemNotification from "../components/SystemNotification";

const BAR_COLORS = ["#168847", "#f4c430", "#1769aa"];

function PoolRanking() {
  const [participants, setParticipants] = useState([]);
  const [poolEnabled, setPoolEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadRanking = async () => {
      try {
        const settings = await api.get("/knowledge/pool-settings");
        setPoolEnabled(settings.data.poolEnabled);

        if (!settings.data.poolEnabled) {
          setParticipants([]);
          return;
        }

        const rankingResponse = await api.get("/knowledge/pool-ranking");
        setParticipants(rankingResponse.data);
        setError("");
      } catch {
        setError("Não foi possível carregar o ranking do bolão.");
      } finally {
        setLoading(false);
      }
    };

    loadRanking();
  }, []);

  const ranking = useMemo(() => {
    let position = 0;
    let previousScore;

    return participants.map((participant) => {
      if (participant.score !== previousScore) {
        position += 1;
        previousScore = participant.score;
      }
      return { ...participant, position };
    });
  }, [participants]);

  const topScore = ranking.length
    ? Math.max(...ranking.map((participant) => participant.score))
    : 0;
  const chartMaxScore = Math.max(topScore, 1);
  const lastUpdatedAt = ranking.reduce((latest, participant) => {
    const updatedAt = new Date(participant.updatedAt);
    return updatedAt > latest ? updatedAt : latest;
  }, new Date(0));
  const hasUpdates = lastUpdatedAt.getTime() > 0;

  return (
    <section className="pool-ranking-page">
      <div className="pool-ranking-lights" aria-hidden="true" />

      <header className="pool-ranking-top">
        <h1 className="pool-ranking-title">Ranking do Bolão EB</h1>
        <div className="pool-ranking-stats">
          <div>
            <span>Participantes</span>
            <strong>{ranking.length}</strong>
          </div>
          <div>
            <span>Maior pontuação</span>
            <strong>{topScore}</strong>
          </div>
          <div>
            <span>Atualizado em</span>
            <strong>
              {hasUpdates
                ? lastUpdatedAt.toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "--"}
            </strong>
          </div>
        </div>
      </header>

      <section className="pool-ranking-board" aria-live="polite">
        {loading && <p className="empty-state">Carregando ranking...</p>}
        {error && <SystemNotification variant="error">{error}</SystemNotification>}
        {!loading && !error && !poolEnabled && (
          <div className="pool-ranking-disabled">
            <img src="/icon-ranking.svg" alt="" />
            <strong>Bolão da Copa indisponível</strong>
            <span>O ranking está temporariamente desabilitado.</span>
          </div>
        )}
        {!loading && !error && poolEnabled && !ranking.length && (
          <p className="empty-state">O ranking ainda não possui participantes.</p>
        )}

        {!loading && !error && poolEnabled && ranking.map((participant, index) => {
          const barHeight = participant.score === 0
            ? 0
            : Math.max((participant.score / chartMaxScore) * 100, 5);
          const isLeader = participant.score === topScore;

          return (
            <article
              className={`pool-ranking-column ${isLeader ? "pool-ranking-column--leader" : ""}`}
              key={participant.id}
            >
              <div className="pool-ranking-column__identity">
                <span className="pool-ranking-column__position">{participant.position}º</span>
                <div className="pool-ranking-column__avatar-wrap">
                  {isLeader && <span className="pool-ranking-column__crown" aria-label="Líder">♛</span>}
                  <ParticipantAvatar
                    name={participant.name}
                    photoUrl={participant.photoUrl}
                    className="pool-ranking-column__avatar"
                  />
                </div>
                <strong title={participant.name}>{participant.name}</strong>
                {isLeader && <span className="pool-ranking-column__leader-label">Líder da rodada</span>}
              </div>
              <div className="pool-ranking-column__plot">
                <span className="pool-ranking-column__score">
                  {participant.score} {participant.score === 1 ? "ponto" : "pontos"}
                </span>
                <div
                  className="pool-ranking-column__bar"
                  style={{
                    "--bar-height": `${barHeight}%`,
                    "--bar-delay": `${index * 160}ms`,
                    backgroundColor: isLeader ? "#f4c430" : BAR_COLORS[index % BAR_COLORS.length],
                  }}
                />
              </div>
            </article>
          );
        })}
      </section>
    </section>
  );
}

export default PoolRanking;
