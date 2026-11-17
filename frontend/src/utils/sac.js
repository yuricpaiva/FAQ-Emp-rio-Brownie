export const sacStatusLabels = {
  RASCUNHO: "Rascunho",
  PENDENTE_AUDITORIA: "Pendente de auditoria",
  DEVOLVIDA: "Devolvida",
  AUDITADA: "Auditada"
};

export const sacHistoryLabels = {
  CRIADA: "Reclamação criada",
  EDITADA: "Dados atualizados",
  ENVIADA: "Enviada para auditoria",
  DEVOLVIDA: "Devolvida para correção",
  REENVIADA: "Reenviada para auditoria",
  AUDITADA: "Auditoria concluída"
};

export const sacOptionCategories = [
  ["PROBLEM_TYPE", "Tipos de problema"],
  ["LOCATION", "Locais"],
  ["STORE", "Lojas"],
  ["OCCURRENCE_STATUS", "Status da ocorrência"],
  ["COMPLAINT_TYPE", "Tipos de reclamação"]
];

export function formatSacDate(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function formatSacDateTime(value) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}
