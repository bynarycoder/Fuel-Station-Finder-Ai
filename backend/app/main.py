from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Fuel Station Finder AI - 3MTT Capstone Project Backend API",
    version="1.0.0",
    openapi_url="/api/v1/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS Middleware to allow requests from the frontend
if settings.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

@app.get("/", tags=["General"])
async def root():
    """
    Root API endpoint returning basic project status and info.
    """
    return {
        "message": f"Welcome to the {settings.PROJECT_NAME} API",
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
        "api_version": "v1.0.0"
    }

@app.get("/health", tags=["General"])
async def health_check():
    """
    Simple health check endpoint for monitoring uptime and availability.
    """
    return {
        "status": "ok",
        "project": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT
    }
