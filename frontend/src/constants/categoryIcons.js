export const categoryIcons = {
  operacao: "/icon-operacao.svg",
  "gente-gestao": "/icon-gente-gestao.svg",
  ti: "/icon-ti.svg",
  "controladoria-financeiro": "/icon-controladoria-financeiro.svg",
  comercial: "/icon-comercial.svg",
  marketing: "/icon-marketing.svg",
  "producao-expedicao": "/icon-producao-expedicao.svg",
  default: "/icon-ti.svg",
};

export function getCategoryIcon(iconKey) {
  return categoryIcons[iconKey] || categoryIcons.default;
}
