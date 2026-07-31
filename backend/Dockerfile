# Stage 1: Build stage
FROM python:3.12-slim as builder

WORKDIR /build

# Install compilation dependencies for psycopg2 and other native extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Stage 2: Runtime stage
FROM python:3.12-slim as runner

WORKDIR /app

# Install runtime dependencies (e.g., PostgreSQL client libraries)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Copy backend code
COPY . /app

# Expose backend port
EXPOSE 8000

# Python specific configuration
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONPATH=/app

# Command to launch the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
