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


def test_verify_route_is_registered():
    """
    Regression guard for the production 404: the report verification route must
    actually be registered under /api/v1 with POST, and the diagnostic must be
    registered under /api/v1/ai/diagnostic. If this fails, the backend that is
    deployed does NOT match this source (a stale deploy, not a code bug).
    """
    from fastapi.routing import APIRoute

    routes = {(r.path, tuple(sorted(r.methods or []))) for r in app.routes if isinstance(r, APIRoute)}

    assert ("/api/v1/reports/{report_id}/verify", ("POST",)) in routes
    assert ("/api/v1/ai/diagnostic", ("GET",)) in routes
