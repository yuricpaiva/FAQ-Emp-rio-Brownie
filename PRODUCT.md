# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Colaboradores do Empório Brownie usam o FAQ no trabalho diário para consultar conhecimento interno, acompanhar informações operacionais e acessar ferramentas da empresa. Usuários com perfil `creator` ou `admin` mantêm conteúdos e eventos.

## Product Purpose

Centralizar conhecimento, comunicados e ferramentas internas do Empório Brownie para que os colaboradores resolvam demandas recorrentes com autonomia.

## Operating Context

O produto é uma aplicação interna autenticada, usada em desktop e dispositivos móveis. A página inicial concentra descoberta e informações recentes; a navegação lateral organiza módulos de conhecimento, operação, análises, recursos e administração.

## Capabilities and Constraints

- O calendário semanal da página inicial deve ser visível a todos os usuários autenticados.
- A área de eventos apresenta um calendário mensal.
- Apenas usuários `creator` e `admin` podem criar, editar ou excluir eventos.
- Eventos têm título, descrição, data inicial, data final, horário principal e imagem opcional.
- Eventos podem incluir todos os usuários ou participantes específicos pesquisados e selecionados no cadastro.
- Administradores visualizam todos os eventos; demais usuários visualizam eventos gerais, eventos em que participam e, no caso de criadores, os próprios eventos.
- Eventos podem ser únicos, durar vários dias ou repetir diariamente, semanalmente ou mensalmente até uma data definida.
- O sistema usa React/Vite no frontend, Express no backend, Prisma e SQLite.

## Brand Commitments

Preservar o nome Empório Brownie, o tom direto em português do Brasil e a identidade visual já estabelecida no FAQ.

## Evidence on Hand

O repositório contém a aplicação funcional, seus componentes, estilos, rotas, modelos de dados e ativos de marca. Não há conteúdo real de eventos fornecido; estados vazios devem ser honestos e não apresentar dados fictícios como produção.

## Product Principles

- Tornar informações importantes fáceis de encontrar no fluxo de trabalho diário.
- Manter tarefas administrativas claras e protegidas por perfil.
- Reaproveitar padrões do produto para reduzir aprendizado e inconsistências.
- Funcionar bem em telas grandes e pequenas.
