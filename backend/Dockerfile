FROM python:3.11-slim

WORKDIR /app

# System deps:
# - docker.io provides the docker CLI on Debian-based slim images
# - gcc/libpq-dev optional depending on psycopg2; you use psycopg2-binary so not required
RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (better layer caching)
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt \
    && pip install --no-cache-dir gunicorn

# Copy backend source
COPY . /app

EXPOSE 8000

# IMPORTANT: this assumes your Flask app instance is named `app` in app.py
CMD ["gunicorn", "--workers", "2", "--bind", "0.0.0.0:8000", "app:app"]
