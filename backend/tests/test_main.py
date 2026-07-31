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
