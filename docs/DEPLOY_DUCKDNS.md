# Deployment DuckDNS

Objectif: exposer le dashboard sur Internet depuis ta VM, avec un sous-domaine
DuckDNS et un deploiement pilote par GitHub Actions.

## Architecture cible

```text
GitHub main
  -> GitHub Actions deploy
  -> SSH vers VM
  -> git pull du repo
  -> refresh .venv
  -> restart systemd
  -> nginx reverse proxy
  -> https://<subdomain>.duckdns.org
```

## 1. Creer le domaine DuckDNS

Exemple:

- sous-domaine: `stern-project`
- domaine final: `stern-project.duckdns.org`

Configurer le token DuckDNS dans ton compte et pointer le domaine vers l'IP
publique de la VM.

## 2. Ouvrir le service sur la VM

Sur la VM, le process Python ecoute localement sur `127.0.0.1:8015` via nginx.

Ports a autoriser:

- `80/tcp`
- `443/tcp`

## 3. Cloner le repo sur la VM

Chemin recommande:

```bash
sudo mkdir -p /opt/crypto-trading-desk-intern
sudo chown ubuntu:ubuntu /opt/crypto-trading-desk-intern
git clone https://github.com/Come-ROQUES/crypto-trading-desk-intern.git /opt/crypto-trading-desk-intern
cd /opt/crypto-trading-desk-intern
python3.11 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -e .
cp .env.example .env
```

## 4. Configurer les variables

Exemple de `.env` sur la VM:

```dotenv
CRYPTO_MM_DEBUG=false
CRYPTO_MM_HOST=127.0.0.1
CRYPTO_MM_PORT=8015
CRYPTO_MM_PRODUCT_ID=BTC-USD
CRYPTO_MM_WS_URL=wss://ws-feed.exchange.coinbase.com
CRYPTO_MM_INITIAL_CASH=1000000
CRYPTO_MM_MAX_NOTIONAL_EXPOSURE=1000000
CRYPTO_MM_MAX_LOSS=100000
CRYPTO_MM_BASE_QUOTE_SPREAD_BPS=8
CRYPTO_MM_ORDER_SIZE_BTC=0.10
CRYPTO_MM_POSITION_SKEW_BPS_PER_BTC=2
CRYPTO_MM_TRADE_HISTORY_LIMIT=200
```

## 5. Installer systemd

```bash
sudo cp deploy/crypto-mm.service /etc/systemd/system/crypto-mm.service
sudo systemctl daemon-reload
sudo systemctl enable crypto-mm
sudo systemctl start crypto-mm
```

## 6. Configurer nginx

Copier `deploy/nginx.conf` vers `/etc/nginx/sites-available/crypto-mm`, puis:

```bash
sudo ln -sf /etc/nginx/sites-available/crypto-mm /etc/nginx/sites-enabled/crypto-mm
sudo nginx -t
sudo systemctl reload nginx
```

## 7. Ajouter TLS

Option recommandee:

```bash
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <subdomain>.duckdns.org
```

## 8. Secrets GitHub a configurer

Dans `Settings > Secrets and variables > Actions`, ajouter:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_APP_DIR`
- `DEPLOY_BRANCH`
- `DEPLOY_PORT`
- `PUBLIC_DOMAIN`

Valeurs typiques:

- `DEPLOY_APP_DIR=/opt/crypto-trading-desk-intern`
- `DEPLOY_BRANCH=main`
- `DEPLOY_PORT=22`
- `PUBLIC_DOMAIN=stern-project.duckdns.org`

## 9. Strategie propre

- developper sur branches dediees
- PR vers `main`
- merge
- deploiement automatique par workflow GitHub
- prevoir `sudo` sans mot de passe pour `systemctl restart crypto-mm` depuis
  l'utilisateur de deploiement, sinon le job CI bloquera

## 10. Verification post-deploy

Depuis la VM:

```bash
systemctl status crypto-mm --no-pager
curl -s http://127.0.0.1:8015/api/state | python3 -m json.tool
sudo nginx -t
```

Depuis ton navigateur:

```text
https://<subdomain>.duckdns.org
```

## Notes

- commence en `private` tant que tu es en construction
- rends le repo `public` uniquement quand tu es certain qu'il ne contient plus
  aucun element confidentiel
- DuckDNS est parfait pour te differencier vite en entretien
- si tu veux une couche encore plus propre, on pourra ensuite ajouter un petit
  bandeau "internship project" et une page `About`
