"""REST API smoke tests (uses the real engine)."""

import pytest
from fastapi.testclient import TestClient

from pob2 import workspaces
from pob2.web.app import create_app

pytestmark = pytest.mark.engine


@pytest.fixture(scope="module")
def client(service):
    workspaces.registry._services[workspaces.DEFAULT] = service
    with TestClient(create_app(with_mcp=False)) as c:
        yield c
    workspaces.registry._services.pop(workspaces.DEFAULT, None)


def test_build_flow(client):
    r = client.post("/api/build/new", json={"className": "Ranger", "level": 50})
    assert r.status_code == 200 and r.json()["className"] == "Ranger"
    rev = client.get("/api/revision").json()["revision"]
    assert client.post("/api/skills", json={"gems": ["Lightning Arrow"]}).status_code == 200
    assert client.get("/api/revision").json()["revision"] > rev
    overview = client.get("/api/build").json()
    assert overview["info"]["level"] == 50
    assert overview["skills"][0]["gems"][0]["name"] == "Lightning Arrow"


def test_version_endpoint(client):
    info = client.get("/api/version").json()
    assert info["version"] and "commit" in info and "built" in info
    assert client.get("/api/health").json()["version"] == info["version"]


def test_errors_map_to_http(client):
    r = client.post("/api/items/parse", json={"text": "garbage"})
    assert r.status_code == 400 and "parse" in r.json()["error"]
    r = client.post("/api/build/import", json={"source": "not a code"})
    assert r.status_code == 400
