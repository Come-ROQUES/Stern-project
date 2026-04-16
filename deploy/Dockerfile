FROM node:20-slim AS frontend-builder

WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM python:3.11-slim

WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
COPY frontend ./frontend
COPY --from=frontend-builder /frontend/dist ./frontend/dist

RUN pip install --no-cache-dir .

EXPOSE 8015

CMD ["python", "-m", "crypto_mm.main"]
