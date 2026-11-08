FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd -u 10001 -m extractor && mkdir /data && chown extractor /data
COPY server.py feeds.py ./
USER extractor
CMD ["python", "server.py"]
