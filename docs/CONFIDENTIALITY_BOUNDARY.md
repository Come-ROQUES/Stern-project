# Confidentiality Boundary

Ce depot est volontairement isole de tout environnement proprietaire.

## Reutilise

- patterns generiques de structuration de code Python
- configuration typee
- separation claire entre market data, analytics, strategy, risk et UI
- utilitaires PnL generiques adaptes pour un contexte crypto public

## Explicitement exclus

- toute logique de strategie proprietaire issue d'un environnement prive
- toute integration IBKR, Oanda ou brokers prives
- bases SQLite, schemas canoniques et pipelines run-aware internes
- scripts d'exploitation de production
- secrets, credentials, endpoints internes, telemetry privee
- code de deploiement direct vers une infrastructure privee

## Regle

Le projet doit rester presentable comme un exercice personnel autonome,
inspire par une hygiene d'infrastructure serieuse, mais sans fuite
d'actifs confidentiels.
