# Stage 1: build frontend
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: backend + serve frontend
FROM python:3.11-slim
WORKDIR /app
RUN useradd -m -u 1000 appuser
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
RUN mkdir -p /app/frontend
COPY --from=frontend /app/frontend/dist /app/frontend/dist
ENV DATA_DIR=/data
EXPOSE 8000
USER 1000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
