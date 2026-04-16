# Confidentiality Boundary

Ce depot est volontairement separe de FRACTAL.

## Reutilise

- patterns generiques de structuration de code Python
- configuration typee
- separation claire entre market data, analytics, strategy, risk et UI
- utilitaires PnL generiques adaptes pour un contexte crypto public

## Explicitement exclus

- toute logique de strategie proprietaire FRACTAL
- toute integration IBKR, Oanda ou brokers prives
- bases SQLite, schemas canoniques et pipelines run-aware internes
- scripts d'exploitation production FRACTAL
- secrets, credentials, endpoints internes, telemetry privee
- code de deploiement direct vers la VM FRACTAL

## Regle

Le projet doit rester presentable comme un exercice personnel autonome,
inspire par une hygiene d'infrastructure serieuse, mais sans fuite
d'actifs confidentiels.

