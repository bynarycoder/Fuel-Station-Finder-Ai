from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_read_root():
    """
    Test that the root endpoint returns a 200 status code and welcoming message.
    """
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "Fuel Station Finder AI" in data["message"]
    assert data["status"] == "healthy"

def test_health_check():
    """
    Test that the health check endpoint returns status 'ok'.
    """
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def _openapi_route(path):
    paths = app.openapi()["paths"]
    if path not in paths:
        raise AssertionError(f"route not exposed in OpenAPI schema: {path}")
    return paths[path]


def test_verify_route_is_registered():
    verify = _openapi_route("/api/v1/reports/{report_id}/verify")
    assert "post" in verify, "POST /api/v1/reports/{report_id}/verify must exist"
    diag = _openapi_route("/api/v1/ai/diagnostic")
    assert "get" in diag, "GET /api/v1/ai/diagnostic must exist"
