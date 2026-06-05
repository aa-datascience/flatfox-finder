FROM python:3.13-slim

WORKDIR /worker

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
COPY pyproject.toml .

ENV PYTHONPATH=/worker/src
ENV PYTHONUNBUFFERED=1

CMD ["python", "-m", "flatfox_worker.main"]
