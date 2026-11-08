FROM python:3.13-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server.py /app/server.py
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TMPDIR=/work HOME=/work
USER 10001:10001
CMD ["python", "/app/server.py"]
