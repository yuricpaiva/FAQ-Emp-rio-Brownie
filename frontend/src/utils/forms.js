import api from "../services/api";

export const roleLabels = { reader: "Leitor", creator: "Criador", store: "Loja", production_manager: "Gerente de produção", admin: "Administrador" };
export const statusLabels = { DRAFT: "Rascunho", PENDING_APPROVAL: "Aguardando aprovação", COMPLETED: "Concluído", APPROVED: "Aprovado", REJECTED: "Reprovado" };
export const questionTypeLabels = { TEXT: "Texto", NUMBER: "Número", BOOLEAN: "Sim/Não", SCORE: "Nota", PHOTO: "Foto" };
export const resultTypeLabels = { SIMPLE: "Simples", SCORE: "Pontuação" };

export function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function formatScore(value) {
  return value === null || value === undefined ? "-" : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

export function photoUrl(photoId) {
  const base = String(api.defaults.baseURL || "/api").replace(/\/$/, "");
  return `${base}/forms/photos/${photoId}`;
}

export function modelPayload(model) {
  return {
    name: model.name,
    description: model.description,
    active: model.active,
    resultType: model.resultType,
    scoreMin: model.scoreMin,
    scoreMax: model.scoreMax,
    scoreCalculationType: model.scoreCalculationType,
    requiresApproval: model.requiresApproval,
    requiresStore: Boolean(model.requiresStore),
    defaultObserverId: model.defaultObserverId || null,
    questions: model.questions.map(({ text, type, required, allowPhoto, photoRequired, allowObservation, weight }) => ({ text, type, required, allowPhoto: Boolean(allowPhoto || photoRequired || type === "PHOTO"), photoRequired, allowObservation: Boolean(allowObservation), weight })),
    permissions: {
      fillRoles: model.permissions.fill.roles,
      fillUserIds: model.permissions.fill.users.map((user) => user.id),
      approveRoles: model.permissions.approve.roles,
      approveUserIds: model.permissions.approve.users.map((user) => user.id),
    },
  };
}
