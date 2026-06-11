import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ParticipantAvatar from "../components/ParticipantAvatar";
import api from "../services/api";

function AdminPool() {
  const [participants, setParticipants] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [score, setScore] = useState("0");
  const [photo, setPhoto] = useState(null);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState("");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const loadParticipants = async ({ preserveMessage = false } = {}) => {
    try {
      const res = await api.get("/knowledge/pool-ranking");
      setParticipants(res.data);
      if (!preserveMessage) setMessage("");
    } catch {
      setMessage("Não foi possível carregar os participantes.");
    }
  };

  useEffect(() => {
    loadParticipants();
  }, []);

  useEffect(() => {
    if (!photo) {
      setPhotoPreviewUrl("");
      return undefined;
    }

    const previewUrl = URL.createObjectURL(photo);
    setPhotoPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [photo]);

  const resetForm = ({ preserveMessage = false } = {}) => {
    setEditingId(null);
    setName("");
    setScore("0");
    setPhoto(null);
    setCurrentPhotoUrl("");
    if (!preserveMessage) setMessage("");
  };

  const handleEdit = (participant) => {
    setEditingId(participant.id);
    setName(participant.name);
    setScore(String(participant.score));
    setCurrentPhotoUrl(participant.photoUrl || "");
    setPhoto(null);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const wasEditing = Boolean(editingId);

    try {
      let photoUrl = currentPhotoUrl;
      if (photo) {
        const formData = new FormData();
        formData.append("file", photo);
        const upload = await api.post("/admin/uploads", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        photoUrl = upload.data.url;
      }

      const payload = { name, score: Number(score), photoUrl };
      if (editingId) {
        await api.put(`/admin/pool-participants/${editingId}`, payload);
      } else {
        await api.post("/admin/pool-participants", payload);
      }

      resetForm({ preserveMessage: true });
      await loadParticipants({ preserveMessage: true });
      setMessage(wasEditing ? "Participante atualizado com sucesso." : "Participante cadastrado com sucesso.");
    } catch (err) {
      setMessage(err.response?.data?.error || "Não foi possível salvar o participante.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (participant) => {
    if (!window.confirm(`Deseja remover ${participant.name} do ranking?`)) return;

    try {
      await api.delete(`/admin/pool-participants/${participant.id}`);
      if (editingId === participant.id) resetForm();
      await loadParticipants();
    } catch (err) {
      setMessage(err.response?.data?.error || "Não foi possível remover o participante.");
    }
  };

  const messageIsSuccess = message.toLowerCase().includes("sucesso");

  return (
    <section className="page-stack admin-pool-page">
      <div className="section-heading section-heading--split">
        <div>
          <span className="eyebrow">Administração</span>
          <h1>Configuração do Bolão da Copa</h1>
          <p className="section-copy">Cadastre os colaboradores e mantenha as pontuações atualizadas.</p>
        </div>
        <Link to="/ranking-bolao" className="button button--ghost">Ver ranking</Link>
      </div>

      <div className="admin-pool-layout">
        <section className="surface-card admin-pool-form">
          <div className="section-heading">
            <div>
              <h2>{editingId ? "Editar participante" : "Novo participante"}</h2>
            </div>
            {editingId && (
              <button type="button" className="button button--ghost" onClick={() => resetForm()}>
                Cancelar edição
              </button>
            )}
          </div>

          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="form-grid__full">
              <span>Nome do colaborador</span>
              <input
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <label>
              <span>Pontuação</span>
              <input
                type="number"
                min="0"
                step="1"
                value={score}
                onChange={(event) => setScore(event.target.value)}
                required
              />
            </label>
            <label>
              <span>{editingId ? "Nova foto (opcional)" : "Foto (opcional)"}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => setPhoto(event.target.files?.[0] || null)}
              />
            </label>

            {(photo || currentPhotoUrl) && (
              <div className="form-grid__full admin-pool-photo-preview">
                {photo ? (
                  <img src={photoPreviewUrl} alt="Prévia da nova foto" />
                ) : (
                  <img src={currentPhotoUrl} alt="Foto atual do participante" />
                )}
                <span>{photo ? photo.name : "Foto atual"}</span>
              </div>
            )}

            {message && (
              <p className={`form-message ${messageIsSuccess ? "form-message--success" : "form-message--error"}`}>
                {message}
              </p>
            )}

            <div className="form-actions">
              <button type="submit" className="button" disabled={loading}>
                {loading ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar participante"}
              </button>
            </div>
          </form>
        </section>

        <section className="surface-card admin-pool-list">
          <div className="section-heading">
            <div>
              <h2>Participantes</h2>
              <p className="section-copy">{participants.length} cadastrados</p>
            </div>
          </div>

          <div className="admin-pool-list__items">
            {participants.map((participant) => (
              <article className="admin-pool-item" key={participant.id}>
                <ParticipantAvatar
                  name={participant.name}
                  photoUrl={participant.photoUrl}
                  className="admin-pool-item__avatar"
                />
                <div>
                  <strong>{participant.name}</strong>
                  <span>{participant.score} {participant.score === 1 ? "ponto" : "pontos"}</span>
                </div>
                <div className="admin-pool-item__actions">
                  <button type="button" className="button button--ghost" onClick={() => handleEdit(participant)}>
                    Editar
                  </button>
                  <button type="button" className="button button--danger" onClick={() => handleDelete(participant)}>
                    Remover
                  </button>
                </div>
              </article>
            ))}
            {!participants.length && <p className="empty-state">Nenhum participante cadastrado.</p>}
          </div>
        </section>
      </div>
    </section>
  );
}

export default AdminPool;
